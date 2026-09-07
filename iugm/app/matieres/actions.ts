"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setSubjectMandatory } from "@/lib/subjects";
import {
  hasTaskPermission,
  getUserFormation,
  PERMISSION_DENIED_MESSAGE,
  FORMATION_DENIED_MESSAGE,
} from "@/lib/permissions";

// Déclarer une matière obligatoire ou facultative : réservé au secrétaire de
// formation ou à l'agent pédagogique (tâche "matieres"). Le catalogue lui-même
// (nom, filière, niveau) reste réservé au superadmin, voir app/admin/matieres.
async function requireMatieresAgent() {
  const session = await getSession();
  if (!session || !["AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) {
    return null;
  }
  if (!(await hasTaskPermission(session.sub, session.role, "matieres"))) return "denied" as const;
  return session;
}

export type SubjectRequirementState = { success?: string; error?: string };

export async function setSubjectMandatoryAction(
  _prev: SubjectRequirementState,
  formData: FormData,
): Promise<SubjectRequirementState> {
  const session = await requireMatieresAgent();
  if (!session) return { error: "Accès refusé." };
  if (session === "denied") return { error: PERMISSION_DENIED_MESSAGE };

  const id = String(formData.get("id") ?? "");
  const mandatory = String(formData.get("mandatory") ?? "") === "true";
  if (!id) return { error: "Matière manquante." };

  // Périmètre par formation : une secrétaire (ou un agent pédagogique)
  // affecté à une filière ne peut pas modifier les matières d'une autre.
  const userFormation = await getUserFormation(session.sub, session.role);
  if (userFormation) {
    const subject = await prisma.subject.findUnique({ where: { id }, select: { formation: true } });
    if (subject && subject.formation !== userFormation) {
      return { error: FORMATION_DENIED_MESSAGE };
    }
  }

  try {
    await setSubjectMandatory(id, mandatory, session.sub);
    revalidatePath("/matieres");
    revalidatePath("/admin/matieres");
    return { success: `Matière déclarée ${mandatory ? "obligatoire" : "facultative"}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." };
  }
}
