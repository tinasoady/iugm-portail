import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { ACCOUNTS, PASSWORD, alertOf, login, signIn } from "./fixtures";

const CHOSEN_PASSWORD = "Choisi-par-moi-2026";

// Le vrai lien est écrit dans la console du serveur (MAIL_DRIVER=log) : on fabrique
// ici le même jeton en base pour pouvoir le suivre, comme pour les autres liens.
async function createPendingAccount(username: string, token: string, expiresInMs = 72 * 3600_000) {
  const { prisma } = await import("../../lib/prisma");
  const bcrypt = await import("bcryptjs");
  const user = await prisma.user.create({
    data: {
      email: username,
      fullName: "Invité E2E",
      passwordHash: await bcrypt.hash(randomBytes(16).toString("hex"), 4),
      role: "AGENT_PEDAGOGIQUE",
      pendingActivation: true,
    },
  });
  await prisma.activationToken.create({
    data: {
      userId: user.id,
      email: `${username}@boite.e2e.test`,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + expiresInMs),
    },
  });
  await prisma.$disconnect();
}

test.describe("invitation d'un agent", () => {
  test("le lien d'activation : jeton retiré de l'adresse, mot de passe choisi, puis connexion par nom d'utilisateur", async ({
    page,
  }) => {
    const token = randomBytes(32).toString("base64url");
    await createPendingAccount("invite.actif", token);

    // Tant que le compte n'est pas activé : message identique à un identifiant inconnu
    await login(page, "invite.actif", PASSWORD);
    await expect(alertOf(page)).toHaveText(/Identifiant ou mot de passe incorrect/);

    await page.context().clearCookies();
    await page.goto(`/activer-compte?token=${encodeURIComponent(token)}`);
    await expect(page).toHaveURL(/\/activer-compte$/); // le jeton disparaît de la barre d'adresse
    expect(page.url()).not.toContain(token);
    await expect(page.getByText("invite.actif")).toBeVisible();
    await expect(page.getByText(/i\*+f@boite\.e2e\.test/)).toBeVisible();

    // Confirmation différente : refusée
    await page.locator("#newPassword").fill(CHOSEN_PASSWORD);
    await page.locator("#confirm").fill("Autre-chose-2026");
    await page.getByRole("button", { name: "Activer mon compte" }).click();
    await expect(alertOf(page)).toHaveText(/ne correspond pas/);

    await page.locator("#newPassword").fill(CHOSEN_PASSWORD);
    await page.locator("#confirm").fill(CHOSEN_PASSWORD);
    await page.getByRole("button", { name: "Activer mon compte" }).click();
    await expect(page).toHaveURL(/\/login\?active=1$/);
    await expect(page.getByRole("status")).toHaveText(/Compte activé/);

    // Connexion directe, sans changement de mot de passe forcé ni bandeau d'adresse manquante
    await login(page, "invite.actif", CHOSEN_PASSWORD);
    await expect(page).toHaveURL(/\/agent-pedagogique$/);
    await expect(page.getByRole("link", { name: "Ajouter mon adresse" })).toHaveCount(0);

    // Le lien est à usage unique
    await page.context().clearCookies();
    await page.goto(`/activer-compte?token=${encodeURIComponent(token)}`);
    await expect(page.getByText(/invalide ou a expiré/)).toBeVisible();
  });

  test("un lien expiré ou inventé n'active rien", async ({ page }) => {
    const token = randomBytes(32).toString("base64url");
    await createPendingAccount("invite.expire", token, -1000);
    await page.goto(`/activer-compte?token=${encodeURIComponent(token)}`);
    await expect(page.getByText(/invalide ou a expiré/)).toBeVisible();
    await page.goto("/activer-compte?token=inventé");
    await expect(page.getByText(/invalide ou a expiré/)).toBeVisible();
  });

  test("le superadmin voit l'invitation en attente et peut la renvoyer puis l'annuler", async ({ page }) => {
    const token = randomBytes(32).toString("base64url");
    await createPendingAccount("invite.attente", token);

    await signIn(page, ACCOUNTS.superadmin);
    await page.goto("/admin/permissions");
    const card = page.locator("section", { hasText: "invite.attente" }).last();
    await expect(card.getByText("En attente d'activation")).toBeVisible();
    await expect(card.getByText(/Invitation envoyée à/)).toBeVisible();

    await card.getByRole("button", { name: "Renvoyer l'invitation" }).click();
    await expect(card.getByRole("status")).toContainText(/Invitation renvoyée/);

    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: "Annuler l'invitation" }).click();
    await expect(page.locator("section", { hasText: "invite.attente" })).toHaveCount(0);
  });
});
