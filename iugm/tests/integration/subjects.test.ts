import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  createSubject,
  deleteSubject,
  listSubjects,
  updateSubjectSettings,
  assignGrade,
  listSubjectsForStudent,
  recomputeSemesterResult,
} from "@/lib/subjects";
import {
  registerStudent,
  verifyRegistrationPayment,
  validateAdminInscription,
  validatePedagoInscription,
} from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, createLevelFinancialInfo, validRegisterInput } from "../setup/factories";

// Matière par matière (Subject/Grade, ajoutés le 07/09) et calcul automatique
// de la moyenne du semestre (AcademicResult) à partir des notes. Couvre le
// catalogue de matières, ses paramètres de calcul, l'assignation de notes et
// le recalcul — le calcul pur est couvert par tests/unit/grading.test.ts. La
// permission (superadmin pour le catalogue, tâche "notes" pour les notes)
// est vérifiée par l'appelant (app/admin/matieres/actions.ts,
// app/agent-pedagogique/notes/actions.ts, déjà
// couvertes indirectement par permissions.test.ts pour la même logique de
// garde), pas testée ici directement.

// Paramètres de calcul par défaut, complétés au cas par cas
const SETTINGS = {
  semester: "S1",
  mandatory: true,
  coefficient: 1,
  bonusThreshold: 10,
  ccWeight: 0,
  eliminationThreshold: null,
};

beforeEach(async () => {
  await resetDb();
  await createLevelFinancialInfo("L1", { tuitionLocal: 2_000_000 });
});
afterAll(disconnectDb);

// Mène un dossier jusqu'à INSCRIT (seul statut pouvant recevoir une note,
// voir assignGrade dans lib/subjects.ts) — même parcours que
// registration-workflow.test.ts, factorisé ici pour ne pas le répéter.
async function registerInscritStudent() {
  const adminActor = await createActor("AGENT_ADMINISTRATION");
  const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
  const student = await registerStudent(validRegisterInput(), adminActor.id);
  await verifyRegistrationPayment(student.id, "REC-001", 400_000, adminActor.id);
  await validateAdminInscription(student.id, adminActor.id);
  const { student: finalStudent } = await validatePedagoInscription(student.id, pedagoActor.id);
  return finalStudent;
}

describe("createSubject / listSubjects", () => {
  it("ajoute une matière au catalogue, obligatoire par défaut", async () => {
    const actor = await createActor("SUPERADMIN");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      actor.id,
    );
    expect(subject.name).toBe("Algèbre");
    expect(subject.mandatory).toBe(true);

    const subjects = await listSubjects({ formation: "Management", level: "L1" });
    expect(subjects.map((s) => s.name)).toEqual(["Algèbre"]);
  });

  it("enregistre le caractère facultatif choisi à l'ajout", async () => {
    const actor = await createActor("SUPERADMIN");
    const subject = await createSubject(
      { name: "Théâtre", formation: "Management", level: "L1", mandatory: false },
      actor.id,
    );
    expect(subject.mandatory).toBe(false);
  });

  it("refuse deux matières identiques pour la même filière et le même niveau", async () => {
    const actor = await createActor("SUPERADMIN");
    await createSubject({ name: "Algèbre", formation: "Management", level: "L1" }, actor.id);
    await expect(
      createSubject({ name: "Algèbre", formation: "Management", level: "L1" }, actor.id),
    ).rejects.toThrow(/existe déjà/);
  });

  it("accepte le même nom de matière pour une filière ou un niveau différent", async () => {
    const actor = await createActor("SUPERADMIN");
    await createSubject({ name: "Algèbre", formation: "Management", level: "L1" }, actor.id);
    const other = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L2" },
      actor.id,
    );
    expect(other.level).toBe("L2");
  });

  it("refuse un nom, une filière ou un niveau vide", async () => {
    const actor = await createActor("SUPERADMIN");
    await expect(
      createSubject({ name: "  ", formation: "Management", level: "L1" }, actor.id),
    ).rejects.toThrow(/nom de la matière/);
    await expect(
      createSubject({ name: "Algèbre", formation: "", level: "L1" }, actor.id),
    ).rejects.toThrow(/filière/);
    await expect(
      createSubject({ name: "Algèbre", formation: "Management", level: "" }, actor.id),
    ).rejects.toThrow(/niveau/);
  });
});

describe("deleteSubject", () => {
  it("supprime une matière sans note enregistrée", async () => {
    const actor = await createActor("SUPERADMIN");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      actor.id,
    );
    await deleteSubject(subject.id, actor.id);
    expect(await prisma.subject.findUnique({ where: { id: subject.id } })).toBeNull();
  });

  it("refuse de supprimer une matière ayant déjà des notes, pour ne pas les perdre", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    const student = await registerInscritStudent();
    await assignGrade(
      {
        studentId: student.id,
        subjectId: subject.id,
        academicYear: "2026-2027",
        semester: "S1",
        value: 14,
      },
      pedagoActor.id,
    );

    await expect(deleteSubject(subject.id, superadmin.id)).rejects.toThrow(/déjà enregistrées/);
    expect(await prisma.subject.findUnique({ where: { id: subject.id } })).not.toBeNull();
  });
});

describe("updateSubjectSettings", () => {
  it("modifie les paramètres de calcul, avec traçabilité", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    expect(subject.mandatorySetAt).toBeNull();
    expect(subject.coefficient).toBe(1);
    expect(subject.semester).toBeNull();

    const updated = await updateSubjectSettings(
      subject.id,
      { ...SETTINGS, semester: "S2", mandatory: false, coefficient: 2, bonusThreshold: 12 },
      superadmin.id,
    );
    expect(updated).toMatchObject({
      semester: "S2",
      mandatory: false,
      coefficient: 2,
      bonusThreshold: 12,
      mandatorySetById: superadmin.id,
    });
    expect(updated.mandatorySetAt).not.toBeNull();
  });

  it("refuse un coefficient nul ou un seuil hors de 0-20", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    await expect(
      updateSubjectSettings(
        subject.id,
        { ...SETTINGS, semester: "S1", mandatory: true, coefficient: 0, bonusThreshold: 10 },
        superadmin.id,
      ),
    ).rejects.toThrow(/coefficient/);
    await expect(
      updateSubjectSettings(
        subject.id,
        { ...SETTINGS, semester: "S1", mandatory: false, coefficient: 1, bonusThreshold: 25 },
        superadmin.id,
      ),
    ).rejects.toThrow(/seuil/);
  });

  it("recalcule les moyennes déjà obtenues avec des notes de cette matière", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const algebre = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1", semester: "S1" },
      superadmin.id,
    );
    const droit = await createSubject(
      { name: "Droit", formation: "Management", level: "L1", semester: "S1" },
      superadmin.id,
    );
    const student = await registerInscritStudent();
    const grade = (subjectId: string, value: number) =>
      assignGrade(
        { studentId: student.id, subjectId, academicYear: "2026-2027", semester: "S1", value },
        pedagoActor.id,
      );
    await grade(algebre.id, 16);
    await grade(droit.id, 8);
    await recomputeSemesterResult(student.id, "2026-2027", "S1", pedagoActor.id);

    // (16 + 8) / 2 = 12, puis Algèbre passe coefficient 3 : (48 + 8) / 4 = 14
    await updateSubjectSettings(
      algebre.id,
      { ...SETTINGS, semester: "S1", mandatory: true, coefficient: 3, bonusThreshold: 10 },
      superadmin.id,
    );
    const result = await prisma.academicResult.findUniqueOrThrow({
      where: {
        studentId_academicYear_semester: {
          studentId: student.id,
          academicYear: "2026-2027",
          semester: "S1",
        },
      },
    });
    expect(result.average).toBe(14);
    expect(result.mention).toBe("BIEN");
  });
});

describe("assignGrade", () => {
  it("assigne une note à un étudiant inscrit", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    const student = await registerInscritStudent();

    const grade = await assignGrade(
      {
        studentId: student.id,
        subjectId: subject.id,
        academicYear: "2026-2027",
        semester: "S1",
        value: 15.5,
      },
      pedagoActor.id,
    );
    expect(grade.value).toBe(15.5);
  });

  it("remplace la note existante plutôt que d'en créer une deuxième (même étudiant/matière/année/semestre)", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    const student = await registerInscritStudent();

    await assignGrade(
      {
        studentId: student.id,
        subjectId: subject.id,
        academicYear: "2026-2027",
        semester: "S1",
        value: 8,
      },
      pedagoActor.id,
    );
    await assignGrade(
      {
        studentId: student.id,
        subjectId: subject.id,
        academicYear: "2026-2027",
        semester: "S1",
        value: 17,
      },
      pedagoActor.id,
    );

    const grades = await prisma.grade.findMany({
      where: { studentId: student.id, subjectId: subject.id },
    });
    expect(grades).toHaveLength(1);
    expect(grades[0].value).toBe(17);
  });

  it("refuse une note hors de l'intervalle 0-20", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    const student = await registerInscritStudent();

    await expect(
      assignGrade(
        {
          studentId: student.id,
          subjectId: subject.id,
          academicYear: "2026-2027",
          semester: "S1",
          value: 21,
        },
        pedagoActor.id,
      ),
    ).rejects.toThrow(/comprise entre 0 et 20/);
    await expect(
      assignGrade(
        {
          studentId: student.id,
          subjectId: subject.id,
          academicYear: "2026-2027",
          semester: "S1",
          value: -1,
        },
        pedagoActor.id,
      ),
    ).rejects.toThrow(/comprise entre 0 et 20/);
  });

  it("refuse une année universitaire mal formée", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    const student = await registerInscritStudent();

    await expect(
      assignGrade(
        {
          studentId: student.id,
          subjectId: subject.id,
          academicYear: "2026",
          semester: "S1",
          value: 12,
        },
        pedagoActor.id,
      ),
    ).rejects.toThrow(/Année universitaire invalide/);
  });

  it("refuse un semestre invalide", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    const student = await registerInscritStudent();

    await expect(
      assignGrade(
        {
          studentId: student.id,
          subjectId: subject.id,
          academicYear: "2026-2027",
          semester: "S3",
          value: 12,
        },
        pedagoActor.id,
      ),
    ).rejects.toThrow(/Semestre invalide/);
  });

  it("refuse une note pour un étudiant qui n'est pas encore inscrit", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const adminActor = await createActor("AGENT_ADMINISTRATION");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    const student = await registerStudent(validRegisterInput(), adminActor.id); // reste ENREGISTRE

    await expect(
      assignGrade(
        {
          studentId: student.id,
          subjectId: subject.id,
          academicYear: "2026-2027",
          semester: "S1",
          value: 12,
        },
        pedagoActor.id,
      ),
    ).rejects.toThrow(/inscrit peut recevoir une note/);
  });

  it("refuse un dossier ou une matière inexistants", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    const student = await registerInscritStudent();

    await expect(
      assignGrade(
        {
          studentId: "inconnu",
          subjectId: subject.id,
          academicYear: "2026-2027",
          semester: "S1",
          value: 12,
        },
        pedagoActor.id,
      ),
    ).rejects.toThrow(/Dossier introuvable/);
    await expect(
      assignGrade(
        {
          studentId: student.id,
          subjectId: "inconnu",
          academicYear: "2026-2027",
          semester: "S1",
          value: 12,
        },
        pedagoActor.id,
      ),
    ).rejects.toThrow(/Matière introuvable/);
  });
});

describe("contrôle continu + examen", () => {
  it("calcule la note de la matière à partir du CC et de l'examen", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1", semester: "S1", ccWeight: 40 },
      superadmin.id,
    );
    const student = await registerInscritStudent();
    const base = { studentId: student.id, subjectId: subject.id, academicYear: "2026-2027", semester: "S1" };

    const grade = await assignGrade({ ...base, cc: 10, exam: 15 }, pedagoActor.id);
    expect(grade).toMatchObject({ value: 13, ccValue: 10, examValue: 15 });

    // Une note unique ne suffit pas pour une matière à CC + examen
    await expect(assignGrade({ ...base, value: 12 }, pedagoActor.id)).rejects.toThrow(
      /saisissez les deux notes/,
    );
  });

  it("recombine les notes déjà saisies quand la part du CC change", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1", semester: "S1", ccWeight: 40 },
      superadmin.id,
    );
    const student = await registerInscritStudent();
    await assignGrade(
      { studentId: student.id, subjectId: subject.id, academicYear: "2026-2027", semester: "S1", cc: 10, exam: 15 },
      pedagoActor.id,
    );
    await recomputeSemesterResult(student.id, "2026-2027", "S1", pedagoActor.id);

    await updateSubjectSettings(subject.id, { ...SETTINGS, ccWeight: 50 }, superadmin.id);
    const grade = await prisma.grade.findFirstOrThrow({ where: { subjectId: subject.id } });
    expect(grade.value).toBe(12.5);
    const result = await prisma.academicResult.findFirstOrThrow({ where: { studentId: student.id } });
    expect(result.average).toBe(12.5);
  });
});

describe("listSubjectsForStudent", () => {
  it("renvoie les matières de la filière/niveau de l'étudiant, obligatoires d'abord, avec la note déjà saisie", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const mandatorySubject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    await createSubject(
      { name: "Anglais", formation: "Management", level: "L1", mandatory: false },
      superadmin.id,
    );
    // Autre filière : ne doit jamais apparaître dans la liste de l'étudiant.
    await createSubject(
      { name: "Micro-économie", formation: "Économie générale", level: "L1" },
      superadmin.id,
    );

    const student = await registerInscritStudent();
    await assignGrade(
      {
        studentId: student.id,
        subjectId: mandatorySubject.id,
        academicYear: "2026-2027",
        semester: "S1",
        value: 16,
      },
      pedagoActor.id,
    );

    const subjects = await listSubjectsForStudent(student.id, "2026-2027", "S1");
    expect(subjects.map((s) => s.name)).toEqual(["Algèbre", "Anglais"]);
    expect(subjects.find((s) => s.name === "Algèbre")?.value).toBe(16);
    expect(subjects.find((s) => s.name === "Anglais")?.value).toBeNull();
  });

  it("ne renvoie pas la note d'un autre semestre", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    const student = await registerInscritStudent();
    await assignGrade(
      {
        studentId: student.id,
        subjectId: subject.id,
        academicYear: "2026-2027",
        semester: "S1",
        value: 16,
      },
      pedagoActor.id,
    );

    const subjectsS2 = await listSubjectsForStudent(student.id, "2026-2027", "S2");
    expect(subjectsS2[0].value).toBeNull();
  });

  it("ne propose que les matières du semestre demandé (ou de semestre non précisé)", async () => {
    const superadmin = await createActor("SUPERADMIN");
    for (const [name, semester] of [
      ["Algèbre", "S1"],
      ["Statistiques", "S2"],
      ["Anglais", null],
    ] as const) {
      await createSubject({ name, formation: "Management", level: "L1", semester }, superadmin.id);
    }
    const student = await registerInscritStudent();

    const s1 = await listSubjectsForStudent(student.id, "2026-2027", "S1");
    expect(s1.map((s) => s.name)).toEqual(["Algèbre", "Anglais"]);
    const s2 = await listSubjectsForStudent(student.id, "2026-2027", "S2");
    expect(s2.map((s) => s.name)).toEqual(["Anglais", "Statistiques"]);
  });

  it("renvoie une liste vide pour un dossier inexistant", async () => {
    expect(await listSubjectsForStudent("inconnu", "2026-2027", "S1")).toEqual([]);
  });
});

describe("recomputeSemesterResult", () => {
  async function setup() {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const create = (name: string, extra: object = {}) =>
      createSubject(
        { name, formation: "Management", level: "L1", semester: "S1", ...extra },
        superadmin.id,
      );
    const algebre = await create("Algèbre", { coefficient: 2 });
    const droit = await create("Droit");
    const theatre = await create("Théâtre", { mandatory: false });
    const student = await registerInscritStudent();
    const grade = (subjectId: string, value: number) =>
      assignGrade(
        { studentId: student.id, subjectId, academicYear: "2026-2027", semester: "S1", value },
        pedagoActor.id,
      );
    const recompute = () =>
      recomputeSemesterResult(student.id, "2026-2027", "S1", pedagoActor.id);
    const result = () =>
      prisma.academicResult.findUnique({
        where: {
          studentId_academicYear_semester: {
            studentId: student.id,
            academicYear: "2026-2027",
            semester: "S1",
          },
        },
      });
    return { algebre, droit, theatre, grade, recompute, result };
  }

  it("n'enregistre rien tant qu'une matière obligatoire n'est pas notée", async () => {
    const { algebre, grade, recompute, result } = await setup();
    await grade(algebre.id, 15);
    const computation = await recompute();
    expect(computation).toEqual({ status: "incomplete", missing: ["Droit"] });
    expect(await result()).toBeNull();
  });

  it("calcule la moyenne pondérée, bonus compris, et la mention", async () => {
    const { algebre, droit, theatre, grade, recompute, result } = await setup();
    await grade(algebre.id, 12); // 12 × 2
    await grade(droit.id, 9); // 9 × 1
    await grade(theatre.id, 16); // bonus : (16 − 10) × 1
    const computation = await recompute();
    // (24 + 9 + 6) / 3 = 13
    expect(computation).toMatchObject({ status: "complete", average: 13, bonusPoints: 6 });
    expect(await result()).toMatchObject({ average: 13, mention: "ASSEZ_BIEN" });
  });

  it("une note facultative sous le seuil ne fait pas baisser la moyenne", async () => {
    const { algebre, droit, theatre, grade, recompute, result } = await setup();
    await grade(algebre.id, 12);
    await grade(droit.id, 12);
    await grade(theatre.id, 3);
    await recompute();
    expect((await result())?.average).toBe(12);
  });

  it("enregistre un semestre éliminé en ÉCHEC malgré une moyenne suffisante", async () => {
    const { algebre, droit, grade, recompute, result } = await setup();
    await updateSubjectSettings(
      droit.id,
      { ...SETTINGS, eliminationThreshold: 6 },
      (await createActor("SUPERADMIN")).id,
    );
    await grade(algebre.id, 18);
    await grade(droit.id, 5);
    const computation = await recompute();
    // (36 + 5) / 3 = 13,67 mais Droit < 6
    expect(computation).toMatchObject({ average: 13.67, eliminatedBy: ["Droit"] });
    expect(await result()).toMatchObject({ mention: "ECHEC", eliminatedBy: "Droit" });

    await grade(droit.id, 7);
    await recompute();
    expect(await result()).toMatchObject({ mention: "BIEN", eliminatedBy: null });
  });

  it("met à jour la moyenne quand une note est corrigée", async () => {
    const { algebre, droit, grade, recompute, result } = await setup();
    await grade(algebre.id, 10);
    await grade(droit.id, 10);
    await recompute();
    expect((await result())?.mention).toBe("PASSABLE");
    await grade(droit.id, 4);
    await recompute();
    // (20 + 4) / 3 = 8
    expect(await result()).toMatchObject({ average: 8, mention: "ECHEC" });
  });
});
