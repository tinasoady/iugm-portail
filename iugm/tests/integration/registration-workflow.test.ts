import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  registerStudent,
  verifyReceipt,
  validateAdminInscription,
  validatePedagoInscription,
} from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, validRegisterInput } from "../setup/factories";

// Parcours complet d'un dossier : enregistrement -> reçu vérifié -> validation
// administrative -> validation pédagogique (création automatique du compte).
// C'est le workflow central de l'application ; s'il régresse, plus rien
// derrière (impression du reçu, tableau de bord, compte étudiant...) n'est fiable.

beforeEach(resetDb);
afterAll(disconnectDb);

describe("workflow d'inscription", () => {
  it("mène un dossier de ENREGISTRE à INSCRIT et crée le compte étudiant", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");

    const student = await registerStudent(validRegisterInput(), actor.id);
    expect(student.status).toBe("ENREGISTRE");
    expect(student.matricule).toMatch(/^FI2026-\d+$/);

    const afterReceipt = await verifyReceipt(student.id, "REC-001", actor.id);
    expect(afterReceipt.status).toBe("PAIEMENT_VERIFIE");
    expect(afterReceipt.receiptVerifiedAt).not.toBeNull();

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

  it("refuse de vérifier deux fois le reçu d'un même dossier", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await verifyReceipt(student.id, "REC-001", actor.id);

    await expect(verifyReceipt(student.id, "REC-002", actor.id)).rejects.toThrow(
      /déjà été vérifié/,
    );
  });

  it("refuse la validation pédagogique tant que l'administratif n'est pas validé", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await verifyReceipt(student.id, "REC-001", actor.id);
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
