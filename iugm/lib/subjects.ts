import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { logAction } from "./audit";

// ---------------------------------------------------------------------------
// Catalogue des matières (Subject) : alimenté uniquement par le superadmin
// (Admin > Matières), par filière et par niveau. Le caractère obligatoire ou
// facultatif (Subject.mandatory) est en revanche une décision pédagogique
// laissée au secrétaire de formation ou à l'agent pédagogique (tâche
// "matieres"), jamais au superadmin — voir setSubjectMandatory ci-dessous et
// le modèle Subject dans prisma/schema.prisma.
// ---------------------------------------------------------------------------

export type CreateSubjectInput = {
  name: string;
  formation: string; // libellé FORMATIONS, ex "Management" — même valeur que Student.mention
  level: string; // L1..M2, voir lib/level-shared.ts
};

// Superadmin uniquement : ajoute une matière au catalogue d'une filière/niveau.
// La permission est vérifiée par l'appelant (voir app/admin/matieres/actions.ts).
export async function createSubject(input: CreateSubjectInput, actorId: string) {
  const name = input.name.trim();
  if (!name) throw new Error("Le nom de la matière est obligatoire.");
  if (!input.formation) throw new Error("La filière est obligatoire.");
  if (!input.level) throw new Error("Le niveau est obligatoire.");

  try {
    const subject = await prisma.subject.create({
      data: { name, formation: input.formation, level: input.level, createdById: actorId },
    });
    await logAction(
      "SUBJECT_CREATED",
      `Matière « ${name} » ajoutée pour ${input.formation} — ${input.level}`,
      actorId,
    );
    return subject;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Cette matière existe déjà pour cette filière et ce niveau.");
    }
    throw e;
  }
}

// Superadmin uniquement : retire une matière du catalogue. Refusé si des
// notes ont déjà été saisies dessus (elles seraient perdues par la cascade),
// pour éviter une suppression accidentelle de données déjà enregistrées.
export async function deleteSubject(id: string, actorId: string) {
  const gradeCount = await prisma.grade.count({ where: { subjectId: id } });
  if (gradeCount > 0) {
    throw new Error(
      "Impossible de supprimer : des notes sont déjà enregistrées pour cette matière.",
    );
  }
  const subject = await prisma.subject.delete({ where: { id } });
  await logAction(
    "SUBJECT_DELETED",
    `Matière « ${subject.name} » supprimée (${subject.formation} — ${subject.level})`,
    actorId,
  );
  return subject;
}

export type SubjectFilters = {
  formation?: string | null;
  level?: string | null;
};

export async function listSubjects(filters: SubjectFilters = {}) {
  return prisma.subject.findMany({
    where: {
      ...(filters.formation ? { formation: filters.formation } : {}),
      ...(filters.level ? { level: filters.level } : {}),
    },
    orderBy: [{ formation: "asc" }, { level: "asc" }, { name: "asc" }],
  });
}

// Secrétaire de formation ou agent pédagogique (tâche "matieres") : déclare
// une matière du catalogue obligatoire ou facultative. Ne touche ni au nom,
// ni à la filière/niveau (réservés au superadmin, voir createSubject).
export async function setSubjectMandatory(id: string, mandatory: boolean, actorId: string) {
  const subject = await prisma.subject.update({
    where: { id },
    data: { mandatory, mandatorySetById: actorId, mandatorySetAt: new Date() },
  });
  await logAction(
    "SUBJECT_REQUIREMENT_UPDATED",
    `Matière « ${subject.name} » (${subject.formation} — ${subject.level}) déclarée ${
      mandatory ? "obligatoire" : "facultative"
    }`,
    actorId,
  );
  return subject;
}

// ---------------------------------------------------------------------------
// Notes (Grade) : assignées par l'agent pédagogique (tâche "notes"), par
// étudiant, matière, année universitaire et semestre. Distinctes de
// AcademicResult (moyenne générale du semestre, utilisée pour la mention et
// le passage de niveau, voir assignAcademicResult dans lib/students.ts) :
// une note par matière ne recalcule jamais automatiquement cette moyenne.
// ---------------------------------------------------------------------------

export type AssignGradeInput = {
  studentId: string;
  subjectId: string;
  academicYear: string; // ex "2025-2026"
  semester: string; // "S1" | "S2"
  value: number; // note sur 20
};

// Assigne (ou remplace) la note d'un étudiant dans une matière, pour une
// année/semestre. `student` et `subject` sont chargés par l'appelant pour
// éviter une double lecture quand plusieurs notes sont enregistrées d'affilée
// (voir assignGradesAction dans app/agent-pedagogique/notes/actions.ts).
export async function assignGrade(
  input: AssignGradeInput,
  actorId: string,
  preloaded?: { student: { fullName: string; matricule: string }; subject: { name: string } },
) {
  const { studentId, subjectId, academicYear, semester, value } = input;

  if (!Number.isFinite(value) || value < 0 || value > 20) {
    throw new Error("La note doit être comprise entre 0 et 20.");
  }
  if (!/^\d{4}-\d{4}$/.test(academicYear)) {
    throw new Error("Année universitaire invalide (format attendu : 2025-2026).");
  }
  if (!["S1", "S2"].includes(semester)) {
    throw new Error("Semestre invalide.");
  }

  const student =
    preloaded?.student ??
    (await prisma.student.findUnique({
      where: { id: studentId },
      select: { fullName: true, matricule: true, status: true },
    }));
  if (!student) throw new Error("Dossier introuvable.");
  if ("status" in student && student.status !== "INSCRIT") {
    throw new Error("Seul un étudiant inscrit peut recevoir une note.");
  }

  const subject =
    preloaded?.subject ?? (await prisma.subject.findUnique({ where: { id: subjectId } }));
  if (!subject) throw new Error("Matière introuvable.");

  const grade = await prisma.grade.upsert({
    where: { studentId_subjectId_academicYear_semester: { studentId, subjectId, academicYear, semester } },
    update: { value, recordedById: actorId },
    create: { studentId, subjectId, academicYear, semester, value, recordedById: actorId },
  });

  await logAction(
    "GRADE_ASSIGNED",
    `Note ${academicYear} ${semester} de ${student.fullName} (${student.matricule}) en ${subject.name} : ${value}/20`,
    actorId,
  );

  return grade;
}

// Matières du catalogue applicables à un étudiant : sa filière (mention ou,
// à défaut, program — même repli que canManageStudent dans lib/permissions.ts)
// et son niveau. Renvoyées avec la note déjà saisie pour l'année/semestre
// consultés, le cas échéant (pour préremplir le formulaire de saisie).
export async function listSubjectsForStudent(
  studentId: string,
  academicYear: string,
  semester: string,
) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { mention: true, program: true, level: true },
  });
  if (!student) return [];
  const formation = student.mention ?? student.program;
  if (!formation || !student.level) return [];

  const subjects = await prisma.subject.findMany({
    where: { formation, level: student.level },
    orderBy: [{ mandatory: "desc" }, { name: "asc" }],
    include: {
      grades: {
        where: { studentId, academicYear, semester },
        select: { value: true },
      },
    },
  });

  return subjects.map((s) => ({
    id: s.id,
    name: s.name,
    mandatory: s.mandatory,
    value: s.grades[0]?.value ?? null,
  }));
}
