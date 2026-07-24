import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  registerStudent,
  recordEcolagePayment,
  validateAdminInscription,
  validatePedagoInscription,
} from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, createTariff, validRegisterInput } from "../setup/factories";

// Parcours complet d'un dossier : enregistrement -> 1ère tranche d'écolage
// versée -> validation administrative -> validation pédagogique (création
// automatique du compte). C'est le workflow central de l'application ; s'il
// régresse, plus rien derrière (impression du reçu, tableau de bord, compte
// étudiant...) n'est fiable.

beforeEach(async () => {
  await resetDb();
  await createTariff(); // "Management", filière par défaut de validRegisterInput
});
afterAll(disconnectDb);

describe("workflow d'inscription", () => {
  it("mène un dossier de ENREGISTRE à INSCRIT et crée le compte étudiant", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");

    const student = await registerStudent(validRegisterInput(), actor.id);
    expect(student.status).toBe("ENREGISTRE");
    expect(student.matricule).toMatch(/^FI2026-\d+$/);

    const afterPayment = await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id);
    expect(afterPayment.amount).toBe(1_000_000); // moitié du tarif (2 000 000 Ar)
    const reloadedAfterPayment = await prisma.student.findUniqueOrThrow({
      where: { id: student.id },
    });
    expect(reloadedAfterPayment.status).toBe("PAIEMENT_VERIFIE");
    expect(reloadedAfterPayment.receiptVerifiedAt).not.toBeNull();

    const afterAdmin = await validateAdminInscription(student.id, actor.id);
    expect(afterAdmin.status).toBe("ADMIN_VALIDEE");

    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const { student: finalStudent, email, password } = await validatePedagoInscription(
      student.id,
      pedagoActor.id,
    );
    expect(finalStudent.status).toBe("INSCRIT");
    expect(finalStudent.pedagoValidatedAt).not.toBeNull();
    expect(email).toMatch(/@student\.iugm\.edu$/);
    expect(password).toMatch(new RegExp(`^${student.matricule}-`));

    const account = await prisma.user.findUnique({ where: { email } });
    expect(account).not.toBeNull();
    expect(account?.role).toBe("ETUDIANT");
    expect(account?.mustChangePassword).toBe(true);

    const reloaded = await prisma.student.findUniqueOrThrow({ where: { id: student.id } });
    expect(reloaded.accountId).toBe(account?.id);
  });

  it("génère des matricules séquentiels uniques pour la même année", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const s1 = await registerStudent(validRegisterInput({ lastName: "RAKOTO" }), actor.id);
    const s2 = await registerStudent(validRegisterInput({ lastName: "RABE" }), actor.id);
    const s3 = await registerStudent(validRegisterInput({ lastName: "RASOA" }), actor.id);

    const matricules = [s1.matricule, s2.matricule, s3.matricule];
    expect(new Set(matricules).size).toBe(3); // tous distincts
    expect(matricules).toEqual(["FI2026-1", "FI2026-2", "FI2026-3"]);
  });

  it("refuse d'enregistrer deux fois la même tranche pour un dossier", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id);

    await expect(
      recordEcolagePayment(student.id, "TRANCHE_S1", "REC-002", actor.id),
    ).rejects.toThrow(/déjà enregistrée/);
  });

  it("refuse un versement total une fois une tranche déjà enregistrée", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id);

    await expect(
      recordEcolagePayment(student.id, "TOTALITE", "REC-002", actor.id),
    ).rejects.toThrow(/impossible de basculer/);
  });

  it("refuse la 2e tranche avant la 1ère", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    await expect(
      recordEcolagePayment(student.id, "TRANCHE_S2", "REC-001", actor.id),
    ).rejects.toThrow(/1ère tranche doit être enregistrée avant/);
  });

  it("refuse un versement si aucun tarif n'est configuré pour la filière", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(
      validRegisterInput({ mention: "Filière sans tarif" }),
      actor.id,
    );

    await expect(
      recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id),
    ).rejects.toThrow(/Aucun tarif configuré/);
  });

  it("refuse la validation pédagogique tant que l'administratif n'est pas validé", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id);
    // Pas de validateAdminInscription ici : le dossier reste PAIEMENT_VERIFIE

    await expect(validatePedagoInscription(student.id, actor.id)).rejects.toThrow(
      /inscription administrative n'a pas encore été faite/,
    );
  });

  it("rejette une année universitaire mal formée", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    await expect(
      registerStudent(validRegisterInput({ academicYear: "2026" }), actor.id),
    ).rejects.toThrow(/Année universitaire invalide/);
  });
});
