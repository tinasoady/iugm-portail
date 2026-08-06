import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { getInscriptionTrend, getEcolageRevenueTrend } from "@/lib/dashboard";
import {
  registerStudent,
  recordEcolagePayment,
  verifyRegistrationPayment,
  validateAdminInscription,
  validatePedagoInscription,
  reenrollStudent,
} from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, createLevelFinancialInfo, validRegisterInput } from "../setup/factories";

beforeEach(resetDb);
afterAll(disconnectDb);

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setDate(1); // évite tout débordement de mois avec setMonth sur un 29/30/31
  d.setMonth(d.getMonth() - n);
  return d;
}

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

describe("getInscriptionTrend", () => {
  it("sans aucun dossier, renvoie des mois à zéro (pas des mois manquants)", async () => {
    const trend = await getInscriptionTrend({ monthsBack: 6 });
    expect(trend.months).toHaveLength(6);
    expect(trend.registrations).toEqual([0, 0, 0, 0, 0, 0]);
    expect(trend.payments).toEqual([0, 0, 0, 0, 0, 0]);
    expect(trend.inscriptions).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("compte les événements du mois courant", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id);
    await validateAdminInscription(student.id, actor.id);
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    await validatePedagoInscription(student.id, pedagoActor.id);

    const trend = await getInscriptionTrend({ monthsBack: 6 });
    const currentIndex = trend.months.length - 1;
    expect(trend.registrations[currentIndex]).toBe(1);
    expect(trend.payments[currentIndex]).toBe(1);
    expect(trend.inscriptions[currentIndex]).toBe(1);
  });

  // Régression directe du bug corrigé cette session : reenrollStudent() remet
  // receiptVerifiedAt/pedagoValidatedAt à zéro sur le dossier actif pour
  // repartir sur la nouvelle année. Sans l'archivage dans EnrollmentHistory
  // (et son union dans getInscriptionTrend), ces événements passés
  // disparaissaient du graphique dès qu'un étudiant se réinscrivait.
  it("une réinscription ne fait pas disparaître les événements passés du graphique", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id);
    await validateAdminInscription(student.id, actor.id);
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const { student: inscrit } = await validatePedagoInscription(student.id, pedagoActor.id);

    // On antidate le dossier de 2 mois, comme s'il avait été traité alors
    const pastDate = monthsAgo(2);
    await prisma.student.update({
      where: { id: inscrit.id },
      data: {
        createdAt: pastDate,
        receiptVerifiedAt: pastDate,
        pedagoValidatedAt: pastDate,
      },
    });

    const beforeReenroll = await getInscriptionTrend({ monthsBack: 6 });
    const pastIndex = beforeReenroll.months.indexOf(monthKeyOf(pastDate));
    expect(pastIndex).toBeGreaterThanOrEqual(0);
    expect(beforeReenroll.payments[pastIndex]).toBe(1);
    expect(beforeReenroll.inscriptions[pastIndex]).toBe(1);

    // Réinscription au même niveau (redoublant) : pas soumise à la condition
    // de moyenne, qui ne s'applique qu'au passage au niveau supérieur.
    await reenrollStudent(
      inscrit.id,
      { academicYear: "2027-2028", level: inscrit.level, docTranscript: true, docBlueFolder: true },
      actor.id,
      "AGENT_ADMINISTRATION",
    );

    const afterReenroll = await getInscriptionTrend({ monthsBack: 6 });
    // Même mois passé : toujours 1, pas 0 — l'événement a été archivé, pas perdu
    expect(afterReenroll.payments[pastIndex]).toBe(1);
    expect(afterReenroll.inscriptions[pastIndex]).toBe(1);
    // Le mois courant (celui de la réinscription elle-même) ne gagne pas ces
    // compteurs : le dossier reenrollé repart en ENREGISTRE, pas encore payé/validé
    const currentIndex = afterReenroll.months.length - 1;
    expect(afterReenroll.payments[currentIndex]).toBe(0);
    expect(afterReenroll.inscriptions[currentIndex]).toBe(0);
  });

  it("mode année universitaire : fenêtre fixe de 12 mois, de septembre à août", async () => {
    const trend = await getInscriptionTrend({ academicYear: "2026-2027" });
    expect(trend.months).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
    ]);
  });

  it("mode année universitaire : compte un événement archivé d'une année déjà terminée", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await recordEcolagePayment(student.id, "TRANCHE_S1", "REC-001", actor.id);
    await validateAdminInscription(student.id, actor.id);
    const pedagoActor = await createActor("AGENT_PEDAGOGIQUE");
    const { student: inscrit } = await validatePedagoInscription(student.id, pedagoActor.id);

    // Dossier traité en octobre 2024, une année universitaire déjà terminée
    const eventDate = new Date(2024, 9, 15);
    await prisma.student.update({
      where: { id: inscrit.id },
      data: { receiptVerifiedAt: eventDate, pedagoValidatedAt: eventDate },
    });
    await reenrollStudent(
      inscrit.id,
      { academicYear: "2025-2026", level: inscrit.level, docTranscript: true, docBlueFolder: true },
      actor.id,
      "AGENT_ADMINISTRATION",
    );

    const trend = await getInscriptionTrend({ academicYear: "2024-2025" });
    const index = trend.months.indexOf("2024-10");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(trend.payments[index]).toBe(1);
    expect(trend.inscriptions[index]).toBe(1);
  });
});

describe("getEcolageRevenueTrend", () => {
  it("sans dossier dans la sélection, budget et encaissé restent nuls", async () => {
    const trend = await getEcolageRevenueTrend({ monthsBack: 3 });
    expect(trend.months).toHaveLength(3);
    expect(trend.budget).toBe(0);
    expect(trend.collected).toEqual([0, 0, 0]);
  });

  it("le budget est la somme des frais de formation annuels des dossiers de la sélection", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 700_000 });
    const actor = await createActor("AGENT_ADMINISTRATION");
    await registerStudent(validRegisterInput({ lastName: "RAKOTO" }), actor.id);
    await registerStudent(validRegisterInput({ lastName: "RABE" }), actor.id);

    const trend = await getEcolageRevenueTrend({ monthsBack: 3 });
    expect(trend.budget).toBe(1_400_000); // 2 étudiants x 700 000 Ar
  });

  it("le montant encaissé du mois courant est cumulatif et reste nul les mois précédents", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 700_000 });
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    await verifyRegistrationPayment(student.id, "REC-001", 400_000, actor.id);

    const trend = await getEcolageRevenueTrend({ monthsBack: 3 });
    const currentIndex = trend.months.length - 1;
    expect(trend.collected[currentIndex]).toBe(400_000);
    expect(trend.collected[0]).toBe(0);
  });

  it("filtre par niveau : ignore les dossiers d'un autre niveau", async () => {
    await createLevelFinancialInfo("L1", { tuitionLocal: 700_000 });
    await createLevelFinancialInfo("L2", { tuitionLocal: 900_000 });
    const actor = await createActor("AGENT_ADMINISTRATION");
    await registerStudent(validRegisterInput({ level: "L1" }), actor.id);
    await registerStudent(validRegisterInput({ level: "L2", lastName: "RABE" }), actor.id);

    const trend = await getEcolageRevenueTrend({ monthsBack: 3, level: "L1" });
    expect(trend.budget).toBe(700_000);
  });
});
