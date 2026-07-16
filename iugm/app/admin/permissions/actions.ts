"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { generatePassword } from "@/lib/students";

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

  // Étudiant : retour au matricule (cohérent avec le reçu d'inscription) ;
  // personnel : mot de passe temporaire aléatoire, affiché une seule fois
  const tempPassword = user.studentFile?.matricule ?? generatePassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  });
  if (user.studentFile) {
    await prisma.student.update({
      where: { id: user.studentFile.id },
      data: { initialPassword: tempPassword },
    });
  }

  await logAction("PASSWORD_RESET", `Mot de passe réinitialisé pour ${user.email}`, session.sub);
  revalidatePath("/admin/permissions");
  return {
    success: `Mot de passe de ${user.email} réinitialisé (changement obligatoire à la prochaine connexion).`,
    tempPassword,
  };
}
