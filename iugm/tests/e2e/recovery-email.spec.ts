import { createHash, randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { ACCOUNTS, PASSWORD, alertOf, signIn } from "./fixtures";

const RECOVERY_ADDRESS = "vraie.boite@e2e.test";

test.describe.serial("adresse de récupération", () => {
  test("la demande exige le bon mot de passe, puis annonce l'envoi sans activer l'adresse", async ({ page }) => {
    await signIn(page, ACCOUNTS.recoveryUser);
    await page.goto("/profil");
    await expect(page.getByRole("heading", { name: "Adresse de récupération" })).toBeVisible();
    await expect(page.getByText(/aucune — le lien serait envoyé à votre identifiant/)).toBeVisible();

    // Mauvais mot de passe : refusé
    await page.locator("#recovery-email").fill(RECOVERY_ADDRESS);
    await page.locator("#recovery-password").fill("mauvais-motdepasse-1");
    await page.getByRole("button", { name: "Envoyer le message de confirmation" }).click();
    await expect(alertOf(page)).toHaveText(/Mot de passe incorrect/);

    // Bon mot de passe : message de confirmation envoyé (mode journal), adresse PAS encore active
    await page.locator("#recovery-email").fill(RECOVERY_ADDRESS);
    await page.locator("#recovery-password").fill(PASSWORD);
    await page.getByRole("button", { name: "Envoyer le message de confirmation" }).click();
    await expect(page.getByRole("status")).toContainText("v***e@e2e.test");
    await expect(page.getByText(/aucune — le lien serait envoyé à votre identifiant/)).toBeVisible();
  });

  test("le lien ne confirme rien au chargement, seulement au clic, une seule fois, sans session", async ({
    page,
    context,
  }) => {
    // Le vrai lien est écrit dans la console du serveur (MAIL_DRIVER=log) ; on fabrique
    // ici le même jeton en base pour pouvoir le suivre.
    const { prisma } = await import("../../lib/prisma");
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ACCOUNTS.recoveryUser.email } });
    const token = randomBytes(32).toString("base64url");
    await prisma.recoveryEmailToken.create({
      data: {
        userId: user.id,
        newEmail: RECOVERY_ADDRESS,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    await context.clearCookies(); // ouvert depuis la boîte mail, sans être connecté
    await page.goto(`/confirmer-adresse?token=${encodeURIComponent(token)}`);
    await expect(page.getByText("v***e@e2e.test")).toBeVisible();
    // Le jeton ne reste pas dans la barre d'adresse (capture d'écran, historique)
    await expect(page).toHaveURL(/\/confirmer-adresse$/);
    expect(page.url()).not.toContain(token);

    // Charger la page (ce que font les antivirus de messagerie) n'enregistre RIEN
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).recoveryEmail).toBeNull();

    await page.getByRole("button", { name: "Confirmer cette adresse" }).click();
    await expect(page.getByRole("status")).toContainText("adresse de récupération");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).recoveryEmail).toBe(RECOVERY_ADDRESS);
    await prisma.$disconnect();

    // Le même lien ne fonctionne plus
    await page.goto(`/confirmer-adresse?token=${encodeURIComponent(token)}`);
    await expect(page.getByText(/invalide ou a expiré/)).toBeVisible();
  });

  test("l'adresse confirmée s'affiche dans Mon compte et peut être retirée", async ({ page }) => {
    await signIn(page, ACCOUNTS.recoveryUser);
    await page.goto("/profil");
    await expect(page.getByText("v***e@e2e.test (confirmée)")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#recovery-remove-password").fill(PASSWORD);
    await page.getByRole("button", { name: "Retirer", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(/retirée/);
    await expect(page.getByText(/aucune — le lien serait envoyé à votre identifiant/)).toBeVisible();
  });

  test("un jeton inventé est refusé, la page est publique", async ({ page }) => {
    await page.goto("/confirmer-adresse?token=nimporte-quoi");
    await expect(page).toHaveURL(/\/confirmer-adresse\?/);
    await expect(page.getByText(/invalide ou a expiré/)).toBeVisible();
  });
});
