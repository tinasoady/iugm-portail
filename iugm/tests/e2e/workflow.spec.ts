import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures";

// Parcours métier complet d'un dossier, de l'enregistrement à la première
// connexion de l'étudiant : c'est le scénario qui, s'il casse, bloque la
// rentrée. Les étapes s'enchaînent sur le même dossier (workers = 1).
test.describe.serial("parcours d'inscription d'un étudiant", () => {
  let studentEmail = "";
  let studentPassword = "";

  test("l'agent d'administration vérifie le paiement puis valide l'inscription", async ({ page }) => {
    await login(page, ACCOUNTS.agentAdmin.email, ACCOUNTS.agentAdmin.password);
    await expect(page).toHaveURL(/\/agent-admin$/);

    const row = page.getByRole("row", { name: /RAKOTO Parcours/ });
    await expect(row).toBeVisible();

    // Un montant inférieur au minimum requis est refusé par le serveur
    await row.getByLabel("Numéro du reçu").fill("REC-E2E-1");
    await row.getByLabel("Montant versé (Ar)").fill("1000");
    await row.getByRole("button", { name: "Vérifier le paiement" }).click();
    await expect(row.locator("[role=alert]")).toHaveText(/Montant insuffisant/);

    // Le bon montant (minimum L1 local : 290 000 Ar) débloque le dossier
    await row.getByLabel("Montant versé (Ar)").fill("300000");
    await row.getByRole("button", { name: "Vérifier le paiement" }).click();
    const validate = row.getByRole("button", { name: "Valider l'inscription" });
    await expect(validate).toBeVisible();

    await validate.click();
    await expect(row.getByText("En attente de validation pédagogique")).toBeVisible();
  });

  test("l'agent pédagogique valide et obtient les identifiants de l'étudiant", async ({ page }) => {
    await login(page, ACCOUNTS.agentPedago.email, ACCOUNTS.agentPedago.password);
    await expect(page).toHaveURL(/\/agent-pedagogique$/);

    const row = page.getByRole("row", { name: /RAKOTO Parcours/ }).first();
    await row.getByRole("button", { name: "Valider l'inscription pédagogique" }).click();
    await expect(row.getByText("Compte étudiant créé")).toBeVisible();

    const text = (await row.innerText()).replace(/\s+/g, " ");
    studentEmail = /Email : (\S+)/.exec(text)?.[1] ?? "";
    studentPassword = /Mot de passe : (\S+)/.exec(text)?.[1] ?? "";
    expect(studentEmail).toMatch(/@/);
    expect(studentPassword).toMatch(/^FI2026-\d+-/); // matricule + suffixe aléatoire
  });

  test("l'étudiant se connecte, est forcé de changer son mot de passe, puis accède à son profil", async ({
    page,
  }) => {
    expect(studentEmail).not.toBe("");
    await login(page, studentEmail, studentPassword);
    await expect(page).toHaveURL(/\/changer-mot-de-passe$/);

    const chosen = "Etudiant-nouveau-2026";
    await page.locator("#currentPassword").fill(studentPassword);
    await page.locator("#newPassword").fill(chosen);
    await page.locator("#confirm").fill(chosen);
    await page.getByRole("button", { name: "Changer mon mot de passe" }).click();
    await expect(page).toHaveURL(/\/mon-profil$/);
    await expect(page.getByText("RAKOTO Parcours").first()).toBeVisible();

    // Un étudiant n'a accès à aucun espace de gestion
    await page.goto("/agent-admin");
    await expect(page).not.toHaveURL(/\/agent-admin$/);
    await page.goto("/etudiants");
    await expect(page).not.toHaveURL(/\/etudiants$/);
  });
});
