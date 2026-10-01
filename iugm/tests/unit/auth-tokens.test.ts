import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_MAX_AGE,
  TWO_FACTOR_MAX_AGE,
  createSessionToken,
  createTwoFactorChallengeToken,
  verifySessionToken,
  verifyTwoFactorChallengeToken,
} from "@/lib/auth";

const USER = { sub: "user-1", email: "agent@test.local", role: "AGENT_ADMINISTRATION" };

describe("jeton de session", () => {
  it("fait l'aller-retour", () => {
    const payload = verifySessionToken(createSessionToken(USER));
    expect(payload).toMatchObject(USER);
    expect(payload?.mcp).toBeUndefined();
  });

  it("conserve le drapeau de changement de mot de passe obligatoire", () => {
    expect(verifySessionToken(createSessionToken({ ...USER, mcp: true }))?.mcp).toBe(true);
  });

  it("refuse un jeton falsifié (charge utile ou signature)", () => {
    const token = createSessionToken(USER);
    const [payloadB64, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...USER, role: "SUPERADMIN", iat: Math.floor(Date.now() / 1000) }),
    ).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`)).toBeNull();
    expect(verifySessionToken(`${payloadB64}.${"0".repeat(sig.length)}`)).toBeNull();
    expect(verifySessionToken(`${payloadB64}.${sig}.extra`)).toBeNull();
    expect(verifySessionToken(payloadB64)).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("n'importe.quoi")).toBeNull();
  });

  describe("expiration", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("valable jusqu'à 8 h, refusé ensuite", () => {
      const token = createSessionToken(USER);
      vi.advanceTimersByTime((SESSION_MAX_AGE - 5) * 1000);
      expect(verifySessionToken(token)).not.toBeNull();
      vi.advanceTimersByTime(10 * 1000);
      expect(verifySessionToken(token)).toBeNull();
    });
  });
});

describe("jeton de défi 2FA", () => {
  it("fait l'aller-retour", () => {
    const token = createTwoFactorChallengeToken({ userId: "user-1", destination: "/admin" });
    expect(verifyTwoFactorChallengeToken(token)).toEqual({ userId: "user-1", destination: "/admin" });
  });

  it("ne peut pas servir de jeton de session (cloisonnement des usages)", () => {
    const challenge = createTwoFactorChallengeToken({ userId: "user-1", destination: "/admin" });
    expect(verifySessionToken(challenge)).toBeNull();
  });

  it("un jeton de session ne peut pas servir de défi 2FA", () => {
    expect(verifyTwoFactorChallengeToken(createSessionToken(USER))).toBeNull();
  });

  it("refuse un jeton falsifié", () => {
    const token = createTwoFactorChallengeToken({ userId: "user-1", destination: "/admin" });
    const [, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ typ: "2fa", sub: "autre", dest: "/admin", exp: 9999999999 }),
    ).toString("base64url");
    expect(verifyTwoFactorChallengeToken(`${forged}.${sig}`)).toBeNull();
  });

  describe("expiration", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("valable 5 minutes seulement", () => {
      const token = createTwoFactorChallengeToken({ userId: "user-1", destination: "/admin" });
      vi.advanceTimersByTime((TWO_FACTOR_MAX_AGE - 5) * 1000);
      expect(verifyTwoFactorChallengeToken(token)).not.toBeNull();
      vi.advanceTimersByTime(10 * 1000);
      expect(verifyTwoFactorChallengeToken(token)).toBeNull();
    });
  });
});
