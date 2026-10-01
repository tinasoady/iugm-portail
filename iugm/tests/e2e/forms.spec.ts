import { expect, test } from "@playwright/test";

import { ACCOUNTS, alertOf, signIn } from "./fixtures";

test.describe("formulaires", () => {
  test("une erreur du serveur ne fait pas retaper les champs déjà saisis", async ({ page }) => {
    await signIn(page, ACCOUNTS.superadmin);

    // Adresse déjà utilisée : le serveur refuse
    await page.locator("#fullName").fill("Nouvel Agent");
    await page.locator("#new-email").fill(ACCOUNTS.agentAdmin.email);
    await page.locator("#role").selectOption("AGENT_PEDAGOGIQUE");
    await page.locator("#new-password").fill("Premier-motdepasse-1");
    await page.getByRole("button", { name: /Créer/ }).click();
    await expect(alertOf(page)).toHaveText(/existe déjà/);

    // Nom, email et rôle sont toujours là ; le mot de passe, volontairement non
    await expect(page.locator("#fullName")).toHaveValue("Nouvel Agent");
    await expect(page.locator("#new-email")).toHaveValue(ACCOUNTS.agentAdmin.email);
    await expect(page.locator("#role")).toHaveValue("AGENT_PEDAGOGIQUE");
    await expect(page.locator("#new-password")).toHaveValue("");

    // Une fois corrigé, la création réussit et le formulaire se vide
    await page.locator("#new-email").fill("nouvel-agent@e2e.test");
    await page.locator("#new-password").fill("Second-motdepasse-2");
    await page.getByRole("button", { name: /Créer/ }).click();
    await expect(page.getByText(/créé avec succès/)).toBeVisible();
    await expect(page.locator("#fullName")).toHaveValue("");
  });

  test("un mot de passe trop faible est refusé à la création d'un compte", async ({ page }) => {
    await signIn(page, ACCOUNTS.superadmin);
    await page.locator("#fullName").fill("Agent Faible");
    await page.locator("#new-email").fill("faible@e2e.test");
    await page.locator("#role").selectOption("AGENT_PEDAGOGIQUE");
    await page.locator("#new-password").fill("abcdefghij"); // aucun chiffre
    await page.getByRole("button", { name: /Créer/ }).click();
    await expect(alertOf(page)).toHaveText(/lettre et un chiffre/);
  });
});
