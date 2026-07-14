"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { validatePedagoInscription, assignAcademicResult } from "@/lib/students";

// Garde commune : une Server Action reste appelable par POST direct
async function requireAgentPedago() {
  const session = await getSession();
  if (!session || !["AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) {
    return null;
  }
  return session;
}

export type ValidateState = {
  success?: string;
  error?: string;
  // Identifiants générés, affichés une seule fois pour être transmis à l'étudiant
  credentials?: { email: string; password: string };
};

export async function validatePedagoAction(
  _prev: ValidateState,
  formData: FormData,
): Promise<ValidateState> {
  const session = await requireAgentPedago();
  if (!session) return { error: "Accès refusé." };

  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) return { error: "Dossier manquant." };

  try {
    const { student, email, password } = await validatePedagoInscription(studentId, session.sub);
    revalidatePath("/agent-pedagogique");
    return {
      success: `Inscription validée pour ${student.fullName}. Compte étudiant créé.`,
      credentials: { email, password },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la validation." };
  }
}

export type AssignResultState = { success?: string; error?: string };

export async function assignResultAction(
  _prev: AssignResultState,
  formData: FormData,
): Promise<AssignResultState> {
  const session = await requireAgentPedago();
  if (!session) return { error: "Accès refusé." };

  const studentId = String(formData.get("studentId") ?? "");
  const academicYear = String(formData.get("academicYear") ?? "").trim();
  const semester = String(formData.get("semester") ?? "").trim();
  const average = Number(String(formData.get("average") ?? "").replace(",", "."));

  if (!studentId || !academicYear || !semester) {
    return { error: "Année, semestre et moyenne sont obligatoires." };
  }

  try {
    const result = await assignAcademicResult(
      { studentId, academicYear, semester, average },
      session.sub,
    );
    revalidatePath("/agent-pedagogique");
    return { success: `Résultat enregistré : ${result.average}/20 — mention calculée automatiquement.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." };
  }
}

// Journalise l'impression du reçu (appelée au clic sur « Imprimer »)
export async function logReceiptPrintAction(matricule: string, fullName: string) {
  const session = await requireAgentPedago();
  if (!session) return;
  await logAction(
    "INSCRIPTION_RECEIPT_PRINTED",
    `Reçu d'inscription imprimé pour ${fullName} (${matricule})`,
    session.sub,
  );
}
