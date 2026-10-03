import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// authenticateUser lit l'IP via next/headers, et getSessionStatus lit le cookie :
// tous deux n'existent que dans une vraie requête.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.7" }),
  cookies: async () => ({ get: (name: string) => (name === "iugm_session" && cookieValue ? { value: cookieValue } : undefined) }),
}));

import {
  createSessionToken,
  evaluateSession,
  getSessionStatus,
  resolveSession,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth";
import { authenticateUser, completeTwoFactorLogin } from "@/lib/login";
import { prisma } from "@/lib/prisma";
import { totpAt } from "@/lib/totp";
import { beginTwoFactorSetup, confirmTwoFactorSetup } from "@/lib/two-factor";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(async () => {
  await resetDb();
  cookieValue = undefined;
});
afterAll(disconnectDb);

const PASSWORD = "Motdepasse-2026";

async function createUser(email = "agent@test.local", role: "AGENT_ADMINISTRATION" | "SUPERADMIN" | "ETUDIANT" = "AGENT_ADMINISTRATION") {
  return prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(PASSWORD, 4), role },
  });
}

async function login(email = "agent@test.local"): Promise<string> {
  const result = await authenticateUser(email, PASSWORD);
  if (!result.ok || result.kind !== "session") throw new Error("session attendue");
  return result.token;
}

function payloadOf(token: string): SessionPayload {
  const payload = verifySessionToken(token);
  if (!payload) throw new Error("jeton invalide");
  return payload;
}

describe("session unique par compte", () => {
  it("le jeton porte l'identifiant de session enregistré en base", async () => {
    const user = await createUser();
    const token = await login();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.currentSessionId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(payloadOf(token).sid).toBe(row.currentSessionId);
  });

  it("une nouvelle connexion ferme la session de l'autre appareil", async () => {
    await createUser();
    const deviceA = await login();
    expect(await resolveSession(payloadOf(deviceA))).not.toBeNull();

    const deviceB = await login();
    expect(await evaluateSession(payloadOf(deviceA))).toEqual({ ok: false, reason: "replaced" });
    expect(await resolveSession(payloadOf(deviceB))).not.toBeNull();
  });

  it("à trois appareils, seul le dernier connecté reste valable", async () => {
    await createUser();
    const tokens = [await login(), await login(), await login()];
    const results = await Promise.all(tokens.map((t) => resolveSession(payloadOf(t))));
    expect(results.map((r) => r !== null)).toEqual([false, false, true]);
  });

  it("deux connexions simultanées : exactement une session survit", async () => {
    await createUser();
    const [a, b] = await Promise.all([login(), login()]);
    const alive = await Promise.all([a, b].map(async (t) => (await resolveSession(payloadOf(t))) !== null));
    expect(alive.filter(Boolean)).toHaveLength(1);
  });

  it("les comptes sont indépendants : se connecter ne ferme pas la session d'un autre compte", async () => {
    await createUser("a@test.local");
    await createUser("b@test.local");
    const a = await login("a@test.local");
    await login("b@test.local");
    expect(await resolveSession(payloadOf(a))).not.toBeNull();
  });

  it("s'applique aussi aux étudiants", async () => {
    await createUser("etu@etudiant.iugm", "ETUDIANT");
    const first = await login("etu@etudiant.iugm");
    await login("etu@etudiant.iugm");
    expect(await resolveSession(payloadOf(first))).toBeNull();
  });

  it("un jeton sans identifiant (émis avant la fonctionnalité) reste valable jusqu'à la prochaine connexion", async () => {
    const user = await createUser();
    const legacy = payloadOf(createSessionToken({ sub: user.id, email: user.email, role: user.role }));
    expect(legacy.sid).toBeUndefined();
    expect(await resolveSession(legacy)).not.toBeNull(); // currentSessionId encore nul

    await login();
    expect(await evaluateSession(legacy)).toEqual({ ok: false, reason: "replaced" });
  });

  it("un jeton portant un autre identifiant est refusé", async () => {
    const user = await createUser();
    await login();
    const forged = payloadOf(createSessionToken({ sub: user.id, email: user.email, role: user.role, sid: "identifiant-invente" }));
    expect(await evaluateSession(forged)).toEqual({ ok: false, reason: "replaced" });
  });
});

describe("motifs de fermeture (getSessionStatus)", () => {
  async function statusFor(token: string | undefined) {
    cookieValue = token;
    return getSessionStatus();
  }

  it("session valide", async () => {
    await createUser();
    expect(await statusFor(await login())).toMatchObject({ ok: true });
  });

  it("remplacée par une autre connexion", async () => {
    await createUser();
    const old = await login();
    await login();
    expect(await statusFor(old)).toEqual({ ok: false, reason: "replaced" });
  });

  it("compte désactivé ou supprimé", async () => {
    const user = await createUser();
    const token = await login();
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect(await statusFor(token)).toEqual({ ok: false, reason: "disabled" });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await statusFor(token)).toEqual({ ok: false, reason: "disabled" });
  });

  it("mot de passe modifié depuis", async () => {
    const user = await createUser();
    const token = await login();
    await prisma.user.update({ where: { id: user.id }, data: { sessionsValidAfter: new Date(Date.now() + 5000) } });
    expect(await statusFor(token)).toEqual({ ok: false, reason: "revoked" });
  });

  it("pas de cookie, ou cookie falsifié : expirée", async () => {
    expect(await statusFor(undefined)).toEqual({ ok: false, reason: "expired" });
    expect(await statusFor("n'importe.quoi")).toEqual({ ok: false, reason: "expired" });
  });

  it("un compte au changement de mot de passe obligatoire reste valide ici (il doit pouvoir le faire)", async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    expect(await statusFor(await login())).toMatchObject({ ok: true });
  });
});

describe("réémission au changement de mot de passe", () => {
  it("le jeton réémis avec le même identifiant reste valable alors que sessionsValidAfter vient d'être posé", async () => {
    const user = await createUser();
    const token = await login();
    const current = payloadOf(token);

    await prisma.user.update({ where: { id: user.id }, data: { sessionsValidAfter: new Date() } });
    const reissued = payloadOf(createSessionToken({ sub: user.id, email: user.email, role: user.role, sid: current.sid }));
    expect(await resolveSession(reissued)).not.toBeNull();
    // et l'ancien jeton, d'une seconde antérieure, est bien révoqué
    const older = { ...current, iat: current.iat - 5 };
    expect(await evaluateSession(older)).toEqual({ ok: false, reason: "revoked" });
  });
});

describe("double authentification + session unique", () => {
  it("après le second facteur, la session est LA session du compte et l'ancienne tombe", async () => {
    const user = await createUser("root@test.local", "SUPERADMIN");
    const { secret } = await beginTwoFactorSetup(user.id);
    const confirmed = await confirmTwoFactorSetup(user.id, totpAt(secret, Date.now()));
    if (!confirmed.ok) throw new Error(confirmed.error);

    const challenge = await authenticateUser("root@test.local", PASSWORD);
    if (!challenge.ok || challenge.kind !== "two-factor") throw new Error("défi attendu");
    // Le mot de passe seul n'a PAS ouvert de session : aucun identifiant enregistré
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).currentSessionId).toBeNull();

    const done = await completeTwoFactorLogin(challenge.challengeToken, confirmed.recoveryCodes[0]);
    if (!done.ok || done.kind !== "session") throw new Error("session attendue");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(payloadOf(done.token).sid).toBe(row.currentSessionId);
    expect(row.currentSessionId).not.toBeNull();
  });
});
