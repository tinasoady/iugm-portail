import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  registerStudent,
  getOrCreateStudentQrToken,
  regenerateStudentQrToken,
  getStudentByQrToken,
} from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, createTariff, validRegisterInput } from "../setup/factories";

beforeEach(async () => {
  await resetDb();
  await createTariff();
});
afterAll(disconnectDb);

describe("carte étudiante numérique (QR code)", () => {
  it("crée un jeton au premier appel puis le renvoie tel quel ensuite", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    expect(student.qrToken).toBeNull();

    const token = await getOrCreateStudentQrToken(student.id);
    expect(token).toBeTruthy();

    const again = await getOrCreateStudentQrToken(student.id);
    expect(again).toBe(token);
  });

  it("résout un jeton valide vers les seules informations publiques de la carte", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    const token = await getOrCreateStudentQrToken(student.id);

    const card = await getStudentByQrToken(token);
    expect(card).not.toBeNull();
    expect(card?.matricule).toBe(student.matricule);
    expect(card?.fullName).toBe(student.fullName);
    // Aucune donnée sensible du dossier ne doit fuiter via ce canal public
    expect(card).not.toHaveProperty("cin");
    expect(card).not.toHaveProperty("address");
    expect(card).not.toHaveProperty("phone");
    expect(card).not.toHaveProperty("initialPassword");
  });

  it("renvoie null pour un jeton inconnu", async () => {
    expect(await getStudentByQrToken("jeton-inexistant")).toBeNull();
  });

  it("régénère le jeton et invalide l'ancien", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);
    const oldToken = await getOrCreateStudentQrToken(student.id);

    const newToken = await regenerateStudentQrToken(student.id, actor.id);
    expect(newToken).not.toBe(oldToken);

    expect(await getStudentByQrToken(oldToken)).toBeNull();
    expect(await getStudentByQrToken(newToken)).not.toBeNull();
  });
});
