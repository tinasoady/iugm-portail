"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assignGrade, listSubjectsForStudent } from "@/lib/subjects";
import {
  hasTaskPermission,
  canManageStudent,
  PERMISSION_DENIED_MESSAGE,
  FORMATION_DENIED_MESSAGE,
} from "@/lib/permissions";

// Saisie des notes par matière : réservée à l'agent pédagogique (tâche
// "notes"), distincte de "resultats" (moyenne générale par semestre, voir
// app/agent-pedagogique/actions.ts).
async function requireNotesAgent() {
  const session = await getSession();
  if (!session || !["AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) return null;
  if (!(await hasTaskPermission(session.sub, session.role, "notes"))) return "denied" as const;
  return session;
}

export type AssignGradesState = { success?: string; error?: string };

// Enregistre en une fois toutes les notes saisies pour un étudiant, une
// année et un semestre donnés (une entrée `note_<subjectId>` par matière du
// formulaire). Un champ laissé vide n'écrase pas une note déjà enregistrée :
// seules les valeurs renseignées sont prises en compte.
export async function assignGradesAction(
  _prev: AssignGradesState,
  formData: FormData,
): Promise<AssignGradesState> {
  const session = await requireNotesAgent();
  if (!session) return { error: "Accès refusé." };
  if (session === "denied") return { error: PERMISSION_DENIED_MESSAGE };

  const studentId = String(formData.get("studentId") ?? "");
  const academicYear = String(formData.get("academicYear") ?? "").trim();
  const semester = String(formData.get("semester") ?? "").trim();

  if (!studentId || !academicYear || !semester) {
    return { error: "Étudiant, année et semestre sont obligatoires." };
  }
  if (!(await canManageStudent(session.sub, session.role, studentId))) {
    return { error: FORMATION_DENIED_MESSAGE };
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { fullName: true, matricule: true, status: true },
  });
  if (!student) return { error: "Dossier introuvable." };

  // Ne retenir que les matières réellement applicables à cet étudiant (sa
  // filière et son niveau) : empêche l'enregistrement d'une note sur une
  // matière d'une autre filière via un formulaire trafiqué.
  const applicableSubjects = await listSubjectsForStudent(studentId, academicYear, semester);
  const subjectById = new Map(applicableSubjects.map((s) => [s.id, s]));

  let saved = 0;
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("note_")) continue;
    const subjectId = key.slice("note_".length);
    const subject = subjectById.get(subjectId);
    if (!subject) continue; // matière hors périmètre : ignorée silencieusement

    const text = String(raw).trim().replace(",", ".");
    if (text === "") continue; // champ vide = pas de saisie pour cette matière

    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || value > 20) {
      return { error: `Note invalide pour « ${subject.name} » (doit être comprise entre 0 et 20).` };
    }

    try {
      await assignGrade(
        { studentId, subjectId, academicYear, semester, value },
        session.sub,
        { student, subject: { name: subject.name } },
      );
      saved += 1;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." };
    }
  }

  if (saved === 0) {
    return { error: "Aucune note saisie." };
  }

  revalidatePath("/agent-pedagogique/notes");
  return {
    success: `${saved} note${saved > 1 ? "s" : ""} enregistrée${saved > 1 ? "s" : ""} pour ${student.fullName}.`,
  };
}
