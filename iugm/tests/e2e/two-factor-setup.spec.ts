import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

import { ACCOUNTS, alertOf, signIn } from "./fixtures";

// Calcul TOTP indépendant de lib/totp.ts (RFC 6238 réécrit ici, de zéro) : si le
// portail et ce code sont d'accord, c'est que le portail est compatible avec
// n'importe quelle application d'authentification, pas seulement avec lui-même.
function base32ToBuffer(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/[\s=]/g, "").toUpperCase()) {
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function independentTotp(secretBase32: string, atMs: number): string {
  const counter = Math.floor(atMs / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const h = createHmac("sha1", base32ToBuffer(secretBase32)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const code = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

test.describe("configuration de la double authentification", () => {
  test("QR/clé affichés → code d'une appli indépendante → activation → connexion avec 2FA", async ({ page, context }) => {
    // Compte dédié : ne perturbe pas les autres scénarios
    const account = ACCOUNTS.setupTwoFactor;
    await signIn(page, account);

    await page.goto("/profil");
    await page.getByRole("button", { name: "Activer la double authentification" }).click();
    await expect(page.getByAltText(/QR code/)).toBeVisible();

    // La clé de configuration manuelle affichée sous le QR code
    const secret = (await page.locator("p.select-all").innerText()).trim();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    // Un mauvais code est refusé
    await page.locator("#tf-code").fill("000000");
    await page.getByRole("button", { name: "Confirmer et activer" }).click();
    await expect(alertOf(page)).toHaveText(/Code incorrect ou expiré/);

    // Le code calculé par une implémentation indépendante est accepté
    await page.locator("#tf-code").fill(independentTotp(secret, Date.now()));
    await page.getByRole("button", { name: "Confirmer et activer" }).click();
    await expect(page.getByText("Codes de secours — à conserver dès maintenant")).toBeVisible();
    await expect(page.locator("li.font-mono, ul.font-mono > li")).toHaveCount(8);

    // Connexion suivante : mot de passe puis code (pas de temporisation : on prend le pas suivant, toléré)
    await context.clearCookies();
    await page.goto("/login");
    await page.locator("#email").fill(account.email);
    await page.locator("#password").fill(account.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/login\/verification$/);
    await page.locator("#code").fill(independentTotp(secret, Date.now() + 30_000));
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
