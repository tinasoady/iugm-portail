import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  registerStudent,
  recordEcolagePayment,
  validateAdminInscription,
  validatePedagoInscription,
  assignAcademicResult,
} from "@/lib/students";
import { createAnnouncement, listAnnouncementsForStudent } from "@/lib/announcements";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, validRegisterInput } from "../setup/factories";

beforeEach(resetDb);
afterAll(disconnectDb);

async function enrollToInscrit(actorId: string, overrides: Partial<Parameters<typeof validRegisterInput>[0]> = {}) {
  const student = await registerStudent(validRegisterInput(overrides), actorId);
  await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actorId);
  await validateAdminInscription(student.id, actorId);
  const { student: inscrit } = await validatePedagoInscription(student.id, actorId);
  return inscrit;
}

describe("avis d'admission automatique (S1+S2, moyenne >= 10)", () => {
  it("envoie un communiqué personnel quand S1 et S2 sont complets avec une moyenne >= 10", async () => {
    const actor = await createActor("AGENT_PEDAGOGIQUE");
    const inscrit = await enrollToInscrit(actor.id);
    const year = inscrit.academicYear!;

    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S1", average: 12 }, actor.id);
    let notices = await prisma.announcement.findMany({ where: { studentId: inscrit.id } });
    expect(notices).toHaveLength(0); // S2 manquant : pas encore d'avis

    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S2", average: 14 }, actor.id);
    notices = await prisma.announcement.findMany({ where: { studentId: inscrit.id } });
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe("ADMISSION_NOTICE");
    expect(notices[0].sourceAcademicYear).toBe(year);
    expect(notices[0].body).toContain("L2"); // niveau suivant (L1 -> L2)
  });

  it("n'envoie rien si la moyenne générale est en dessous de 10", async () => {
    const actor = await createActor("AGENT_PEDAGOGIQUE");
    const inscrit = await enrollToInscrit(actor.id);
    const year = inscrit.academicYear!;

    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S1", average: 6 }, actor.id);
    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S2", average: 8 }, actor.id);

    const notices = await prisma.announcement.findMany({ where: { studentId: inscrit.id } });
    expect(notices).toHaveLength(0);
  });

  it("ne double pas l'avis si S2 est ré-enregistré après coup", async () => {
    const actor = await createActor("AGENT_PEDAGOGIQUE");
    const inscrit = await enrollToInscrit(actor.id);
    const year = inscrit.academicYear!;

    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S1", average: 12 }, actor.id);
    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S2", average: 14 }, actor.id);
    // Correction du S2 (toujours >= 10 au global) : ne doit pas créer un second avis
    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S2", average: 15 }, actor.id);

    const notices = await prisma.announcement.findMany({
      where: { studentId: inscrit.id, kind: "ADMISSION_NOTICE" },
    });
    expect(notices).toHaveLength(1);
  });

  it("mentionne l'absence de niveau supérieur pour un M2", async () => {
    const actor = await createActor("AGENT_PEDAGOGIQUE");
    const inscrit = await enrollToInscrit(actor.id, { level: "M2" });
    const year = inscrit.academicYear!;

    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S1", average: 12 }, actor.id);
    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S2", average: 14 }, actor.id);

    const notice = await prisma.announcement.findFirstOrThrow({ where: { studentId: inscrit.id } });
    expect(notice.body).not.toContain("réinscription");
    expect(notice.title).not.toContain(" en ");
  });
});

describe("visibilité des communiqués personnels vs groupés", () => {
  it("un communiqué personnel n'est visible que par son destinataire, jamais par un camarade de promotion", async () => {
    const actor = await createActor("AGENT_PEDAGOGIQUE");
    const targeted = await enrollToInscrit(actor.id, { lastName: "RAKOTO" });
    const classmate = await enrollToInscrit(actor.id, { lastName: "RABE" });
    const year = targeted.academicYear!;

    await assignAcademicResult({ studentId: targeted.id, academicYear: year, semester: "S1", average: 12 }, actor.id);
    await assignAcademicResult({ studentId: targeted.id, academicYear: year, semester: "S2", average: 14 }, actor.id);

    const targetedView = await listAnnouncementsForStudent(targeted.accountId!);
    expect(targetedView.some((a) => a.kind === "ADMISSION_NOTICE")).toBe(true);

    const classmateView = await listAnnouncementsForStudent(classmate.accountId!);
    expect(classmateView.some((a) => a.kind === "ADMISSION_NOTICE")).toBe(false);
  });

  it("un communiqué groupé (filière/niveau) reste visible par tous les étudiants concernés", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const s1 = await enrollToInscrit(actor.id, { lastName: "RAKOTO" });
    const s2 = await enrollToInscrit(actor.id, { lastName: "RABE" });

    await createAnnouncement(
      { title: "Rentrée", body: "Reprise des cours le 2 septembre.", formation: "Management", level: "L1" },
      actor.id,
    );

    for (const student of [s1, s2]) {
      const view = await listAnnouncementsForStudent(student.accountId!);
      expect(view.some((a) => a.title === "Rentrée")).toBe(true);
    }
  });
});
