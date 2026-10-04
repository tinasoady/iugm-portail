"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { generatePassword, generateInitialPassword } from "@/lib/students";
import { TASKS, tasksForRole, type TaskKey } from "@/lib/permissions";
import { encryptSecret } from "@/lib/secret-crypto";
import { FORMATIONS } from "@/lib/formations";
import { disableTwoFactor } from "@/lib/two-factor";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { getTrustedAppOrigin } from "@/lib/url";
import { resendInvitation, cancelInvitation } from "@/lib/invitations";
import { maskEmail } from "@/lib/recovery-email";

export type PermissionState = {
  success?: string;
  error?: string;
  // Mot de passe temporaire après réinitialisation, affiché une seule fois
  tempPassword?: string;
};

const ROLES = ["SUPERADMIN", "AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "ETUDIANT"] as const;

async function requireSuperadmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") return null;
  return session;
}

// Garde-fou : il doit toujours rester au moins un superadmin actif
async function isLastActiveSuperadmin(userId: string): Promise<boolean> {
  const others = await prisma.user.count({
    where: { role: "SUPERADMIN", active: true, id: { not: userId } },
  });
  return others === 0;
}

export async function updateRoleAction(
  _prev: PermissionState,
  formData: FormData,
): Promise<PermissionState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || !ROLES.includes(role as (typeof ROLES)[number])) {
    return { error: "Rôle invalide." };
  }
  if (userId === session.sub) {
    return { error: "Vous ne pouvez pas modifier votre propre rôle." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Utilisateur introuvable." };
  if (user.role === role) return { success: "Rôle inchangé." };
  if (user.role === "SUPERADMIN" && (await isLastActiveSuperadmin(userId))) {
    return { error: "Impossible : c'est le dernier superadmin actif." };
  }

  await prisma.user.update({ where: { id: userId }, data: { role: role as (typeof ROLES)[number] } });
  await logAction(
    "PERMISSION_UPDATED",
    `Rôle de ${user.email} : ${user.role} → ${role}`,
    session.sub,
  );
  revalidatePath("/admin/permissions");
  return { success: `Rôle de ${user.email} mis à jour.` };
}

export async function toggleActiveAction(
  _prev: PermissionState,
  formData: FormData,
): Promise<PermissionState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Utilisateur manquant." };
  if (userId === session.sub) {
    return { error: "Vous ne pouvez pas désactiver votre propre compte." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Utilisateur introuvable." };
  if (user.pendingActivation) {
    return { error: "Ce compte n'est pas encore activé : renvoyez ou annulez l'invitation." };
  }
  if (user.active && user.role === "SUPERADMIN" && (await isLastActiveSuperadmin(userId))) {
    return { error: "Impossible : c'est le dernier superadmin actif." };
  }

  await prisma.user.update({ where: { id: userId }, data: { active: !user.active } });
  await logAction(
    "PERMISSION_UPDATED",
    `Compte ${user.email} ${user.active ? "désactivé" : "réactivé"}`,
    session.sub,
  );
  revalidatePath("/admin/permissions");
  return { success: `Compte ${user.active ? "désactivé" : "réactivé"}.` };
}

export async function resetPasswordAction(
  _prev: PermissionState,
  formData: FormData,
): Promise<PermissionState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Utilisateur manquant." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentFile: { select: { id: true, matricule: true } } },
  });
  if (!user) return { error: "Utilisateur introuvable." };
  if (user.pendingActivation) {
    return {
      error: "Ce compte n'est pas encore activé : la personne choisira son mot de passe via le lien d'invitation (vous pouvez le renvoyer).",
    };
  }

  // Étudiant : matricule + suffixe aléatoire (même format qu'à l'inscription,
  // jamais le matricule seul) ; personnel : mot de passe temporaire aléatoire.
  // Dans les deux cas, affiché une seule fois et changement forcé à la reconnexion.
  const tempPassword = user.studentFile
    ? generateInitialPassword(user.studentFile.matricule)
    : generatePassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  // Les deux écritures (compte + dossier étudiant) doivent réussir ensemble
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      // sessionsValidAfter : les sessions ouvertes avec l'ancien mot de passe sont fermées
      data: { passwordHash, mustChangePassword: true, sessionsValidAfter: new Date() },
    });
    if (user.studentFile) {
      await tx.student.update({
        where: { id: user.studentFile.id },
        // Chiffré en base (voir lib/secret-crypto.ts), comme à l'inscription
        data: { initialPassword: encryptSecret(tempPassword) },
      });
    }
  });

  await logAction("PASSWORD_RESET", `Mot de passe réinitialisé pour ${user.email}`, session.sub);
  revalidatePath("/admin/permissions");
  return {
    success: `Mot de passe de ${user.email} réinitialisé (changement obligatoire à la prochaine connexion).`,
    tempPassword,
  };
}

// Désactive le second facteur d'un compte (téléphone perdu, application
// supprimée). L'intéressé se reconnecte avec son seul mot de passe et peut en
// reconfigurer un depuis Mon compte. Toute session ouverte est fermée : la
// réinitialisation est souvent la conséquence d'un appareil perdu ou volé.
export async function resetTwoFactorAction(
  _prev: PermissionState,
  formData: FormData,
): Promise<PermissionState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Utilisateur manquant." };
  if (userId === session.sub) {
    return { error: "Désactivez votre propre double authentification depuis Mon compte." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, totpEnabled: true },
  });
  if (!user) return { error: "Utilisateur introuvable." };
  if (!user.totpEnabled) return { error: "La double authentification n'est pas activée pour ce compte." };

  await disableTwoFactor(userId);
  await prisma.user.update({ where: { id: userId }, data: { sessionsValidAfter: new Date() } });
  await logAction("TWO_FACTOR_RESET", `Double authentification réinitialisée pour ${user.email}`, session.sub);
  revalidatePath("/admin/permissions");
  return { success: `Double authentification de ${user.email} désactivée.` };
}

// Enregistre la fonction (poste) et les tâches autorisées d'un agent
export async function updateTasksAction(
  _prev: PermissionState,
  formData: FormData,
): Promise<PermissionState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const userId = String(formData.get("userId") ?? "");
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const formationRaw = String(formData.get("formation") ?? "").trim();
  if (!userId) return { error: "Utilisateur manquant." };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Utilisateur introuvable." };
  if (!["AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE"].includes(user.role)) {
    return { error: "Les tâches ne s'appliquent qu'aux agents." };
  }

  // Formation affectée : doit exister au catalogue (vide = toutes les formations)
  const formation = FORMATIONS.some((f) => f.label === formationRaw) ? formationRaw : null;

  // Ne conserve que les tâches cochées ET compatibles avec le rôle de l'agent
  const allowed = tasksForRole(user.role);
  const permissions = allowed.filter((task) => formData.get(`task_${task}`) === "on");

  await prisma.user.update({
    where: { id: userId },
    data: { permissions, jobTitle: jobTitle || null, formation },
  });
  await logAction(
    "PERMISSION_UPDATED",
    `Tâches de ${user.email}${jobTitle ? ` (${jobTitle})` : ""}${formation ? ` — formation ${formation}` : " — toutes formations"} : ${
      permissions.length > 0 ? permissions.map((t) => TASKS[t as TaskKey].label).join(" ; ") : "aucune"
    }`,
    session.sub,
  );
  revalidatePath("/admin/permissions");
  return { success: `Permissions de ${user.email} enregistrées (${permissions.length} tâche(s)).` };
}

// Renvoi du lien d'activation d'un compte du personnel pas encore activé
export async function resendInvitationAction(
  _prev: PermissionState,
  formData: FormData,
): Promise<PermissionState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Utilisateur manquant." };

  const limit = checkActionRateLimit(`invite:${session.sub}`, 15);
  if (limit.limited) {
    return { error: `Trop d'invitations récentes. Réessayez dans ${limit.retryAfterMinutes} minutes.` };
  }

  const result = await resendInvitation({
    actorId: session.sub,
    userId,
    email: String(formData.get("email") ?? "") || undefined,
    origin: await getTrustedAppOrigin().catch(() => null),
  });
  if (!result.ok) return { error: result.hint ? `${result.error} ${result.hint}` : result.error };

  revalidatePath("/admin/permissions");
  return { success: `Invitation renvoyée à ${maskEmail(result.sentTo)} (valable 72 h ; le lien précédent ne fonctionne plus).` };
}

// Annulation d'une invitation : supprime le compte jamais activé
export async function cancelInvitationAction(
  _prev: PermissionState,
  formData: FormData,
): Promise<PermissionState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Utilisateur manquant." };

  const result = await cancelInvitation(session.sub, userId);
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/permissions");
  return { success: "Invitation annulée." };
}

// Suppression définitive d'un compte utilisateur
export async function deleteUserAction(
  _prev: PermissionState,
  formData: FormData,
): Promise<PermissionState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Utilisateur manquant." };
  if (userId === session.sub) {
    return { error: "Vous ne pouvez pas supprimer votre propre compte." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentFile: { select: { matricule: true } } },
  });
  if (!user) return { error: "Utilisateur introuvable." };
  if (user.role === "SUPERADMIN" && (await isLastActiveSuperadmin(userId))) {
    return { error: "Impossible : c'est le dernier superadmin actif." };
  }
  if (user.studentFile) {
    return {
      error: `Ce compte est lié au dossier étudiant ${user.studentFile.matricule} : supprimez le dossier depuis la Liste étudiants (le compte sera supprimé avec).`,
    };
  }

  await prisma.user.delete({ where: { id: userId } });
  await logAction("USER_DELETED", `Compte ${user.email} (${user.role}) supprimé`, session.sub);
  revalidatePath("/admin/permissions");
  return { success: `Compte ${user.email} supprimé.` };
}
