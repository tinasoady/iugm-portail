import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { applySyncedMutation, type MutationHandler } from "@/lib/sync-mutations";
import { prisma } from "@/lib/prisma";
import { createActor } from "../setup/factories";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(resetDb);
afterAll(disconnectDb);

const NOW = Date.now();

function request(id: string, type = "ok") {
  return { id, type, payload: { a: "1" }, queuedAt: NOW };
}

describe("applySyncedMutation : une mutation, au plus une application", () => {
  async function setup() {
    const actor = await createActor("AGENT_ADMINISTRATION");
    const session = { sub: actor.id, role: actor.role };
    let applied = 0;
    const handlers: Record<string, MutationHandler> = {
      ok: async () => {
        applied++;
        // Laisse aux requêtes concurrentes le temps de se chevaucher
        await new Promise((r) => setTimeout(r, 30));
        return { label: "Test appliqué" };
      },
      refuse: async () => ({ error: "Refus métier" }),
      crash: async () => {
        throw new Error("Panne inattendue");
      },
    };
    return { session, handlers, applied: () => applied };
  }

  it("applique une mutation et la trace", async () => {
    const { session, handlers, applied } = await setup();
    const outcome = await applySyncedMutation(request("m-1"), session, handlers);
    expect(outcome).toEqual({ status: 200, body: { ok: true, label: "Test appliqué" } });
    expect(applied()).toBe(1);
    expect(await prisma.syncedMutation.count({ where: { id: "m-1" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "OFFLINE_MUTATION_SYNCED" } })).toBe(1);
  });

  it("un rejeu séquentiel n'applique pas deux fois", async () => {
    const { session, handlers, applied } = await setup();
    await applySyncedMutation(request("m-2"), session, handlers);
    const replay = await applySyncedMutation(request("m-2"), session, handlers);
    expect(replay).toEqual({ status: 200, body: { ok: true, alreadyApplied: true } });
    expect(applied()).toBe(1);
  });

  it("des requêtes simultanées avec le même id n'appliquent qu'une fois", async () => {
    const { session, handlers, applied } = await setup();
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => applySyncedMutation(request("m-3"), session, handlers)),
    );
    expect(applied()).toBe(1);
    expect(outcomes.every((o) => o.status === 200)).toBe(true);
    expect(outcomes.filter((o) => o.body.alreadyApplied === true)).toHaveLength(4);
    expect(await prisma.syncedMutation.count()).toBe(1);
  });

  it("des identifiants différents sont appliqués indépendamment", async () => {
    const { session, handlers, applied } = await setup();
    await Promise.all([
      applySyncedMutation(request("m-4a"), session, handlers),
      applySyncedMutation(request("m-4b"), session, handlers),
    ]);
    expect(applied()).toBe(2);
  });

  it("un refus métier libère l'identifiant : un rejeu corrigé peut aboutir", async () => {
    const { session, handlers } = await setup();
    const refused = await applySyncedMutation(request("m-5", "refuse"), session, handlers);
    expect(refused).toEqual({ status: 422, body: { error: "Refus métier" } });
    expect(await prisma.syncedMutation.count()).toBe(0);

    // Même id, cette fois accepté
    const retried = await applySyncedMutation(request("m-5", "ok"), session, handlers);
    expect(retried.status).toBe(200);
    expect(retried.body.alreadyApplied).toBeUndefined();
  });

  it("une panne inattendue libère aussi l'identifiant et propage l'erreur", async () => {
    const { session, handlers } = await setup();
    await expect(applySyncedMutation(request("m-6", "crash"), session, handlers)).rejects.toThrow(
      /Panne inattendue/,
    );
    expect(await prisma.syncedMutation.count()).toBe(0);
  });

  it("refuse les requêtes mal formées sans rien réserver", async () => {
    const { session, handlers } = await setup();
    const bad = [
      {},
      { id: "x" },
      { id: "x", type: "ok" },
      { id: "x", type: "ok", payload: {} },
      { id: "x", type: "ok", payload: {}, queuedAt: Number.NaN },
      { id: "x", type: "ok", payload: {}, queuedAt: 8.64e15 + 1 },
    ];
    for (const req of bad) {
      const outcome = await applySyncedMutation(req, session, handlers);
      expect(outcome.status).toBe(400);
    }
    expect(await prisma.syncedMutation.count()).toBe(0);
  });

  it("refuse un type inconnu, y compris les noms hérités d'Object.prototype", async () => {
    const { session, handlers } = await setup();
    for (const type of ["inconnu", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const outcome = await applySyncedMutation(request("m-7", type), session, handlers);
      expect(outcome.status).toBe(400);
    }
    expect(await prisma.syncedMutation.count()).toBe(0);
  });
});
