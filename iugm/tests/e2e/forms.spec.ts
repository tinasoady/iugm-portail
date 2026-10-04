import { expect, test } from "@playwright/test";

import { ACCOUNTS, alertOf, signIn } from "./fixtures";

test.describe("formulaires", () => {
  test("une erreur du serveur ne fait pas retaper les champs déjà saisis", async ({ page }) => {
    await signIn(page, ACCOUNTS.superadmin);

    // Nom d'utilisateur déjà pris : le serveur refuse
    await page.locator("#invite-fullname").fill("Nouvel Agent");
    await page.locator("#invite-username").fill(ACCOUNTS.agentAdmin.username);
    await page.locator("#invite-email").fill("nouvel-agent@e2e.test");
    await page.locator("#invite-role").selectOption("AGENT_PEDAGOGIQUE");
    await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(alertOf(page)).toHaveText(/déjà pris/);

    // Tous les champs sont toujours là
    await expect(page.locator("#invite-fullname")).toHaveValue("Nouvel Agent");
    await expect(page.locator("#invite-username")).toHaveValue(ACCOUNTS.agentAdmin.username);
    await expect(page.locator("#invite-email")).toHaveValue("nouvel-agent@e2e.test");
    await expect(page.locator("#invite-role")).toHaveValue("AGENT_PEDAGOGIQUE");

    // Une fois corrigé, l'invitation part et le formulaire se vide
    await page.locator("#invite-username").fill("nouvel.agent");
    await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(page.getByText(/Invitation envoyée à n\*+t@e2e\.test|Invitation envoyée à/)).toBeVisible();
    await expect(page.locator("#invite-fullname")).toHaveValue("");
  });

  test("un nom d'utilisateur invalide est refusé à l'invitation", async ({ page }) => {
    await signIn(page, ACCOUNTS.superadmin);
    await page.locator("#invite-fullname").fill("Agent Invalide");
    await page.locator("#invite-username").fill("Agent Invalide"); // majuscules et espace
    await page.locator("#invite-email").fill("invalide@e2e.test");
    await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(alertOf(page)).toHaveText(/minuscules/);
  });

  test("Paramètres : l'état de l'envoi d'e-mails s'affiche et le test d'envoi répond", async ({ page }) => {
    await signIn(page, ACCOUNTS.superadmin);
    await page.goto("/admin/parametres");
    await expect(page.getByRole("heading", { name: "Envoi d'e-mails" })).toBeVisible();
    // Les tests tournent en mode journal (MAIL_DRIVER=log) : rien n'est réellement envoyé
    await expect(page.getByText("Mode journal (aucun envoi réel)")).toBeVisible();

    await page.locator("#test-email-to").fill("destinataire@e2e.test");
    await page.getByRole("button", { name: "Envoyer le test" }).click();
    await expect(page.getByText(/écrit dans les journaux du serveur/)).toBeVisible();

    // Une adresse invalide est refusée avant tout envoi
    await page.locator("#test-email-to").fill("pas-une-adresse");
    await expect(page.locator("#test-email-to")).toHaveAttribute("type", "email");
  });
});
