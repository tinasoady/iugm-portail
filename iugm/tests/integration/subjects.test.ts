import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  createSubject,
  deleteSubject,
  listSubjects,
  setSubjectMandatory,
  assignGrade,
  listSubjectsForStudent,
} from "@/lib/subjects";
import {
  registerStudent,
  verifyRegistrationPayment,
  validateAdminInscription,
  validatePedagoInscription,
} from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, createLevelFinancialInfo, validRegisterInput } from "../setup/factories";

// Matière par matière (Subject/Grade, ajoutés le 07/09) : distincte de
// AcademicResult (moyenne générale du semestre, déjà couverte par
// registration-workflow.test.ts). Couvre le catalogue de matières,
// la bascule obligatoire/facultatif et l'assignation de notes — la
// permission (superadmin pour le catalogue, tâches "matieres"/"notes" pour
// le reste) est vérifiée par l'appelant (app/admin/matieres/actions.ts,
// app/matieres/actions.ts, app/agent-pedagogique/notes/actions.ts, déjà
// couvertes indirectement par permissions.test.ts pour la même logique de
// garde), pas testée ici directement.

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

describe("setSubjectMandatory", () => {
  it("bascule une matière en facultative puis de nouveau en obligatoire, avec traçabilité", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const secretary = await createActor("AGENT_ADMINISTRATION");
    const subject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    expect(subject.mandatorySetAt).toBeNull();

    const updated = await setSubjectMandatory(subject.id, false, secretary.id);
    expect(updated.mandatory).toBe(false);
    expect(updated.mandatorySetById).toBe(secretary.id);
    expect(updated.mandatorySetAt).not.toBeNull();

    const restored = await setSubjectMandatory(subject.id, true, secretary.id);
    expect(restored.mandatory).toBe(true);
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

describe("listSubjectsForStudent", () => {
  it("renvoie les matières de la filière/niveau de l'étudiant, obligatoires d'abord, avec la note déjà saisie", async () => {
    const superadmin = await createActor("SUPERADMIN");
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const mandatorySubject = await createSubject(
      { name: "Algèbre", formation: "Management", level: "L1" },
      superadmin.id,
    );
    const optionalSubject = await createSubject(
      { name: "Anglais", formation: "Management", level: "L1" },
      superadmin.id,
    );
    await setSubjectMandatory(optionalSubject.id, false, superadmin.id);
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

  it("renvoie une liste vide pour un dossier inexistant", async () => {
    expect(await listSubjectsForStudent("inconnu", "2026-2027", "S1")).toEqual([]);
  });
});
