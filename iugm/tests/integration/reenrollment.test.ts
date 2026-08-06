import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  registerStudent,
  recordEcolagePayment,
  validateAdminInscription,
  validatePedagoInscription,
  reenrollStudent,
  assignAcademicResult,
} from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, validRegisterInput } from "../setup/factories";

beforeEach(resetDb);
afterAll(disconnectDb);

// Fait passer un dossier fraîchement enregistré jusqu'au statut INSCRIT
// (compte étudiant créé), pour tester la réinscription à partir d'un état réaliste.
async function enrollToInscrit(actorId: string) {
  const student = await registerStudent(validRegisterInput(), actorId);
  await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actorId);
  await validateAdminInscription(student.id, actorId);
  const { student: inscrit } = await validatePedagoInscription(student.id, actorId);
  return inscrit;
}

// Attribue S1 et S2 avec une moyenne générale >= 10 (éligible au passage de
// niveau) — voir getStudentAverageForYear dans lib/students.ts.
async function assignPassingResults(studentId: string, academicYear: string, actorId: string) {
  await assignAcademicResult({ studentId, academicYear, semester: "S1", average: 14 }, actorId);
  await assignAcademicResult({ studentId, academicYear, semester: "S2", average: 14 }, actorId);
}

// Pièces de réinscription obligatoires, toujours cochées sauf test dédié.
const REQUIRED_DOCS = { docTranscript: true, docBlueFolder: true };

describe("registerStudent", () => {
  it("code un nouveau dossier N (nouvel étudiant)", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    expect(student.repeatCode).toBe("N");
  });
});

describe("reenrollStudent", () => {
  it("archive l'année qui se termine et remet le dossier au début du workflow", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);
    const matricule = inscrit.matricule;
    const accountId = inscrit.accountId;
    await assignPassingResults(inscrit.id, inscrit.academicYear!, actor.id);

    const reenrolled = await reenrollStudent(
      inscrit.id,
      { academicYear: "2027-2028", level: "L2", ...REQUIRED_DOCS },
      actor.id,
      "AGENT_ADMINISTRATION",
    );

    expect(reenrolled.status).toBe("ENREGISTRE");
    expect(reenrolled.academicYear).toBe("2027-2028");
    expect(reenrolled.level).toBe("L2");
    // Passage au niveau supérieur = étudiant "passant", codé N
    expect(reenrolled.repeatCode).toBe("N");
    // Le matricule et le compte de connexion sont conservés d'une année sur l'autre
    expect(reenrolled.matricule).toBe(matricule);
    expect(reenrolled.accountId).toBe(accountId);
    // Le dossier repart à zéro pour la nouvelle année
    expect(reenrolled.receiptVerifiedAt).toBeNull();
    expect(reenrolled.pedagoValidatedAt).toBeNull();
    expect(reenrolled.receiptNumber).toBeNull();
    // Les pièces de réinscription redeviennent à vérifier pour la nouvelle année
    expect(reenrolled.docTranscript).toBe(false);
    expect(reenrolled.docBlueFolder).toBe(false);

    const history = await prisma.enrollmentHistory.findFirst({
      where: { studentId: inscrit.id, academicYear: "2026-2027" },
    });
    expect(history).not.toBeNull();
    expect(history?.status).toBe("INSCRIT");
    // Régression : l'horodatage de l'année archivée doit être conservé, sinon
    // il disparaît du graphique du tableau de bord (voir tests/integration/dashboard.test.ts)
    expect(history?.pedagoValidatedAt).toEqual(inscrit.pedagoValidatedAt);
    expect(history?.receiptVerifiedAt).toEqual(inscrit.receiptVerifiedAt);
    // Pièces de l'année archivée conservées dans l'historique
    expect(history?.docTranscript).toBe(true);
    expect(history?.docBlueFolder).toBe(true);
  });

  it("code R (redoublant) quand le niveau ne change pas, puis T au redoublement suivant", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);

    // Redoublement (même niveau) : pas soumis à la condition de moyenne
    const redoublant = await reenrollStudent(
      inscrit.id,
      { academicYear: "2027-2028", level: inscrit.level, ...REQUIRED_DOCS },
      actor.id,
      "AGENT_ADMINISTRATION",
    );
    expect(redoublant.repeatCode).toBe("R");

    // Deuxième cycle jusqu'à INSCRIT pour 2027-2028, puis réinscription au même niveau
    await recordEcolagePayment(redoublant.id, "TRANCHE_S1", "REC-002", actor.id);
    await validateAdminInscription(redoublant.id, actor.id);
    await validatePedagoInscription(redoublant.id, actor.id);

    const triplant = await reenrollStudent(
      redoublant.id,
      { academicYear: "2028-2029", level: redoublant.level, ...REQUIRED_DOCS },
      actor.id,
      "AGENT_ADMINISTRATION",
    );
    expect(triplant.repeatCode).toBe("T");
  });

  it("refuse de réinscrire un dossier qui n'est pas encore INSCRIT", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    await expect(
      reenrollStudent(
        student.id,
        { academicYear: "2027-2028", ...REQUIRED_DOCS },
        actor.id,
        "AGENT_ADMINISTRATION",
      ),
    ).rejects.toThrow(/inscription est finalisée/);
  });

  it("refuse de réinscrire deux fois pour la même année universitaire", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);

    await expect(
      reenrollStudent(
        inscrit.id,
        { academicYear: inscrit.academicYear!, ...REQUIRED_DOCS },
        actor.id,
        "AGENT_ADMINISTRATION",
      ),
    ).rejects.toThrow(/déjà inscrit pour/);
  });

  it("refuse d'archiver deux fois la même année universitaire", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);
    await reenrollStudent(
      inscrit.id,
      { academicYear: "2027-2028", level: inscrit.level, ...REQUIRED_DOCS },
      actor.id,
      "AGENT_ADMINISTRATION",
    );

    // Nouveau cycle jusqu'à INSCRIT pour 2027-2028, puis tentative de
    // réinscrire vers une année déjà présente dans l'historique (2026-2027)
    const secondActor = await createActor("AGENT_PEDAGOGIQUE");
    await recordEcolagePayment(inscrit.id, "TRANCHE_S1", "REC-002", actor.id);
    await validateAdminInscription(inscrit.id, actor.id);
    await validatePedagoInscription(inscrit.id, secondActor.id);

    await expect(
      reenrollStudent(
        inscrit.id,
        { academicYear: "2026-2027", ...REQUIRED_DOCS },
        actor.id,
        "AGENT_ADMINISTRATION",
      ),
    ).rejects.toThrow(/déjà une inscription archivée/);
  });

  it("refuse un saut de niveau (L1 -> L3)", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);
    await assignPassingResults(inscrit.id, inscrit.academicYear!, actor.id);

    await expect(
      reenrollStudent(
        inscrit.id,
        { academicYear: "2027-2028", level: "L3", ...REQUIRED_DOCS },
        actor.id,
        "AGENT_ADMINISTRATION",
      ),
    ).rejects.toThrow(/Passage impossible/);
  });

  it("refuse le passage au niveau supérieur si la moyenne est insuffisante ou absente", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);
    // Aucun résultat assigné : moyenne générale non calculable

    await expect(
      reenrollStudent(
        inscrit.id,
        { academicYear: "2027-2028", level: "L2", ...REQUIRED_DOCS },
        actor.id,
        "AGENT_ADMINISTRATION",
      ),
    ).rejects.toThrow(/pas encore saisie[\s\S]*superadmin peut forcer/);

    await assignAcademicResult(
      { studentId: inscrit.id, academicYear: inscrit.academicYear!, semester: "S1", average: 4 },
      actor.id,
    );
    await assignAcademicResult(
      { studentId: inscrit.id, academicYear: inscrit.academicYear!, semester: "S2", average: 5 },
      actor.id,
    );
    await expect(
      reenrollStudent(
        inscrit.id,
        { academicYear: "2027-2028", level: "L2", ...REQUIRED_DOCS },
        actor.id,
        "AGENT_ADMINISTRATION",
      ),
    ).rejects.toThrow(/4\.50[\s\S]*superadmin peut forcer/);
  });

  it("un superadmin peut forcer le passage avec un motif, mais pas sans motif", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const superadmin = await createActor("SUPERADMIN");
    const inscrit = await enrollToInscrit(actor.id);
    // Moyenne insuffisante
    await assignAcademicResult(
      { studentId: inscrit.id, academicYear: inscrit.academicYear!, semester: "S1", average: 4 },
      actor.id,
    );
    await assignAcademicResult(
      { studentId: inscrit.id, academicYear: inscrit.academicYear!, semester: "S2", average: 5 },
      actor.id,
    );

    await expect(
      reenrollStudent(
        inscrit.id,
        { academicYear: "2027-2028", level: "L2", ...REQUIRED_DOCS },
        superadmin.id,
        "SUPERADMIN",
      ),
    ).rejects.toThrow(/motif est obligatoire/);

    const forced = await reenrollStudent(
      inscrit.id,
      {
        academicYear: "2027-2028",
        level: "L2",
        ...REQUIRED_DOCS,
        forceReason: "Cas exceptionnel validé en commission pédagogique",
      },
      superadmin.id,
      "SUPERADMIN",
    );
    expect(forced.level).toBe("L2");

    const forcedLog = await prisma.auditLog.findFirst({
      where: { action: "REENROLLMENT_FORCED", actorId: superadmin.id },
    });
    expect(forcedLog).not.toBeNull();
    expect(forcedLog?.details).toContain("Cas exceptionnel validé en commission pédagogique");
  });

  it("refuse si les pièces de réinscription ne sont pas toutes cochées", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);

    await expect(
      reenrollStudent(
        inscrit.id,
        { academicYear: "2027-2028", level: inscrit.level, docTranscript: true, docBlueFolder: false },
        actor.id,
        "AGENT_ADMINISTRATION",
      ),
    ).rejects.toThrow(/Pièces obligatoires manquantes/);
  });

  it("la reconversion de filière est libre, indépendamment du niveau", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);
    expect(inscrit.mention).toBe("Management");

    const reconverted = await reenrollStudent(
      inscrit.id,
      {
        academicYear: "2027-2028",
        level: inscrit.level,
        mention: "Finance-Comptabilité",
        ...REQUIRED_DOCS,
      },
      actor.id,
      "AGENT_ADMINISTRATION",
    );
    expect(reconverted.mention).toBe("Finance-Comptabilité");
    expect(reconverted.program).toBe("Finance-Comptabilité");
  });
});
