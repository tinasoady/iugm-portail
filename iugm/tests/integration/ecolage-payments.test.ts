import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  registerStudent,
  recordEcolagePayment,
  getEcolageStats,
  listStudentsWithBalanceDue,
  getStudentBalanceDue,
} from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, createTariff, validRegisterInput } from "../setup/factories";

beforeEach(resetDb);
afterAll(disconnectDb);

describe("recordEcolagePayment — calcul du montant", () => {
  it("une tranche vaut la moitié du tarif annuel, arrondie", async () => {
    await createTariff("Management", 1_500_001); // impair, pour vérifier l'arrondi
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    const payment = await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id);
    expect(payment.amount).toBe(Math.round(1_500_001 / 2));
  });

  it("un versement total vaut le tarif annuel plein", async () => {
    await createTariff("Management", 2_000_000);
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    const payment = await recordEcolagePayment(student.id, "TOTALITE", "REC-001", actor.id);
    expect(payment.amount).toBe(2_000_000);
  });

  it("la 2e tranche complète l'année sans repasser par le statut ENREGISTRE", async () => {
    await createTariff("Management", 2_000_000);
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id);
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
    await createTariff("Management", 2_000_000);
    const actor = await createActor("AGENT_ADMINISTRATION");

    const unpaid = await registerStudent(validRegisterInput({ lastName: "UNPAID" }), actor.id);
    const partial = await registerStudent(validRegisterInput({ lastName: "PARTIAL" }), actor.id);
    await recordEcolagePayment(partial.id, "TRANCHE_S1", "REC-P1", actor.id);
    const full = await registerStudent(validRegisterInput({ lastName: "FULL" }), actor.id);
    await recordEcolagePayment(full.id, "TOTALITE", "REC-F1", actor.id);

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
  it("exclut les dossiers déjà soldés et donne le montant restant dû", async () => {
    await createTariff("Management", 2_000_000);
    const actor = await createActor("AGENT_ADMINISTRATION");

    const unpaid = await registerStudent(validRegisterInput({ lastName: "UNPAID" }), actor.id);
    const partial = await registerStudent(validRegisterInput({ lastName: "PARTIAL" }), actor.id);
    await recordEcolagePayment(partial.id, "TRANCHE_S1", "REC-P1", actor.id);
    const full = await registerStudent(validRegisterInput({ lastName: "FULL" }), actor.id);
    await recordEcolagePayment(full.id, "TOTALITE", "REC-F1", actor.id);

    const due = await listStudentsWithBalanceDue(unpaid.academicYear!);
    const ids = due.map((d) => d.id);
    expect(ids).toContain(unpaid.id);
    expect(ids).toContain(partial.id);
    expect(ids).not.toContain(full.id);

    const unpaidEntry = due.find((d) => d.id === unpaid.id)!;
    expect(unpaidEntry.paymentStatus).toBe("UNPAID");
    expect(unpaidEntry.amountDue).toBe(2_000_000);

    const partialEntry = due.find((d) => d.id === partial.id)!;
    expect(partialEntry.paymentStatus).toBe("PARTIAL");
    expect(partialEntry.amountDue).toBe(1_000_000);
  });

  it("renvoie un montant dû nul (pas zéro) quand aucun tarif n'est configuré", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(
      validRegisterInput({ mention: "Filière sans tarif" }),
      actor.id,
    );

    const due = await listStudentsWithBalanceDue(student.academicYear!);
    const entry = due.find((d) => d.id === student.id)!;
    expect(entry.paymentStatus).toBe("UNPAID");
    expect(entry.amountDue).toBeNull();
  });
});

describe("getStudentBalanceDue", () => {
  it("montre la 2e tranche restante pour un dossier partiel", async () => {
    await createTariff("Management", 2_000_000);
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id);

    const balance = await getStudentBalanceDue(student.id);
    expect(balance.status).toBe("PARTIAL");
    expect(balance.annualAmount).toBe(2_000_000);
    expect(balance.paidAmount).toBe(1_000_000);
    expect(balance.amountDue).toBe(1_000_000);
  });

  it("montant dû à zéro une fois l'année soldée", async () => {
    await createTariff("Management", 2_000_000);
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await recordEcolagePayment(student.id, "TOTALITE", "REC-001", actor.id);

    const balance = await getStudentBalanceDue(student.id);
    expect(balance.status).toBe("FULL");
    expect(balance.amountDue).toBe(0);
  });

  it("montant dû nul (pas zéro) quand aucun tarif n'est configuré", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(
      validRegisterInput({ mention: "Filière sans tarif" }),
      actor.id,
    );

    const balance = await getStudentBalanceDue(student.id);
    expect(balance.status).toBe("UNPAID");
    expect(balance.annualAmount).toBeNull();
    expect(balance.amountDue).toBeNull();
  });
});
