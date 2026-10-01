import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secret-crypto";
import { totpAt, totpStep } from "@/lib/totp";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  countRecoveryCodes,
  disableTwoFactor,
  regenerateRecoveryCodes,
  verifyTwoFactorLogin,
} from "@/lib/two-factor";
import { createActor } from "../setup/factories";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(resetDb);
afterAll(disconnectDb);

// Active le 2FA pour un acteur et renvoie son secret en clair + ses codes de secours
async function enableTwoFactor(role: "SUPERADMIN" | "AGENT_ADMINISTRATION" = "SUPERADMIN") {
  const user = await createActor(role);
  const { secret } = await beginTwoFactorSetup(user.id);
  const result = await confirmTwoFactorSetup(user.id, totpAt(secret, Date.now()));
  if (!result.ok) throw new Error(result.error);
  return { user, secret, recoveryCodes: result.recoveryCodes };
}

describe("configuration du 2FA", () => {
  it("stocke le secret chiffré, sans activer le 2FA avant la confirmation", async () => {
    const user = await createActor("SUPERADMIN");
    const { secret, otpAuthUri } = await beginTwoFactorSetup(user.id);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.totpEnabled).toBe(false);
    expect(row.totpSecret).not.toBeNull();
    expect(row.totpSecret).not.toContain(secret); // jamais en clair
    expect(decryptSecret(row.totpSecret)).toBe(secret);
    expect(otpAuthUri).toContain(`secret=${secret}`);
    expect(otpAuthUri).toContain(encodeURIComponent(user.email));
  });

  it("refuse la confirmation avec un mauvais code", async () => {
    const user = await createActor("SUPERADMIN");
    await beginTwoFactorSetup(user.id);
    const result = await confirmTwoFactorSetup(user.id, "000000");
    expect(result.ok).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).totpEnabled).toBe(false);
  });

  it("refuse la confirmation sans configuration préalable", async () => {
    const user = await createActor("SUPERADMIN");
    const result = await confirmTwoFactorSetup(user.id, "123456");
    expect(result).toMatchObject({ ok: false });
  });

  it("active le 2FA et remet 8 codes de secours distincts, stockés hachés", async () => {
    const { user, recoveryCodes } = await enableTwoFactor();
    expect(recoveryCodes).toHaveLength(8);
    expect(new Set(recoveryCodes).size).toBe(8);
    for (const code of recoveryCodes) expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.totpEnabled).toBe(true);
    expect(row.recoveryCodes).toHaveLength(8);
    for (const stored of row.recoveryCodes) {
      expect(stored).toMatch(/^[0-9a-f]{64}$/);
      for (const code of recoveryCodes) expect(stored).not.toContain(code.replace("-", ""));
    }
  });

  it("n'est pas proposé aux étudiants", async () => {
    const student = await prisma.user.create({
      data: { email: "etu@test.local", passwordHash: "x", role: "ETUDIANT" },
    });
    await expect(beginTwoFactorSetup(student.id)).rejects.toThrow(/pas disponible/);
  });

  it("refuse de reconfigurer un 2FA déjà actif", async () => {
    const { user } = await enableTwoFactor();
    await expect(beginTwoFactorSetup(user.id)).rejects.toThrow(/déjà activée/);
  });

  it("une confirmation répétée ne régénère pas les codes de secours", async () => {
    const user = await createActor("SUPERADMIN");
    const { secret } = await beginTwoFactorSetup(user.id);
    const code = totpAt(secret, Date.now());
    const [a, b] = await Promise.all([
      confirmTwoFactorSetup(user.id, code),
      confirmTwoFactorSetup(user.id, code),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });
});

describe("vérification à la connexion", () => {
  it("accepte un code TOTP valide, avec ou sans espace au milieu", async () => {
    const { user, secret } = await enableTwoFactor();
    // Le pas de la configuration est déjà consommé : on utilise le pas suivant,
    // que la fenêtre de tolérance (±1) accepte.
    const next = totpAt(secret, Date.now() + 30_000);
    const spaced = `${next.slice(0, 3)} ${next.slice(3)}`;
    expect(await verifyTwoFactorLogin(user.id, spaced)).toEqual({ ok: true, usedRecoveryCode: false });
  });

  it("refuse le rejeu d'un code TOTP déjà utilisé", async () => {
    const { user, secret } = await enableTwoFactor();
    const next = totpAt(secret, Date.now() + 30_000);
    expect((await verifyTwoFactorLogin(user.id, next)).ok).toBe(true);
    expect((await verifyTwoFactorLogin(user.id, next)).ok).toBe(false);
  });

  it("refuse un code utilisé pendant la configuration (même pas)", async () => {
    const { user, secret } = await enableTwoFactor();
    expect((await verifyTwoFactorLogin(user.id, totpAt(secret, Date.now()))).ok).toBe(false);
  });

  it("deux requêtes simultanées avec le même code : une seule passe", async () => {
    const { user, secret } = await enableTwoFactor();
    const next = totpAt(secret, Date.now() + 30_000);
    const results = await Promise.all([
      verifyTwoFactorLogin(user.id, next),
      verifyTwoFactorLogin(user.id, next),
      verifyTwoFactorLogin(user.id, next),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("refuse un mauvais code, un code vide ou mal formé", async () => {
    const { user } = await enableTwoFactor();
    for (const bad of ["000000", "", "abc", "12345", "ZZZZZ-ZZZZZ"]) {
      expect((await verifyTwoFactorLogin(user.id, bad)).ok).toBe(false);
    }
  });

  it("refuse un compte sans 2FA activé", async () => {
    const user = await createActor("SUPERADMIN");
    expect((await verifyTwoFactorLogin(user.id, "123456")).ok).toBe(false);
  });

  it("ne mélange pas les secrets de deux comptes", async () => {
    const a = await enableTwoFactor("SUPERADMIN");
    const b = await enableTwoFactor("AGENT_ADMINISTRATION");
    const codeForA = totpAt(a.secret, Date.now() + 30_000);
    expect((await verifyTwoFactorLogin(b.user.id, codeForA)).ok).toBe(false);
  });
});

describe("codes de secours", () => {
  it("accepte un code de secours (casse et tiret libres) une seule fois", async () => {
    const { user, recoveryCodes } = await enableTwoFactor();
    const code = recoveryCodes[0];

    const first = await verifyTwoFactorLogin(user.id, code.toLowerCase().replace("-", " "));
    expect(first).toEqual({ ok: true, usedRecoveryCode: true });
    expect((await verifyTwoFactorLogin(user.id, code)).ok).toBe(false);
    expect(await countRecoveryCodes(user.id)).toBe(7);
  });

  it("deux requêtes simultanées avec le même code de secours : une seule passe", async () => {
    const { user, recoveryCodes } = await enableTwoFactor();
    const results = await Promise.all([
      verifyTwoFactorLogin(user.id, recoveryCodes[1]),
      verifyTwoFactorLogin(user.id, recoveryCodes[1]),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await countRecoveryCodes(user.id)).toBe(7);
  });

  it("un code de secours d'un autre compte est refusé", async () => {
    const a = await enableTwoFactor("SUPERADMIN");
    const b = await enableTwoFactor("AGENT_ADMINISTRATION");
    expect((await verifyTwoFactorLogin(b.user.id, a.recoveryCodes[0])).ok).toBe(false);
  });

  it("la régénération invalide les anciens codes", async () => {
    const { user, recoveryCodes } = await enableTwoFactor();
    const fresh = await regenerateRecoveryCodes(user.id);
    expect(fresh).toHaveLength(8);
    expect((await verifyTwoFactorLogin(user.id, recoveryCodes[0])).ok).toBe(false);
    expect((await verifyTwoFactorLogin(user.id, fresh[0])).ok).toBe(true);
  });

  it("la régénération exige un 2FA actif", async () => {
    const user = await createActor("SUPERADMIN");
    await expect(regenerateRecoveryCodes(user.id)).rejects.toThrow(/pas activée/);
  });
});

describe("désactivation", () => {
  it("efface secret, pas de rejeu et codes de secours", async () => {
    const { user, secret } = await enableTwoFactor();
    await disableTwoFactor(user.id);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({
      totpEnabled: false,
      totpSecret: null,
      totpLastStep: null,
      recoveryCodes: [],
    });
    expect((await verifyTwoFactorLogin(user.id, totpAt(secret, Date.now() + 30_000))).ok).toBe(false);
  });

  it("permet de reconfigurer ensuite avec un nouveau secret", async () => {
    const { user, secret: oldSecret } = await enableTwoFactor();
    await disableTwoFactor(user.id);
    const { secret } = await beginTwoFactorSetup(user.id);
    expect(secret).not.toBe(oldSecret);
    // le pas courant n'a plus d'historique : la confirmation fonctionne
    const result = await confirmTwoFactorSetup(user.id, totpAt(secret, Date.now()));
    expect(result.ok).toBe(true);
    expect(totpStep(Date.now())).toBeGreaterThan(0);
  });
});
