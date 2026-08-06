"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import {
  recordEcolagePayment,
  verifyRegistrationPayment,
  validateAdminInscription,
  importStudentsCsv,
  type EcolagePaymentTypeValue,
} from "@/lib/students";
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

// Seule la 2e tranche (versement en cours d'année, hors inscription) passe
// encore par cette action générique — le versement à l'inscription (1ère
// tranche ou totalité) est désormais géré par verifyRegistrationPaymentAction
// ci-dessous, avec un montant saisi par l'agent plutôt que calculé.
const VALID_PAYMENT_TYPES: EcolagePaymentTypeValue[] = ["TRANCHE_S2"];

export async function recordEcolagePaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAgentAdmin("verification_paiement");
  if (!session) return { error: "Accès refusé." };
  if (session === "denied") return { error: PERMISSION_DENIED_MESSAGE };

  const studentId = String(formData.get("studentId") ?? "");
  const receiptNumber = String(formData.get("receiptNumber") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  if (!studentId || !receiptNumber) {
    return { error: "Numéro de reçu obligatoire." };
  }
  if (!VALID_PAYMENT_TYPES.includes(type as EcolagePaymentTypeValue)) {
    return { error: "Type de versement invalide." };
  }
  if (!(await canManageStudent(session.sub, session.role, studentId))) {
    return { error: FORMATION_DENIED_MESSAGE };
  }

  // Montant réellement versé pour ce solde (voir la note sur amountDue dans
  // lib/students.ts : le reste dû peut différer d'une simple moitié du tarif
  // annuel dès que le premier versement a dépassé le minimum requis).
  // Optionnel : sans montant saisi, recordEcolagePayment retombe sur son
  // calcul par défaut.
  const amountRaw = String(formData.get("amount") ?? "").trim();
  let amount: number | undefined;
  if (amountRaw) {
    amount = Number(amountRaw.replace(/\s/g, ""));
    if (!Number.isInteger(amount) || amount < 0) {
      return { error: "Montant invalide." };
    }
  }

  try {
    const payment = await recordEcolagePayment(
      studentId,
      type as EcolagePaymentTypeValue,
      receiptNumber,
      session.sub,
      amount,
    );
    revalidatePath("/agent-admin");
    revalidatePath("/agent-admin/ecolage");
    return { success: `Reçu ${receiptNumber} enregistré (${payment.amount.toLocaleString("fr-FR")} Ar).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." };
  }
}

// Vérification du paiement à l'inscription (dossier ENREGISTRE) : reçu +
// montant réellement versé, comparé au minimum requis pour ce niveau (droit
// d'inscription + assurance + polo + premier versement) — voir
// verifyRegistrationPayment dans lib/students.ts.
export async function verifyRegistrationPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAgentAdmin("verification_paiement");
  if (!session) return { error: "Accès refusé." };
  if (session === "denied") return { error: PERMISSION_DENIED_MESSAGE };

  const studentId = String(formData.get("studentId") ?? "");
  const receiptNumber = String(formData.get("receiptNumber") ?? "").trim();
  const amount = Number(String(formData.get("amount") ?? "").replace(/\s/g, ""));
  if (!studentId || !receiptNumber) {
    return { error: "Numéro de reçu obligatoire." };
  }
  if (!Number.isInteger(amount) || amount < 0) {
    return { error: "Montant invalide." };
  }
  if (!(await canManageStudent(session.sub, session.role, studentId))) {
    return { error: FORMATION_DENIED_MESSAGE };
  }

  try {
    const { payment, remainingBalance } = await verifyRegistrationPayment(
      studentId,
      receiptNumber,
      amount,
      session.sub,
    );
    revalidatePath("/agent-admin");
    revalidatePath("/agent-admin/ecolage");
    const balanceNote =
      remainingBalance > 0
        ? ` Il reste ${remainingBalance.toLocaleString("fr-FR")} Ar à payer pour solder l'écolage de l'année (voir « Gestion d'écolage »).`
        : " Écolage soldé en totalité pour l'année.";
    return {
      success: `Reçu ${receiptNumber} enregistré (${payment.amount.toLocaleString("fr-FR")} Ar).${balanceNote} L'inscription peut être validée.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." };
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
