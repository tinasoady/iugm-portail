import { prisma } from "./prisma";

// Enregistre une action dans le journal d'audit.
// Ne doit jamais faire échouer l'opération principale : les erreurs sont loguées puis ignorées.
export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "USER_CREATED"
  | "LOGOUT"
  | "STUDENT_REGISTERED"
  | "RECEIPT_VERIFIED"
  | "ADMIN_INSCRIPTION_VALIDATED"
  | "PEDAGO_INSCRIPTION_VALIDATED"
  | "CSV_EXPORTED"
  | "CSV_IMPORTED"
  | "RESULT_ASSIGNED"
  | "INSCRIPTION_RECEIPT_PRINTED";

export async function logAction(action: AuditAction, details?: string, actorId?: string | null) {
  try {
    await prisma.auditLog.create({
      data: { action, details, actorId: actorId ?? null },
    });
  } catch (e) {
    console.error("Impossible d'écrire dans le journal d'audit :", e);
  }
}
