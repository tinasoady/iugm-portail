import { afterAll, describe, expect, it } from "vitest";

import { checkDatabase, getHealthReport } from "@/lib/health";
import { disconnectDb } from "../setup/db";

afterAll(disconnectDb);

describe("contrôle de santé", () => {
  it("signale une base joignable", async () => {
    expect(await checkDatabase()).toBe(true);
    const report = await getHealthReport();
    expect(report).toMatchObject({ status: "ok", database: "ok" });
    expect(report.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(new Date(report.timestamp).getTime()).toBeGreaterThan(Date.now() - 10_000);
  });

  it("ne révèle aucun détail interne dans la réponse", async () => {
    const serialized = JSON.stringify(await getHealthReport());
    expect(serialized).not.toMatch(/postgres|password|DATABASE_URL|localhost|iugm_/i);
  });

  it("juge la base en panne si elle ne répond pas dans le délai", async () => {
    const neverAnswers = () => new Promise<never>(() => {});
    expect(await checkDatabase(50, neverAnswers)).toBe(false);
  });

  it("juge la base en panne si la requête échoue", async () => {
    const fails = () => Promise.reject(new Error("connexion refusée"));
    expect(await checkDatabase(1000, fails)).toBe(false);
  });
});
