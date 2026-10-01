"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { validatePasswordStrength } from "@/lib/password-policy";

export type ChangePasswordState = { error?: string };

const HOME_BY_ROLE: Record<string, string> = {
  SUPERADMIN: "/admin",
  AGENT_ADMINISTRATION: "/agent-admin",
  AGENT_PEDAGOGIQUE: "/agent-pedagogique",
  ETUDIANT: "/mon-profil",
};

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  // Ce compte peut être soumis au changement obligatoire : c'est ici qu'il s'en acquitte
  const session = await getSession({ allowPasswordChange: true });
  if (!session) return { error: "Session expirée : reconnectez-vous." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!currentPassword || !newPassword || !confirm) {
    return { error: "Tous les champs sont obligatoires." };
  }
  if (newPassword !== confirm) {
    return { error: "La confirmation ne correspond pas au nouveau mot de passe." };
  }
  if (newPassword === currentPassword) {
    return { error: "Le nouveau mot de passe doit être différent de l'actuel." };
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) return { error: "Compte introuvable." };

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return { error: "Mot de passe actuel incorrect." };

  // Un étudiant ne doit pas choisir son matricule seul (public, donc prévisible)
  const studentFile = await prisma.student.findFirst({ where: { accountId: user.id } });
  const weakness = validatePasswordStrength(newPassword, {
    email: user.email,
    matricule: studentFile?.matricule,
  });
  if (weakness) return { error: weakness };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  // Les deux écritures (compte + dossier étudiant) doivent réussir ensemble
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      // sessionsValidAfter : toute autre session ouverte avec l'ancien mot de
      // passe (appareil volé, cookie copié) est fermée. La session courante est
      // réémise juste après.
      data: { passwordHash, mustChangePassword: false, sessionsValidAfter: new Date() },
    });
    // Le mot de passe initial imprimé n'est plus valable : on l'efface du dossier
    if (studentFile) {
      await tx.student.update({
        where: { id: studentFile.id },
        data: { initialPassword: null },
      });
    }
  });

  await logAction("PASSWORD_CHANGED", `Mot de passe changé par ${user.email}`, user.id);

  // Réémission de la session courante (sans la contrainte de changement
  // obligatoire), puisque sessionsValidAfter vient de fermer l'ancienne.
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    createSessionToken({ sub: user.id, email: user.email, role: user.role }),
    sessionCookieOptions(),
  );

  redirect(HOME_BY_ROLE[user.role] ?? "/");
}
