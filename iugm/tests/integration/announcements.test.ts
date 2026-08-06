import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  registerStudent,
  recordEcolagePayment,
  validateAdminInscription,
  validatePedagoInscription,
  assignAcademicResult,
  reenrollStudent,
  verifyRegistrationPayment,
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

describe("communiqué de bienvenue automatique", () => {
  it("envoie un communiqué personnel à la toute première inscription", async () => {
    const actor = await createActor("AGENT_PEDAGOGIQUE");
    const inscrit = await enrollToInscrit(actor.id);

    const notices = await prisma.announcement.findMany({
      where: { studentId: inscrit.id, kind: "WELCOME" },
    });
    expect(notices).toHaveLength(1);
    expect(notices[0].body).toContain(inscrit.matricule);
    expect(notices[0].sourceAcademicYear).toBe(inscrit.academicYear);

    const view = await listAnnouncementsForStudent(inscrit.accountId!);
    expect(view.some((a) => a.kind === "WELCOME")).toBe(true);
  });

  it("n'envoie rien de nouveau lors d'une réinscription (compte déjà existant)", async () => {
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const adminActor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(pedagoActor.id);

    // Réinscription pour l'année suivante : reprend le dossier existant sans
    // créer un nouveau compte (voir validatePedagoInscription) — un seul
    // communiqué de bienvenue doit exister, celui de la première inscription.
    // Redoublement (même niveau) plutôt qu'un passage : évite la condition de
    // moyenne >= 10 requise pour progresser, hors sujet ici.
    const nextYear = `${Number(inscrit.academicYear!.split("-")[0]) + 1}-${Number(inscrit.academicYear!.split("-")[0]) + 2}`;
    await reenrollStudent(
      inscrit.id,
      { academicYear: nextYear, level: inscrit.level, docTranscript: true, docBlueFolder: true },
      adminActor.id,
      "AGENT_ADMINISTRATION",
    );
    await verifyRegistrationPayment(inscrit.id, "REC-002", 400_000, adminActor.id);
    await validateAdminInscription(inscrit.id, adminActor.id);
    await validatePedagoInscription(inscrit.id, pedagoActor.id);

    const notices = await prisma.announcement.findMany({
      where: { studentId: inscrit.id, kind: "WELCOME" },
    });
    expect(notices).toHaveLength(1);
  });
});

describe("avis d'admission automatique (S1+S2, moyenne >= 10)", () => {
  it("envoie un communiqué personnel quand S1 et S2 sont complets avec une moyenne >= 10", async () => {
    const actor = await createActor("AGENT_PEDAGOGIQUE");
    const inscrit = await enrollToInscrit(actor.id);
    const year = inscrit.academicYear!;

    // Filtré sur ADMISSION_NOTICE : l'inscription elle-même a déjà généré un
    // communiqué de bienvenue (WELCOME, voir validatePedagoInscription), qui
    // n'est pas ce que ce test vérifie.
    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S1", average: 12 }, actor.id);
    let notices = await prisma.announcement.findMany({
      where: { studentId: inscrit.id, kind: "ADMISSION_NOTICE" },
    });
    expect(notices).toHaveLength(0); // S2 manquant : pas encore d'avis

    await assignAcademicResult({ studentId: inscrit.id, academicYear: year, semester: "S2", average: 14 }, actor.id);
    notices = await prisma.announcement.findMany({
      where: { studentId: inscrit.id, kind: "ADMISSION_NOTICE" },
    });
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

    const notices = await prisma.announcement.findMany({
      where: { studentId: inscrit.id, kind: "ADMISSION_NOTICE" },
    });
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

    const notice = await prisma.announcement.findFirstOrThrow({
      where: { studentId: inscrit.id, kind: "ADMISSION_NOTICE" },
    });
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
