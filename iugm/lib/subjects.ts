import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { logAction } from "./audit";
import { assignAcademicResult } from "./students";
import {
  combineCcExam,
  computeSemesterAverage,
  validateGradingSettings,
  DEFAULT_BONUS_THRESHOLD,
} from "./grading";

// ---------------------------------------------------------------------------
// Catalogue des matières (Subject) : alimenté depuis Admin > Matières par le
// superadmin ou un agent pédagogique ayant la tâche "matieres" (limité à sa
// formation s'il en a une — vérifié par l'appelant, voir
// app/admin/matieres/actions.ts), par filière et par niveau, avec ses
// paramètres de calcul (semestre, coefficient, caractère obligatoire ou
// facultatif, seuil du bonus, part du contrôle continu, note éliminatoire),
// choisis à l'ajout puis modifiables — voir updateSubjectSettings ci-dessous,
// lib/grading.ts et le modèle Subject dans prisma/schema.prisma.
// ---------------------------------------------------------------------------

export type GradingSettings = {
  semester: string | null; // "S1" | "S2" ; null = non précisé (anciennes matières)
  mandatory: boolean; // obligatoire, ou facultative (compte en bonus)
  coefficient: number;
  bonusThreshold: number; // facultative : seuls les points au-delà comptent
  ccWeight: number; // part du contrôle continu en % (0 = note unique)
  eliminationThreshold: number | null; // obligatoire : note sous laquelle le semestre échoue
};

export type CreateSubjectInput = {
  name: string;
  formation: string; // libellé lib/formations.ts (licence ou master selon le niveau), ex "Management" — même valeur que Student.mention
  level: string; // L1..M2, voir lib/level-shared.ts
} & Partial<GradingSettings>;

function describeSettings(s: GradingSettings) {
  return [
    s.semester ?? "semestre non précisé",
    `coef. ${s.coefficient}`,
    s.mandatory ? "obligatoire" : `facultative (bonus au-delà de ${s.bonusThreshold}/20)`,
    s.ccWeight > 0 ? `CC ${s.ccWeight} % + examen ${100 - s.ccWeight} %` : "note unique",
    ...(s.mandatory && s.eliminationThreshold !== null
      ? [`éliminatoire sous ${s.eliminationThreshold}/20`]
      : []),
  ].join(", ");
}

// Ajoute une matière au catalogue d'une filière/niveau. La permission est
// vérifiée par l'appelant (voir app/admin/matieres/actions.ts).
export async function createSubject(input: CreateSubjectInput, actorId: string) {
  const name = input.name.trim();
  if (!name) throw new Error("Le nom de la matière est obligatoire.");
  if (!input.formation) throw new Error("La filière est obligatoire.");
  if (!input.level) throw new Error("Le niveau est obligatoire.");
  const settings: GradingSettings = {
    semester: input.semester ?? null,
    mandatory: input.mandatory ?? true,
    coefficient: input.coefficient ?? 1,
    bonusThreshold: input.bonusThreshold ?? DEFAULT_BONUS_THRESHOLD,
    ccWeight: input.ccWeight ?? 0,
    eliminationThreshold: input.eliminationThreshold ?? null,
  };
  const invalid = validateGradingSettings(settings);
  if (invalid) throw new Error(invalid);

  try {
    const subject = await prisma.subject.create({
      data: {
        name,
        formation: input.formation,
        level: input.level,
        ...settings,
        createdById: actorId,
      },
    });
    await logAction(
      "SUBJECT_CREATED",
      `Matière « ${name} » ajoutée pour ${input.formation} — ${input.level} (${describeSettings(settings)})`,
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

// Retire une matière du catalogue. Refusé si des
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
    orderBy: [
      { formation: "asc" },
      { level: "asc" },
      { semester: { sort: "asc", nulls: "last" } },
      { name: "asc" },
    ],
  });
}

// Modifie les paramètres de calcul d'une matière du catalogue. Ne touche ni
// au nom, ni à la filière/niveau. Les notes CC + examen déjà saisies sont
// recombinées selon la nouvelle part du CC, puis les moyennes de semestre
// obtenues avec des notes de cette matière sont recalculées dans la foulée.
// La permission est vérifiée par l'appelant (app/admin/matieres/actions.ts).
export async function updateSubjectSettings(
  id: string,
  settings: GradingSettings,
  actorId: string,
) {
  const invalid = validateGradingSettings(settings);
  if (invalid) throw new Error(invalid);

  const subject = await prisma.subject.update({
    where: { id },
    data: { ...settings, mandatorySetById: actorId, mandatorySetAt: new Date() },
  });
  await logAction(
    "SUBJECT_REQUIREMENT_UPDATED",
    `Matière « ${subject.name} » (${subject.formation} — ${subject.level}) : ${describeSettings(settings)}`,
    actorId,
  );

  // Notes saisies en CC + examen : recombinées selon la nouvelle part du CC.
  // Passer à « note unique » (0 %) garde la note de matière déjà calculée.
  if (settings.ccWeight > 0) {
    const detailed = await prisma.grade.findMany({
      where: { subjectId: id, ccValue: { not: null }, examValue: { not: null } },
      select: { id: true, ccValue: true, examValue: true },
    });
    for (const g of detailed) {
      await prisma.grade.update({
        where: { id: g.id },
        data: { value: combineCcExam(g.ccValue!, g.examValue!, settings.ccWeight) },
      });
    }
  }

  // Moyennes concernées : chaque (étudiant, année, semestre) ayant une note
  // dans cette matière
  const affected = await prisma.grade.findMany({
    where: { subjectId: id },
    select: { studentId: true, academicYear: true, semester: true },
    distinct: ["studentId", "academicYear", "semester"],
  });
  for (const g of affected) {
    await recomputeSemesterResult(g.studentId, g.academicYear, g.semester, actorId);
  }

  return subject;
}

// ---------------------------------------------------------------------------
// Notes (Grade) : assignées par l'agent pédagogique (tâche "notes"), par
// étudiant, matière, année universitaire et semestre. La moyenne du semestre
// (AcademicResult, utilisée pour la mention et le passage de niveau) en est
// calculée automatiquement — voir recomputeSemesterResult ci-dessous.
// ---------------------------------------------------------------------------

// Note unique (`value`) pour une matière sans contrôle continu, ou couple
// `cc` + `exam` pour une matière dont la part du CC est > 0 : la note de la
// matière est alors calculée (voir combineCcExam dans lib/grading.ts).
export type AssignGradeInput = {
  studentId: string;
  subjectId: string;
  academicYear: string; // ex "2025-2026"
  semester: string; // "S1" | "S2"
  value?: number; // note unique sur 20
  cc?: number; // note de contrôle continu sur 20
  exam?: number; // note d'examen sur 20
};

const isValidMark = (n: number) => Number.isFinite(n) && n >= 0 && n <= 20;

// Assigne (ou remplace) la note d'un étudiant dans une matière, pour une
// année/semestre. `student` et `subject` sont chargés par l'appelant pour
// éviter une double lecture quand plusieurs notes sont enregistrées d'affilée
// (voir assignGradesAction dans app/agent-pedagogique/notes/actions.ts).
export async function assignGrade(
  input: AssignGradeInput,
  actorId: string,
  preloaded?: {
    student: { fullName: string; matricule: string };
    subject: { name: string; ccWeight: number };
  },
) {
  const { studentId, subjectId, academicYear, semester } = input;

  for (const mark of [input.value, input.cc, input.exam]) {
    if (mark !== undefined && !isValidMark(mark)) {
      throw new Error("La note doit être comprise entre 0 et 20.");
    }
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

  let marks: { value: number; ccValue: number | null; examValue: number | null };
  if (subject.ccWeight > 0) {
    if (input.cc === undefined || input.exam === undefined) {
      throw new Error(
        `« ${subject.name} » combine contrôle continu et examen : saisissez les deux notes.`,
      );
    }
    marks = {
      value: combineCcExam(input.cc, input.exam, subject.ccWeight),
      ccValue: input.cc,
      examValue: input.exam,
    };
  } else {
    if (input.value === undefined) throw new Error("La note est obligatoire.");
    marks = { value: input.value, ccValue: null, examValue: null };
  }

  const grade = await prisma.grade.upsert({
    where: { studentId_subjectId_academicYear_semester: { studentId, subjectId, academicYear, semester } },
    update: { ...marks, recordedById: actorId },
    create: { studentId, subjectId, academicYear, semester, ...marks, recordedById: actorId },
  });

  await logAction(
    "GRADE_ASSIGNED",
    `Note ${academicYear} ${semester} de ${student.fullName} (${student.matricule}) en ${subject.name} : ${marks.value}/20${
      marks.ccValue !== null ? ` (CC ${marks.ccValue}, examen ${marks.examValue})` : ""
    }`,
    actorId,
  );

  return grade;
}

// Matières du catalogue applicables à un étudiant pour un semestre : sa
// filière (mention ou, à défaut, program — même repli que canManageStudent
// dans lib/permissions.ts), son niveau, et ce semestre (ou semestre non
// précisé). Renvoyées avec leurs paramètres de calcul et la note déjà saisie
// pour l'année/semestre consultés, le cas échéant (pour préremplir le
// formulaire de saisie et calculer la moyenne).
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
    where: {
      formation,
      level: student.level,
      OR: [{ semester }, { semester: null }],
    },
    orderBy: [{ mandatory: "desc" }, { name: "asc" }],
    include: {
      grades: {
        where: { studentId, academicYear, semester },
        select: { value: true, ccValue: true, examValue: true },
      },
    },
  });

  return subjects.map((s) => ({
    id: s.id,
    name: s.name,
    mandatory: s.mandatory,
    coefficient: s.coefficient,
    bonusThreshold: s.bonusThreshold,
    ccWeight: s.ccWeight,
    eliminationThreshold: s.eliminationThreshold,
    value: s.grades[0]?.value ?? null,
    ccValue: s.grades[0]?.ccValue ?? null,
    examValue: s.grades[0]?.examValue ?? null,
  }));
}

// Recalcule la moyenne d'un semestre à partir des notes par matière et
// l'enregistre (AcademicResult, mention et note éliminatoire comprises) —
// appelée après chaque
// saisie de notes et après chaque modification des paramètres d'une matière.
// Tant qu'une matière obligatoire n'est pas notée, la moyenne n'est pas
// calculée et un résultat déjà enregistré est laissé tel quel (par exemple
// un résultat d'une année passée, quand une matière a été ajoutée au
// catalogue depuis). Renvoie le détail du calcul pour l'affichage.
export async function recomputeSemesterResult(
  studentId: string,
  academicYear: string,
  semester: string,
  actorId: string,
) {
  const subjects = await listSubjectsForStudent(studentId, academicYear, semester);
  const computation = computeSemesterAverage(subjects);
  if (computation.status !== "complete") return computation;

  const existing = await prisma.academicResult.findUnique({
    where: { studentId_academicYear_semester: { studentId, academicYear, semester } },
    select: { average: true, eliminatedBy: true },
  });
  const eliminatedBy = computation.eliminatedBy.join(", ") || null;
  // Résultat inchangé : rien à réécrire ni à journaliser
  if (existing?.average === computation.average && existing.eliminatedBy === eliminatedBy) {
    return computation;
  }

  await assignAcademicResult(
    { studentId, academicYear, semester, average: computation.average },
    actorId,
    { computed: true, eliminatedBy: computation.eliminatedBy },
  );
  return computation;
}
