"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { deleteStudent } from "@/lib/students";

export type DeleteState = { success?: string; error?: string };

export async function deleteStudentAction(
  _prev: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  // Une Server Action reste appelable par POST direct : on revérifie le rôle.
  // Suppression réservée à l'agent d'administration (et au superadmin).
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) {
    return { error: "Accès refusé : seul l'agent d'administration peut supprimer un dossier." };
  }

  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) return { error: "Dossier manquant." };

  try {
    const student = await deleteStudent(studentId, session.sub);
    revalidatePath("/etudiants");
    return { success: `Dossier ${student.matricule} supprimé.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la suppression." };
  }
}

export type ConductState = { success?: string; error?: string };

// L'appréciation de conduite relève du pédagogique (et du superadmin)
export async function updateConductAction(
  _prev: ConductState,
  formData: FormData,
): Promise<ConductState> {
  const session = await getSession();
  if (!session || !["AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) {
    return { error: "Accès refusé : seul l'agent pédagogique peut noter la conduite." };
  }

  const studentId = String(formData.get("studentId") ?? "");
  const conduct = String(formData.get("conduct") ?? "").trim();
  if (!studentId) return { error: "Dossier manquant." };
  if (conduct.length > 2000) return { error: "Appréciation trop longue (2000 caractères max)." };

  try {
    const student = await prisma.student.update({
      where: { id: studentId },
      data: { conduct: conduct || null },
    });
    await logAction(
      "STUDENT_UPDATED",
      `Conduite mise à jour pour ${student.fullName} (${student.matricule})`,
      session.sub,
    );
    revalidatePath(`/etudiants/${studentId}`);
    return { success: "Appréciation de conduite enregistrée." };
  } catch {
    return { error: "Dossier introuvable." };
  }
}
