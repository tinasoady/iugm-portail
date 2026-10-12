"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleStudentNotification } from "@/lib/notifications";
import { assignGrade, listSubjectsForStudent, recomputeSemesterResult } from "@/lib/subjects";
import {
  hasTaskPermission,
  canManageStudent,
  PERMISSION_DENIED_MESSAGE,
  FORMATION_DENIED_MESSAGE,
} from "@/lib/permissions";

// Saisie des notes par matière : réservée à l'agent pédagogique (tâche
// "notes"). La moyenne du semestre (et sa mention) en est recalculée
// automatiquement, selon les paramètres des matières (voir lib/grading.ts).
async function requireNotesAgent() {
  const session = await getSession();
  if (!session || !["AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) return null;
  if (!(await hasTaskPermission(session.sub, session.role, "notes"))) return "denied" as const;
  return session;
}

export type AssignGradesState = { success?: string; error?: string };

// Enregistre en une fois toutes les notes saisies pour un étudiant, une
// année et un semestre donnés : une entrée `note_<subjectId>` par matière à
// note unique, ou `cc_<subjectId>` + `exam_<subjectId>` pour une matière qui
// combine contrôle continu et examen. Un champ laissé vide n'écrase pas une
// note déjà enregistrée : seules les valeurs renseignées sont prises en
// compte. Tout est vérifié avant le premier enregistrement.
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

  // Seules les matières applicables sont lues : un champ d'une matière hors
  // périmètre est ignoré silencieusement.
  const readMark = (key: string) => {
    const text = String(formData.get(key) ?? "").trim().replace(",", ".");
    return text === "" ? undefined : Number(text);
  };
  const invalid = (n: number | undefined) =>
    n !== undefined && (!Number.isFinite(n) || n < 0 || n > 20);

  const toSave: { subject: (typeof applicableSubjects)[number]; marks: { value?: number; cc?: number; exam?: number } }[] = [];
  for (const subject of applicableSubjects) {
    if (subject.ccWeight > 0) {
      const cc = readMark(`cc_${subject.id}`);
      const exam = readMark(`exam_${subject.id}`);
      if (cc === undefined && exam === undefined) continue;
      if (invalid(cc) || invalid(exam)) {
        return { error: `Note invalide pour « ${subject.name} » (doit être comprise entre 0 et 20).` };
      }
      if (cc === undefined || exam === undefined) {
        return {
          error: `« ${subject.name} » : saisissez à la fois la note de contrôle continu et celle d'examen.`,
        };
      }
      toSave.push({ subject, marks: { cc, exam } });
    } else {
      const value = readMark(`note_${subject.id}`);
      if (value === undefined) continue; // champ vide = pas de saisie pour cette matière
      if (invalid(value)) {
        return { error: `Note invalide pour « ${subject.name} » (doit être comprise entre 0 et 20).` };
      }
      toSave.push({ subject, marks: { value } });
    }
  }

  if (toSave.length === 0) {
    return { error: "Aucune note saisie." };
  }

  try {
    for (const { subject, marks } of toSave) {
      await assignGrade(
        { studentId, subjectId: subject.id, academicYear, semester, ...marks },
        session.sub,
        { student, subject },
      );
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." };
  }
  const saved = toSave.length;

  const computation = await recomputeSemesterResult(studentId, academicYear, semester, session.sub);

  revalidatePath("/agent-pedagogique/notes");
  revalidatePath("/agent-pedagogique");
  scheduleStudentNotification(studentId, { kind: "RESULT_PUBLISHED" });
  const savedText = `${saved} note${saved > 1 ? "s" : ""} enregistrée${saved > 1 ? "s" : ""} pour ${student.fullName}.`;
  return {
    success:
      computation.status === "complete"
        ? `${savedText} Moyenne ${semester} calculée : ${computation.average}/20${
            computation.eliminatedBy.length > 0
              ? ` — semestre non validé (note éliminatoire en ${computation.eliminatedBy.join(", ")})`
              : ""
          }.`
        : savedText,
  };
}
