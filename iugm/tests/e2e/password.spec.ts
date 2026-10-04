import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { alertOf, ACCOUNTS, PASSWORD, login } from "./fixtures";

const NEW_PASSWORD = "Nouveau-motdepasse-2027";

test.describe("changement de mot de passe obligatoire", () => {
  test("un mot de passe temporaire cantonne l'utilisateur à la page de changement", async ({ page }) => {
    await login(page, ACCOUNTS.mustChange.username, ACCOUNTS.mustChange.password);
    await expect(page).toHaveURL(/\/changer-mot-de-passe$/);

    // Impossible de contourner en saisissant une autre adresse
    for (const path of ["/mon-profil", "/mes-communiques", "/profil", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/changer-mot-de-passe$/);
    }

    // Une valeur faible est refusée avec un message explicite
    await page.locator("#currentPassword").fill(PASSWORD);
    await page.locator("#newPassword").fill("courtcourt");
    await page.locator("#confirm").fill("courtcourt");
    await page.getByRole("button", { name: "Changer mon mot de passe" }).click();
    await expect(alertOf(page)).toHaveText(/lettre et un chiffre/);

    // Un bon mot de passe libère l'accès
    await page.locator("#currentPassword").fill(PASSWORD);
    await page.locator("#newPassword").fill(NEW_PASSWORD);
    await page.locator("#confirm").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Changer mon mot de passe" }).click();
    await expect(page).toHaveURL(/\/mon-profil$/);

    // ...et l'ancien mot de passe ne fonctionne plus
    await page.context().clearCookies();
    await login(page, ACCOUNTS.mustChange.username, PASSWORD);
    await expect(alertOf(page)).toHaveText(/incorrect/);
  });
});

test.describe("mot de passe oublié", () => {
  test("la demande répond pareil pour un compte inconnu", async ({ page }) => {
    await page.goto("/mot-de-passe-oublie");
    await page.locator("#username").fill("inconnu");
    await page.getByRole("button", { name: "Envoyer le lien" }).click();
    await expect(page.getByText(/Si un compte correspond/)).toBeVisible();
  });

  test("un lien valide permet de choisir un nouveau mot de passe, une seule fois", async ({ page }) => {
    // Le lien réel est écrit dans la console du serveur (MAIL_DRIVER=log) ; on
    // fabrique ici le même jeton en base pour pouvoir le suivre.
    const { prisma } = await import("../../lib/prisma");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ACCOUNTS.resetUser.username } });
    const token = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    await prisma.$disconnect();

    await page.goto(`/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`);
    // Le jeton disparaît de la barre d'adresse dès que la page est affichée
    await expect(page).toHaveURL(/\/reinitialiser-mot-de-passe$/);
    expect(page.url()).not.toContain(token);
    await page.locator("#newPassword").fill(NEW_PASSWORD);
    await page.locator("#confirm").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
    await expect(page).toHaveURL(/\/login\?reinitialise=1$/);
    await expect(page.getByRole("status")).toHaveText(/Mot de passe modifié/);

    await login(page, ACCOUNTS.resetUser.username, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/agent-admin$/);

    // Le même lien ne fonctionne plus
    await page.context().clearCookies();
    await page.goto(`/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`);
    await expect(page.getByText(/invalide ou a expiré/)).toBeVisible();
  });

  test("un jeton inventé est refusé", async ({ page }) => {
    await page.goto("/reinitialiser-mot-de-passe?token=nimporte-quoi");
    await expect(page.getByText(/invalide ou a expiré/)).toBeVisible();
  });
});
