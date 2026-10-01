import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// authenticateUser lit l'IP du client via next/headers, qui n'existe que dans
// une vraie requête : on le remplace par un en-tête fixe.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.7" }),
  cookies: async () => ({ get: () => undefined }),
}));

import { verifySessionToken, verifyTwoFactorChallengeToken } from "@/lib/auth";
import { authenticateUser, completeTwoFactorLogin } from "@/lib/login";
import { prisma } from "@/lib/prisma";
import { totpAt } from "@/lib/totp";
import { beginTwoFactorSetup, confirmTwoFactorSetup } from "@/lib/two-factor";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(resetDb);
afterAll(disconnectDb);

const PASSWORD = "Motdepasse-2026";

async function createLoginUser(
  overrides: Partial<{
    email: string;
    role: "SUPERADMIN" | "AGENT_ADMINISTRATION" | "AGENT_PEDAGOGIQUE" | "ETUDIANT";
    active: boolean;
    mustChangePassword: boolean;
  }> = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? "agent@test.local",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: overrides.role ?? "AGENT_ADMINISTRATION",
      active: overrides.active ?? true,
      mustChangePassword: overrides.mustChangePassword ?? false,
    },
  });
}

describe("authenticateUser", () => {
  it("ouvre une session pour de bons identifiants et route selon le rôle", async () => {
    const user = await createLoginUser({ role: "SUPERADMIN", email: "root@test.local" });
    const result = await authenticateUser("root@test.local", PASSWORD);
    expect(result).toMatchObject({ ok: true, kind: "session", destination: "/admin" });
    if (!result.ok || result.kind !== "session") throw new Error("session attendue");
    const payload = verifySessionToken(result.token);
    expect(payload).toMatchObject({ sub: user.id, role: "SUPERADMIN" });
    expect(payload?.mcp).toBeUndefined();
  });

  it("refuse un mauvais mot de passe avec un message générique", async () => {
    await createLoginUser();
    const result = await authenticateUser("agent@test.local", "mauvais-mot-de-passe-1");
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Email ou mot de passe incorrect.",
    });
  });

  it("répond de la même façon pour un email inconnu (pas d'énumération de comptes)", async () => {
    await createLoginUser();
    const unknown = await authenticateUser("inconnu@test.local", PASSWORD);
    const wrong = await authenticateUser("agent@test.local", "mauvais-mot-de-passe-1");
    expect(unknown).toEqual(wrong);
  });

  it("ne révèle le statut désactivé qu'avec le bon mot de passe", async () => {
    await createLoginUser({ active: false });
    const withWrongPassword = await authenticateUser("agent@test.local", "mauvais-mot-de-passe-1");
    expect(withWrongPassword).toMatchObject({ ok: false, status: 401 });

    const withRightPassword = await authenticateUser("agent@test.local", PASSWORD);
    expect(withRightPassword).toMatchObject({ ok: false, status: 403 });
  });

  it("marque la session pour le changement de mot de passe obligatoire", async () => {
    await createLoginUser({ mustChangePassword: true });
    const result = await authenticateUser("agent@test.local", PASSWORD);
    expect(result).toMatchObject({ ok: true, kind: "session", destination: "/changer-mot-de-passe" });
    if (!result.ok || result.kind !== "session") throw new Error("session attendue");
    expect(verifySessionToken(result.token)?.mcp).toBe(true);
  });

  it("exige email et mot de passe", async () => {
    expect(await authenticateUser("", PASSWORD)).toMatchObject({ ok: false, status: 400 });
    expect(await authenticateUser("agent@test.local", "")).toMatchObject({ ok: false, status: 400 });
  });

  it("bloque après 5 échecs, même avec le bon mot de passe ensuite", async () => {
    await createLoginUser();
    for (let i = 0; i < 5; i++) {
      await authenticateUser("agent@test.local", "mauvais-mot-de-passe-1");
    }
    const result = await authenticateUser("agent@test.local", PASSWORD);
    expect(result).toMatchObject({ ok: false, status: 429 });
  });
});

describe("connexion avec double authentification", () => {
  async function createTwoFactorUser() {
    const user = await createLoginUser({ role: "SUPERADMIN", email: "root@test.local" });
    const { secret } = await beginTwoFactorSetup(user.id);
    const confirmed = await confirmTwoFactorSetup(user.id, totpAt(secret, Date.now()));
    if (!confirmed.ok) throw new Error(confirmed.error);
    return { user, secret, recoveryCodes: confirmed.recoveryCodes };
  }

  it("n'ouvre PAS de session après le seul mot de passe : renvoie un défi", async () => {
    const { user } = await createTwoFactorUser();
    const result = await authenticateUser("root@test.local", PASSWORD);
    expect(result).toMatchObject({ ok: true, kind: "two-factor" });
    if (!result.ok || result.kind !== "two-factor") throw new Error("défi attendu");

    expect(verifyTwoFactorChallengeToken(result.challengeToken)).toEqual({
      userId: user.id,
      destination: "/admin",
    });
    // Le défi ne vaut pas session
    expect(verifySessionToken(result.challengeToken)).toBeNull();
  });

  it("ouvre la session avec un code TOTP valide", async () => {
    const { user, secret } = await createTwoFactorUser();
    const challenge = await authenticateUser("root@test.local", PASSWORD);
    if (!challenge.ok || challenge.kind !== "two-factor") throw new Error("défi attendu");

    const result = await completeTwoFactorLogin(
      challenge.challengeToken,
      totpAt(secret, Date.now() + 30_000),
    );
    expect(result).toMatchObject({ ok: true, kind: "session", destination: "/admin" });
    if (!result.ok || result.kind !== "session") throw new Error("session attendue");
    expect(verifySessionToken(result.token)).toMatchObject({ sub: user.id, role: "SUPERADMIN" });
  });

  it("ouvre la session avec un code de secours, une seule fois", async () => {
    const { recoveryCodes } = await createTwoFactorUser();
    const challenge = await authenticateUser("root@test.local", PASSWORD);
    if (!challenge.ok || challenge.kind !== "two-factor") throw new Error("défi attendu");

    const first = await completeTwoFactorLogin(challenge.challengeToken, recoveryCodes[0]);
    expect(first).toMatchObject({ ok: true, kind: "session" });
    const second = await completeTwoFactorLogin(challenge.challengeToken, recoveryCodes[0]);
    expect(second).toMatchObject({ ok: false, status: 401 });
  });

  it("refuse un mauvais code, et bloque le compte après 5 essais", async () => {
    await createTwoFactorUser();
    const challenge = await authenticateUser("root@test.local", PASSWORD);
    if (!challenge.ok || challenge.kind !== "two-factor") throw new Error("défi attendu");

    // Le mot de passe correct n'a pas purgé le compteur : 4 essais sur le code
    for (let i = 0; i < 4; i++) {
      const r = await completeTwoFactorLogin(challenge.challengeToken, "000000");
      expect(r).toMatchObject({ ok: false, status: 401 });
    }
    const blocked = await completeTwoFactorLogin(challenge.challengeToken, "000000");
    expect(blocked).toMatchObject({ ok: false });
    const afterBlock = await completeTwoFactorLogin(challenge.challengeToken, "000000");
    expect(afterBlock).toMatchObject({ ok: false, status: 429 });
  });

  it("refuse un défi absent, falsifié ou expiré", async () => {
    await createTwoFactorUser();
    expect(await completeTwoFactorLogin(undefined, "123456")).toMatchObject({ ok: false, status: 401 });
    expect(await completeTwoFactorLogin("n'importe.quoi", "123456")).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("refuse le défi d'un compte désactivé entre-temps", async () => {
    const { user, secret } = await createTwoFactorUser();
    const challenge = await authenticateUser("root@test.local", PASSWORD);
    if (!challenge.ok || challenge.kind !== "two-factor") throw new Error("défi attendu");

    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    const result = await completeTwoFactorLogin(
      challenge.challengeToken,
      totpAt(secret, Date.now() + 30_000),
    );
    expect(result).toMatchObject({ ok: false, status: 401 });
  });
});
