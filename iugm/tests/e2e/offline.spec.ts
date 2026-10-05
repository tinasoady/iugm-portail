import { expect, test, type Page } from "@playwright/test";

import { ACCOUNTS, signIn } from "./fixtures";

// Mode avion sur la page d'inscription : l'application doit rester utilisable
// (formulaire, récapitulatif, mise en file locale), jamais l'écran d'erreur
// générique. Voir docs/OFFLINE_SYNC.md.

async function waitForServiceWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}

// Remplit les champs obligatoires visibles de l'étape courante, puis avance
async function fillCurrentStep(page: Page) {
  const step = page.locator("[data-step]:not(.hidden)");
  const inputs = step.locator("input[required], select[required]");
  const count = await inputs.count();
  const seenRadios = new Set<string>();
  for (let i = 0; i < count; i++) {
    const el = inputs.nth(i);
    const type = (await el.getAttribute("type")) ?? "select";
    const name = (await el.getAttribute("name")) ?? "";
    if (type === "radio") {
      if (seenRadios.has(name)) continue;
      seenRadios.add(name);
      await el.evaluate((n) => (n as HTMLInputElement).click());
    } else if (type === "checkbox") {
      await el.check();
    } else if (type === "date") {
      await el.fill("2000-01-01");
    } else if (type === "number") {
      await el.fill("2020");
    } else if (type === "tel") {
      await el.fill("0340000000");
    } else if (type === "email") {
      await el.fill("test@exemple.mg");
    } else if (type === "file") {
      continue;
    } else if (type === "select") {
      const value = await el.evaluate((n) => {
        const opts = Array.from((n as HTMLSelectElement).options).filter((o) => o.value);
        return opts[0]?.value ?? "";
      });
      if (value) await el.selectOption(value);
    } else if (!(await el.inputValue())) {
      await el.fill("Test");
    }
  }
}

test.describe("inscription hors ligne", () => {
  test("rechargement hors ligne puis saisie jusqu'au récapitulatif et mise en file", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await signIn(page, ACCOUNTS.agentAdmin);
    await page.getByRole("link", { name: "Inscription", exact: true }).first().click();
    await page.waitForURL("**/agent-admin/inscription");
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("Une erreur est survenue")).toHaveCount(0);
    await expect(page.getByText(/Hors ligne/).first()).toBeVisible();

    await page.getByRole("button", { name: "+ Inscrire un étudiant" }).click();
    for (let i = 0; i < 8; i++) {
      await fillCurrentStep(page);
      const valider = page.getByRole("button", { name: /Valider l'inscription/ });
      if (await valider.isVisible()) break;
      await page.getByRole("button", { name: /Suivant/ }).click();
      await expect(page.getByText("Une erreur est survenue"), errors.join("\n")).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: /Valider l'inscription/ })).toBeVisible();
    await page.getByRole("button", { name: /Valider l'inscription/ }).click();
    await expect(page.getByText("Dossier enregistré hors ligne"), errors.join("\n")).toBeVisible();
  });

  test("mode avion activé sans recharger la page, saisie jusqu'à la mise en file", async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await signIn(page, ACCOUNTS.agentAdmin);
    await page.getByRole("link", { name: "Inscription", exact: true }).first().click();
    await page.waitForURL("**/agent-admin/inscription");
    await expect(page.getByText("Rechercher un étudiant dans la base")).toBeVisible();
    await page.waitForTimeout(2000);

    await context.setOffline(true);
    await page.waitForTimeout(6000); // laisse passer sondage et contrôles périodiques
    await expect(page.getByText("Une erreur est survenue"), errors.join("\n")).toHaveCount(0);
    await expect(page.getByText(/Hors ligne/).first()).toBeVisible();

    await page.getByRole("button", { name: "+ Inscrire un étudiant" }).click();
    for (let i = 0; i < 8; i++) {
      await fillCurrentStep(page);
      const valider = page.getByRole("button", { name: /Valider l'inscription/ });
      if (await valider.isVisible()) break;
      await page.getByRole("button", { name: /Suivant/ }).click();
      await expect(page.getByText("Une erreur est survenue"), errors.join("\n")).toHaveCount(0);
    }
    await page.getByRole("button", { name: /Valider l'inscription/ }).click();
    await expect(page.getByText("Dossier enregistré hors ligne"), errors.join("\n")).toBeVisible();
  });

  test("navigation par clic sur le menu une fois le réseau coupé", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await signIn(page, ACCOUNTS.agentAdmin);
    await waitForServiceWorker(page);
    await page.waitForTimeout(2500); // laisse le service worker préparer les pages

    await context.setOffline(true);
    await page.getByRole("link", { name: "Inscription", exact: true }).first().click();
    await page.waitForTimeout(3000);
    await expect(page.getByText("Une erreur est survenue"), errors.join("\n")).toHaveCount(0);
    await expect(page.getByText("Rechercher un étudiant")).toBeVisible();
  });
});

// Cas fréquent sur un poste Windows (Docker, VPN, carte virtuelle) : le
// navigateur croit rester « en ligne » (navigator.onLine = true) alors qu'aucun
// serveur n'est joignable. On le simule en faisant échouer toutes les requêtes
// sans toucher à navigator.onLine.
test.describe("réseau injoignable alors que le navigateur se croit en ligne", () => {
  test.use({ serviceWorkers: "block" });

  test("le bandeau s'affiche et la saisie part en file locale", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await signIn(page, ACCOUNTS.agentAdmin);
    await page.getByRole("link", { name: "Inscription", exact: true }).first().click();
    await page.waitForURL("**/agent-admin/inscription");
    await expect(page.getByText("Rechercher un étudiant dans la base")).toBeVisible();
    await page.waitForTimeout(1500);

    await page.route("**/*", (route) => route.abort("internetdisconnected"));
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);

    // Le bandeau doit détecter l'absence de réseau malgré navigator.onLine
    await expect(page.getByText(/Hors ligne/).first()).toBeVisible({ timeout: 25_000 });

    await page.getByRole("button", { name: "+ Inscrire un étudiant" }).click();
    for (let i = 0; i < 8; i++) {
      await fillCurrentStep(page);
      const valider = page.getByRole("button", { name: /Valider l'inscription/ });
      if (await valider.isVisible()) break;
      await page.getByRole("button", { name: /Suivant/ }).click();
    }
    await page.getByRole("button", { name: /Valider l'inscription/ }).click();
    await expect(page.getByText("Une erreur est survenue"), errors.join("\n")).toHaveCount(0);
    await expect(page.getByText("Dossier enregistré hors ligne")).toBeVisible();
  });
});
