import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { canManageStudent, hasTaskPermission } from "@/lib/permissions";
import { disconnectDb, resetDb } from "../setup/db";
import { createActor, validRegisterInput } from "../setup/factories";
import { registerStudent } from "@/lib/students";

beforeEach(resetDb);
afterAll(disconnectDb);

describe("hasTaskPermission", () => {
  it("le superadmin a toujours tous les droits, sans permissions explicites", async () => {
    const admin = await createActor("SUPERADMIN");
    expect(await hasTaskPermission(admin.id, "SUPERADMIN", "inscription")).toBe(true);
  });

  it("un agent sans la permission explicite est refusé", async () => {
    const agent = await createActor("AGENT_ADMINISTRATION");
    expect(await hasTaskPermission(agent.id, "AGENT_ADMINISTRATION", "inscription")).toBe(false);
  });

  it("un agent avec la permission explicite est autorisé", async () => {
    const agent = await prisma.user.create({
      data: {
        email: "agent-autorise@test.local",
        passwordHash: "x",
        role: "AGENT_ADMINISTRATION",
        permissions: ["inscription"],
      },
    });
    expect(await hasTaskPermission(agent.id, "AGENT_ADMINISTRATION", "inscription")).toBe(true);
  });

  it("refuse une tâche hors du domaine du rôle, même listée dans permissions", async () => {
    // "inscription" est une tâche d'administration : un agent pédagogique ne
    // doit jamais pouvoir l'exercer, quoi que contienne son tableau permissions
    const agent = await prisma.user.create({
      data: {
        email: "agent-pedago@test.local",
        passwordHash: "x",
        role: "AGENT_PEDAGOGIQUE",
        permissions: ["inscription"],
      },
    });
    expect(await hasTaskPermission(agent.id, "AGENT_PEDAGOGIQUE", "inscription")).toBe(false);
  });
});

describe("canManageStudent (périmètre par formation)", () => {
  it("un agent sans formation affectée peut gérer n'importe quel dossier", async () => {
    const agent = await createActor("AGENT_ADMINISTRATION");
    const student = await registerStudent(
      validRegisterInput({ mention: "Informatique" }),
      agent.id,
    );
    expect(await canManageStudent(agent.id, "AGENT_ADMINISTRATION", student.id)).toBe(true);
  });

  it("un agent affecté à une formation ne peut pas gérer un dossier d'une autre formation", async () => {
    const agent = await prisma.user.create({
      data: {
        email: "secretaire-management@test.local",
        passwordHash: "x",
        role: "AGENT_ADMINISTRATION",
        formation: "Management",
      },
    });
    const student = await registerStudent(
      validRegisterInput({ mention: "Informatique" }),
      agent.id,
    );
    expect(await canManageStudent(agent.id, "AGENT_ADMINISTRATION", student.id)).toBe(false);
  });

  it("un agent affecté à une formation peut gérer un dossier de cette formation", async () => {
    const agent = await prisma.user.create({
      data: {
        email: "secretaire-management2@test.local",
        passwordHash: "x",
        role: "AGENT_ADMINISTRATION",
        formation: "Management",
      },
    });
    const student = await registerStudent(
      validRegisterInput({ mention: "Management" }),
      agent.id,
    );
    expect(await canManageStudent(agent.id, "AGENT_ADMINISTRATION", student.id)).toBe(true);
  });
});
