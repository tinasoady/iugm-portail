import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { registerStudent, updateStudent } from "@/lib/students";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, validRegisterInput, validUpdateInput } from "../setup/factories";

beforeEach(resetDb);
afterAll(disconnectDb);

describe("updateStudent — validation du téléphone", () => {
  it("rejette un numéro de téléphone étudiant invalide", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    await expect(
      updateStudent(student.id, validUpdateInput({ phone: "0391234567" }), actor.id),
    ).rejects.toThrow(/téléphone de l'étudiant invalide/);
  });

  it("rejette un numéro de téléphone de la personne à contacter invalide", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    await expect(
      updateStudent(student.id, validUpdateInput({ guardianPhone: "12345" }), actor.id),
    ).rejects.toThrow(/téléphone de la personne à contacter invalide/);
  });

  it("accepte des numéros valides et les normalise", async () => {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(validRegisterInput(), actor.id);

    const updated = await updateStudent(
      student.id,
      validUpdateInput({ phone: "038 99 888 77", guardianPhone: "0331234567" }),
      actor.id,
    );
    expect(updated.phone).toBe("0389988877");
    expect(updated.guardianPhone).toBe("0331234567");
  });
});
