"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { verifyReceipt, validateAdminInscription, importStudentsCsv } from "@/lib/students";
import {
  hasTaskPermission,
  canManageStudent,
  PERMISSION_DENIED_MESSAGE,
  FORMATION_DENIED_MESSAGE,
  type TaskKey,
} from "@/lib/permissions";

export type ActionState = { success?: string; error?: string };

// Chaque action revérifie le rôle ET la tâche : une Server Action reste
// appelable par POST direct, et deux agents n'ont pas forcément les mêmes droits
async function requireAgentAdmin(task: TaskKey) {
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) {
    return null;
  }
  if (!(await hasTaskPermission(session.sub, session.role, task))) return "denied";
  return session;
}

export async function verifyReceiptAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAgentAdmin("verification_paiement");
  if (!session) return { error: "Accès refusé." };
  if (session === "denied") return { error: PERMISSION_DENIED_MESSAGE };

  const studentId = String(formData.get("studentId") ?? "");
  const receiptNumber = String(formData.get("receiptNumber") ?? "").trim();
  if (!studentId || !receiptNumber) {
    return { error: "Numéro de reçu obligatoire." };
  }
  if (!(await canManageStudent(session.sub, session.role, studentId))) {
    return { error: FORMATION_DENIED_MESSAGE };
  }

  try {
    const student = await verifyReceipt(studentId, receiptNumber, session.sub);
    revalidatePath("/agent-admin");
    return { success: `Reçu ${receiptNumber} vérifié pour ${student.fullName}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la vérification." };
  }
}

export async function validateAdminAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAgentAdmin("verification_paiement");
  if (!session) return { error: "Accès refusé." };
  if (session === "denied") return { error: PERMISSION_DENIED_MESSAGE };

  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) return { error: "Dossier manquant." };
  if (!(await canManageStudent(session.sub, session.role, studentId))) {
    return { error: FORMATION_DENIED_MESSAGE };
  }

  try {
    const student = await validateAdminInscription(studentId, session.sub);
    revalidatePath("/agent-admin");
    return { success: `Inscription administrative validée pour ${student.fullName}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la validation." };
  }
}

export async function importCsvAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAgentAdmin("csv");
  if (!session) return { error: "Accès refusé." };
  if (session === "denied") return { error: PERMISSION_DENIED_MESSAGE };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisissez un fichier CSV." };
  }

  const csv = await file.text();
  const result = await importStudentsCsv(csv, session.sub);

  revalidatePath("/agent-admin");
  const summary = `Import terminé : ${result.created} dossier(s) créé(s), ${result.updated} mis à jour.`;
  if (result.errors.length > 0) {
    return { error: `${summary} ${result.errors.length} erreur(s) : ${result.errors.slice(0, 3).join(" ")}` };
  }
  return { success: summary };
}
