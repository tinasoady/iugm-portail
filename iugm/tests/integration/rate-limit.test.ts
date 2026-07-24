import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/rate-limit";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(resetDb);
afterAll(disconnectDb);

const EMAIL = "victime@test.local";
const IP = "203.0.113.9";

describe("anti-bruteforce de connexion", () => {
  it("n'est pas limité au départ", async () => {
    const status = await checkLoginRateLimit(EMAIL, IP);
    expect(status.limited).toBe(false);
  });

  it("bloque après 5 échecs récents pour le même email", async () => {
    for (let i = 0; i < 4; i++) {
      await recordLoginAttempt(EMAIL, IP, false);
    }
    expect((await checkLoginRateLimit(EMAIL, IP)).limited).toBe(false);

    await recordLoginAttempt(EMAIL, IP, false); // 5e échec
    const status = await checkLoginRateLimit(EMAIL, IP);
    expect(status.limited).toBe(true);
    expect(status.retryAfterMinutes).toBeGreaterThan(0);
  });

  it("une connexion réussie purge les échecs précédents", async () => {
    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt(EMAIL, IP, false);
    }
    expect((await checkLoginRateLimit(EMAIL, IP)).limited).toBe(true);

    await recordLoginAttempt(EMAIL, IP, true);
    expect((await checkLoginRateLimit(EMAIL, IP)).limited).toBe(false);
  });

  it("le blocage par email ne déborde pas sur un autre email, même depuis la même IP", async () => {
    for (let i = 0; i < 5; i++) {
      await recordLoginAttempt(EMAIL, IP, false);
    }
    const otherEmailStatus = await checkLoginRateLimit("innocent@test.local", IP);
    // Sous le seuil IP (20) : pas encore limité pour cet autre compte
    expect(otherEmailStatus.limited).toBe(false);
  });

  it("bloque par IP au-delà de 20 échecs, même répartis sur des emails différents", async () => {
    for (let i = 0; i < 20; i++) {
      await recordLoginAttempt(`victime${i}@test.local`, IP, false);
    }
    const status = await checkLoginRateLimit("nouveau-compte@test.local", IP);
    expect(status.limited).toBe(true);
  });
});
