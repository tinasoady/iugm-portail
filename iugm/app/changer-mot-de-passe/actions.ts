"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

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
  const session = await getSession();
  if (!session) return { error: "Session expirée : reconnectez-vous." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!currentPassword || !newPassword || !confirm) {
    return { error: "Tous les champs sont obligatoires." };
  }
  if (newPassword.length < 8) {
    return { error: "Le nouveau mot de passe doit contenir au moins 8 caractères." };
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

  // Un étudiant ne doit pas reprendre son matricule (mot de passe initial prévisible)
  const studentFile = await prisma.student.findFirst({ where: { accountId: user.id } });
  if (studentFile && newPassword === studentFile.matricule) {
    return { error: "Le nouveau mot de passe ne doit pas être votre numéro matricule." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  // Le mot de passe initial imprimé n'est plus valable : on l'efface du dossier
  if (studentFile) {
    await prisma.student.update({
      where: { id: studentFile.id },
      data: { initialPassword: null },
    });
  }

  await logAction("PASSWORD_CHANGED", `Mot de passe changé par ${user.email}`, user.id);

  redirect(HOME_BY_ROLE[user.role] ?? "/");
}
