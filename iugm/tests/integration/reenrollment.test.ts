import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  registerStudent,
  recordEcolagePayment,
  validateAdminInscription,
  validatePedagoInscription,
  reenrollStudent,
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

    const reenrolled = await reenrollStudent(
      inscrit.id,
      { academicYear: "2027-2028", level: "L2" },
      actor.id,
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

    const history = await prisma.enrollmentHistory.findFirst({
      where: { studentId: inscrit.id, academicYear: "2026-2027" },
    });
    expect(history).not.toBeNull();
    expect(history?.status).toBe("INSCRIT");
    // Régression : l'horodatage de l'année archivée doit être conservé, sinon
    // il disparaît du graphique du tableau de bord (voir tests/integration/dashboard.test.ts)
    expect(history?.pedagoValidatedAt).toEqual(inscrit.pedagoValidatedAt);
    expect(history?.receiptVerifiedAt).toEqual(inscrit.receiptVerifiedAt);
  });

  it("code R (redoublant) quand le niveau ne change pas, puis T au redoublement suivant", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);

    const redoublant = await reenrollStudent(
      inscrit.id,
      { academicYear: "2027-2028", level: inscrit.level },
      actor.id,
    );
    expect(redoublant.repeatCode).toBe("R");

    // Deuxième cycle jusqu'à INSCRIT pour 2027-2028, puis réinscription au même niveau
    await recordEcolagePayment(redoublant.id, "TRANCHE_S1", "REC-002", actor.id);
    await validateAdminInscription(redoublant.id, actor.id);
    await validatePedagoInscription(redoublant.id, actor.id);

    const triplant = await reenrollStudent(
      redoublant.id,
      { academicYear: "2028-2029", level: redoublant.level },
      actor.id,
    );
    expect(triplant.repeatCode).toBe("T");
  });

  it("refuse de réinscrire un dossier qui n'est pas encore INSCRIT", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    await expect(
      reenrollStudent(student.id, { academicYear: "2027-2028" }, actor.id),
    ).rejects.toThrow(/inscription est finalisée/);
  });

  it("refuse de réinscrire deux fois pour la même année universitaire", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);

    await expect(
      reenrollStudent(inscrit.id, { academicYear: inscrit.academicYear! }, actor.id),
    ).rejects.toThrow(/déjà inscrit pour/);
  });

  it("refuse d'archiver deux fois la même année universitaire", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const inscrit = await enrollToInscrit(actor.id);
    await reenrollStudent(inscrit.id, { academicYear: "2027-2028" }, actor.id);

    // Nouveau cycle jusqu'à INSCRIT pour 2027-2028, puis tentative de
    // réinscrire vers une année déjà présente dans l'historique (2026-2027)
    const secondActor = await createActor("AGENT_PEDAGOGIQUE");
    await recordEcolagePayment(inscrit.id, "TRANCHE_S1", "REC-002", actor.id);
    await validateAdminInscription(inscrit.id, actor.id);
    await validatePedagoInscription(inscrit.id, secondActor.id);

    await expect(
      reenrollStudent(inscrit.id, { academicYear: "2026-2027" }, actor.id),
    ).rejects.toThrow(/déjà une inscription archivée/);
  });
});
