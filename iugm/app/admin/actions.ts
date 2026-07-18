"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { tasksForRole } from "@/lib/permissions";

const ROLES = ["SUPERADMIN", "AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "ETUDIANT"] as const;
type RoleValue = (typeof ROLES)[number];

export type CreateUserState = {
  success?: string;
  error?: string;
};

export async function createUser(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  // Toute Server Action est appelable par requête POST directe :
  // on revérifie systématiquement l'authentification et le rôle.
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") {
    return { error: "Accès refusé : réservé au Superadmin." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !fullName || !role || !password) {
    return { error: "Tous les champs sont obligatoires." };
  }
  if (!ROLES.includes(role as RoleValue)) {
    return { error: "Rôle invalide." };
  }
  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: `Un compte existe déjà avec l'email ${email}.` };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      role: role as RoleValue,
      passwordHash,
      // Un nouvel agent reçoit toutes les tâches de son rôle par défaut ;
      // le superadmin peut ensuite les restreindre depuis la page Permissions
      permissions: tasksForRole(role),
    },
  });

  await logAction("USER_CREATED", `Compte ${user.email} créé avec le rôle ${user.role}`, session.sub);

  revalidatePath("/admin");
  return { success: `Compte ${user.email} (${user.role}) créé avec succès.` };
}
