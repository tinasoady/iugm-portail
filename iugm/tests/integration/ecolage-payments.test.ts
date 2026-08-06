import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  registerStudent,
  recordEcolagePayment,
  verifyRegistrationPayment,
  getEcolageStats,
  listStudentsWithBalanceDue,
  getStudentBalanceDue,
} from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, createLevelFinancialInfo, validRegisterInput } from "../setup/factories";

beforeEach(resetDb);
afterAll(disconnectDb);

describe("recordEcolagePayment — calcul du montant", () => {
  it("la 2e tranche vaut la moitié du tarif annuel du niveau, arrondie", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 1_500_001 }); // impair, pour vérifier l'arrondi
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await verifyRegistrationPayment(student.id, "REC-001", 400_000, actor.id);

    const s2 = await recordEcolagePayment(student.id, "TRANCHE_S2", "REC-002", actor.id);
    expect(s2.amount).toBe(Math.round(1_500_001 / 2));
  });

  it("un versement total à l'inscription vaut le montant réellement versé", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 2_000_000 });
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    const result = await verifyRegistrationPayment(student.id, "REC-001", 2_000_000, actor.id);
    expect(result.payment.type).toBe("TOTALITE");
    expect(result.payment.amount).toBe(2_000_000);
  });

  it("la 2e tranche complète l'année sans repasser par le statut ENREGISTRE", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 2_000_000 });
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    await verifyRegistrationPayment(student.id, "REC-001", 400_000, actor.id);
    const s2 = await recordEcolagePayment(student.id, "TRANCHE_S2", "REC-002", actor.id);
    expect(s2.amount).toBe(1_000_000);

    const stats = await getEcolageStats(student.academicYear!);
    expect(stats.full).toBe(1);
    expect(stats.partial).toBe(0);
    expect(stats.unpaid).toBe(0);
  });
});

describe("getEcolageStats", () => {
  it("classe correctement non payé / partiel / intégral", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 2_000_000 });
    const actor = await createActor("AGENT_ADMINISTRATION");

    const unpaid = await registerStudent(validRegisterInput({ lastName: "UNPAID" }), actor.id);
    const partial = await registerStudent(validRegisterInput({ lastName: "PARTIAL" }), actor.id);
    await verifyRegistrationPayment(partial.id, "REC-P1", 400_000, actor.id);
    const full = await registerStudent(validRegisterInput({ lastName: "FULL" }), actor.id);
    await verifyRegistrationPayment(full.id, "REC-F1", 2_000_000, actor.id);

    const stats = await getEcolageStats(unpaid.academicYear!);
    expect(stats.total).toBe(3);
    expect(stats.unpaid).toBe(1);
    expect(stats.partial).toBe(1);
    expect(stats.full).toBe(1);

    const byFormation = stats.byFormation.find((f) => f.formation === "Management");
    expect(byFormation).toMatchObject({ full: 1, partial: 1, unpaid: 1, total: 3 });
  });
});

describe("listStudentsWithBalanceDue", () => {
  it("exclut les dossiers déjà soldés et donne le montant restant réellement dû", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 2_000_000 });
    const actor = await createActor("AGENT_ADMINISTRATION");

    const unpaid = await registerStudent(validRegisterInput({ lastName: "UNPAID" }), actor.id);
    const partial = await registerStudent(validRegisterInput({ lastName: "PARTIAL" }), actor.id);
    await verifyRegistrationPayment(partial.id, "REC-P1", 400_000, actor.id);
    const full = await registerStudent(validRegisterInput({ lastName: "FULL" }), actor.id);
    await verifyRegistrationPayment(full.id, "REC-F1", 2_000_000, actor.id);

    const due = await listStudentsWithBalanceDue(unpaid.academicYear!);
    const ids = due.map((d) => d.id);
    expect(ids).toContain(unpaid.id);
    expect(ids).toContain(partial.id);
    expect(ids).not.toContain(full.id);

    const unpaidEntry = due.find((d) => d.id === unpaid.id)!;
    expect(unpaidEntry.paymentStatus).toBe("UNPAID");
    expect(unpaidEntry.amountDue).toBe(2_000_000);

    // 2 000 000 - 400 000 réellement versés = 1 600 000, PAS la moitié
    // figée (1 000 000) : un versement à l'inscription au-dessus du minimum
    // requis doit réduire d'autant le reste dû (voir la note dans
    // listStudentsWithBalanceDue, lib/students.ts).
    const partialEntry = due.find((d) => d.id === partial.id)!;
    expect(partialEntry.paymentStatus).toBe("PARTIAL");
    expect(partialEntry.amountDue).toBe(1_600_000);
  });

  it("le reste dû tient compte d'un premier versement supérieur au minimum requis", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 2_000_000 });
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    // Nettement plus que le minimum requis (290 000 Ar)
    const { remainingBalance } = await verifyRegistrationPayment(
      student.id,
      "REC-001",
      1_200_000,
      actor.id,
    );
    expect(remainingBalance).toBe(800_000);

    const due = await listStudentsWithBalanceDue(student.academicYear!);
    const entry = due.find((d) => d.id === student.id)!;
    expect(entry.amountDue).toBe(800_000);

    // La 2e tranche solde exactement ce reste (montant explicite, plus une
    // simple moitié figée du tarif annuel).
    const s2 = await recordEcolagePayment(student.id, "TRANCHE_S2", "REC-002", actor.id, 800_000);
    expect(s2.amount).toBe(800_000);
    const balance = await getStudentBalanceDue(student.id);
    expect(balance.status).toBe("FULL");
    expect(balance.amountDue).toBe(0);
  });

  it("renvoie un montant dû nul (pas zéro) quand le dossier n'a pas de niveau défini", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput({ level: "" }), actor.id);

    const due = await listStudentsWithBalanceDue(student.academicYear!);
    const entry = due.find((d) => d.id === student.id)!;
    expect(entry.paymentStatus).toBe("UNPAID");
    expect(entry.amountDue).toBeNull();
  });
});

describe("getStudentBalanceDue", () => {
  it("montre la 2e tranche restante pour un dossier partiel", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 2_000_000 });
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await verifyRegistrationPayment(student.id, "REC-001", 1_000_000, actor.id);

    const balance = await getStudentBalanceDue(student.id);
    expect(balance.status).toBe("PARTIAL");
    expect(balance.annualAmount).toBe(2_000_000);
    expect(balance.paidAmount).toBe(1_000_000);
    expect(balance.amountDue).toBe(1_000_000);
  });

  it("montant dû à zéro une fois l'année soldée", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 2_000_000 });
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await verifyRegistrationPayment(student.id, "REC-001", 2_000_000, actor.id);

    const balance = await getStudentBalanceDue(student.id);
    expect(balance.status).toBe("FULL");
    expect(balance.amountDue).toBe(0);
  });

  it("montant dû nul (pas zéro) quand le dossier n'a pas de niveau défini", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput({ level: "" }), actor.id);

    const balance = await getStudentBalanceDue(student.id);
    expect(balance.status).toBe("UNPAID");
    expect(balance.annualAmount).toBeNull();
    expect(balance.amountDue).toBeNull();
  });
});
