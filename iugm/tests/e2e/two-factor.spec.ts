import { expect, test } from "@playwright/test";

import { totpAt } from "../../lib/totp";
import { alertOf, ACCOUNTS, TFA_RECOVERY_CODE, TFA_SECRET, login } from "./fixtures";

test.describe("double authentification", () => {
  test("le mot de passe seul n'ouvre pas la session", async ({ page }) => {
    await login(page, ACCOUNTS.twoFactor.username, ACCOUNTS.twoFactor.password);
    await expect(page).toHaveURL(/\/login\/verification$/);

    // Tant que le code n'est pas validé, l'espace reste fermé
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("un mauvais code est refusé", async ({ page }) => {
    await login(page, ACCOUNTS.twoFactor.username, ACCOUNTS.twoFactor.password);
    await page.locator("#code").fill("000000");
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(alertOf(page)).toHaveText(/Code incorrect/);
    await expect(page).toHaveURL(/\/login\/verification$/);
  });

  test("un code TOTP valide ouvre la session", async ({ page }) => {
    await login(page, ACCOUNTS.twoFactor.username, ACCOUNTS.twoFactor.password);
    await page.locator("#code").fill(totpAt(TFA_SECRET, Date.now()));
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("un code de secours fonctionne une seule fois", async ({ page, context }) => {
    await login(page, ACCOUNTS.twoFactor.username, ACCOUNTS.twoFactor.password);
    await page.locator("#code").fill(TFA_RECOVERY_CODE);
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await context.clearCookies();
    await login(page, ACCOUNTS.twoFactor.username, ACCOUNTS.twoFactor.password);
    await page.locator("#code").fill(TFA_RECOVERY_CODE);
    await page.getByRole("button", { name: "Valider" }).click();
    await expect(alertOf(page)).toHaveText(/Code incorrect/);
  });
});
