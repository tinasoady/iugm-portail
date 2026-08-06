import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  registerStudent,
  recordEcolagePayment,
  verifyRegistrationPayment,
  validateAdminInscription,
  validatePedagoInscription,
} from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, createLevelFinancialInfo, validRegisterInput } from "../setup/factories";

// Parcours complet d'un dossier : enregistrement -> paiement d'inscription
// vérifié -> validation administrative -> validation pédagogique (création
// automatique du compte). C'est le workflow central de l'application ; s'il
// régresse, plus rien derrière (impression du reçu, tableau de bord, compte
// étudiant...) n'est fiable.

beforeEach(async () => {
  await resetDb();
  // "L1" correspond au niveau par défaut de validRegisterInput ; tuitionLocal
  // fixé à une valeur ronde pour des assertions lisibles (le reste des
  // montants garde les valeurs par défaut de lib/finance.ts).
  await createLevelFinancialInfo("L1", { tuitionLocal: 2_000_000 });
});
afterAll(disconnectDb);

describe("workflow d'inscription", () => {
  it("mène un dossier de ENREGISTRE à INSCRIT et crée le compte étudiant", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");

    const student = await registerStudent(validRegisterInput(), actor.id);
    expect(student.status).toBe("ENREGISTRE");
    expect(student.matricule).toMatch(/^FI2026-\d+$/);

    // Montant versé par l'agent : au-dessus du minimum requis (290 000 Ar :
    // droit d'inscription + assurance + polo + premier versement), en deçà
    // du tarif annuel plein (2 000 000 Ar) => 1ère tranche.
    const afterPayment = await verifyRegistrationPayment(student.id, "REC-001", 400_000, actor.id);
    expect(afterPayment.payment.amount).toBe(400_000);
    expect(afterPayment.payment.type).toBe("TRANCHE_S1");
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

  it("refuse le paiement d'inscription si le montant versé est insuffisant", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    // 200 000 Ar < minimum requis (290 000 Ar)
    await expect(
      verifyRegistrationPayment(student.id, "REC-001", 200_000, actor.id),
    ).rejects.toThrow(/Montant insuffisant/);
  });

  it("enregistre un versement total quand le montant couvre le tarif annuel plein", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    const result = await verifyRegistrationPayment(student.id, "REC-001", 2_000_000, actor.id);
    expect(result.payment.type).toBe("TOTALITE");
    expect(result.payment.amount).toBe(2_000_000);
    expect(result.remainingBalance).toBe(0);
  });

  it("refuse une 2e vérification de paiement une fois le dossier débloqué", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await verifyRegistrationPayment(student.id, "REC-001", 400_000, actor.id);

    await expect(
      verifyRegistrationPayment(student.id, "REC-002", 400_000, actor.id),
    ).rejects.toThrow(/plus en attente/);
  });

  it("refuse la 2e tranche avant la 1ère", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    await expect(
      recordEcolagePayment(student.id, "TRANCHE_S2", "REC-001", actor.id),
    ).rejects.toThrow(/1ère tranche doit être enregistrée avant/);
  });

  it("refuse un versement si le dossier n'a pas de niveau défini", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput({ level: "" }), actor.id);

    await expect(
      verifyRegistrationPayment(student.id, "REC-001", 400_000, actor.id),
    ).rejects.toThrow(/n'a pas de niveau défini/);
  });

  it("refuse la validation pédagogique tant que l'administratif n'est pas validé", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await verifyRegistrationPayment(student.id, "REC-001", 400_000, actor.id);
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

  it("rejette un numéro de téléphone étudiant invalide", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    await expect(
      registerStudent(validRegisterInput({ phone: "0391234567" }), actor.id),
    ).rejects.toThrow(/téléphone de l'étudiant invalide/);
    await expect(
      registerStudent(validRegisterInput({ phone: "034123456" }), actor.id),
    ).rejects.toThrow(/téléphone de l'étudiant invalide/);
  });

  it("rejette un numéro de téléphone de la personne à contacter invalide", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    await expect(
      registerStudent(validRegisterInput({ guardianPhone: "0021112233" }), actor.id),
    ).rejects.toThrow(/téléphone de la personne à contacter invalide/);
  });

  it("accepte un numéro de téléphone saisi avec des espaces et le normalise", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(
      validRegisterInput({ phone: "034 12 345 67" }),
      actor.id,
    );
    expect(student.phone).toBe("0341234567");
  });
});
