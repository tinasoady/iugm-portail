"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { reenrollStudent } from "@/lib/students";
import {
  hasTaskPermission,
  canManageStudent,
  PERMISSION_DENIED_MESSAGE,
  FORMATION_DENIED_MESSAGE,
} from "@/lib/permissions";

export type ReenrollState = { success?: string; error?: string };

export async function reenrollAction(
  _prev: ReenrollState,
  formData: FormData,
): Promise<ReenrollState> {
  // Une Server Action reste appelable par POST direct : on revérifie le rôle et la tâche
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) {
    return { error: "Accès refusé." };
  }
  if (!(await hasTaskPermission(session.sub, session.role, "reinscription"))) {
    return { error: PERMISSION_DENIED_MESSAGE };
  }

  const studentId = String(formData.get("studentId") ?? "");
  const academicYear = String(formData.get("academicYear") ?? "").trim();
  const level = String(formData.get("level") ?? "").trim();
  if (!studentId || !academicYear) {
    return { error: "Année universitaire obligatoire." };
  }
  if (!(await canManageStudent(session.sub, session.role, studentId))) {
    return { error: FORMATION_DENIED_MESSAGE };
  }

  try {
    const student = await reenrollStudent(studentId, { academicYear, level: level || null }, session.sub);
    revalidatePath("/agent-admin/reinscription");
    revalidatePath("/agent-admin");
    return {
      success: `${student.fullName} réinscrit(e) pour ${academicYear} — en attente du paiement de l'écolage.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la réinscription." };
  }
}
