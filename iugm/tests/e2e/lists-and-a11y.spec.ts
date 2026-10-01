import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ACCOUNTS, signIn } from "./fixtures";

test.describe("listes paginées", () => {
  test("le tableau de bord affiche 20 utilisateurs puis en ajoute 20 avec « Voir plus »", async ({ page }) => {
    await signIn(page, ACCOUNTS.superadmin);
    await expect(page).toHaveURL(/\/admin$/);

    // Le nombre de comptes dépend des scénarios déjà passés : on le lit à l'écran
    const counter = page.getByText(/^20 sur \d+ affichés$/);
    await expect(counter).toBeVisible();
    const total = Number((await counter.innerText()).match(/sur (\d+)/)![1]);
    expect(total).toBeGreaterThan(20);

    const rows = page.locator("#users tbody tr");
    await expect(rows).toHaveCount(20);

    await page.getByRole("link", { name: "Voir plus" }).click();
    await expect(page).toHaveURL(/limit=40/);
    await expect(rows).toHaveCount(Math.min(40, total));
    if (total <= 40) {
      await expect(page.getByRole("link", { name: "Voir plus" })).toHaveCount(0);
      await expect(page.getByText(`${total} sur ${total} affichés`)).toBeVisible();
    }
  });

  test("une valeur de limite absurde est ramenée à une page", async ({ page }) => {
    await signIn(page, ACCOUNTS.superadmin);
    await page.goto("/admin?limit=-5");
    await expect(page.locator("#users tbody tr")).toHaveCount(20);
    await page.goto("/admin?limit=abc");
    await expect(page.locator("#users tbody tr")).toHaveCount(20);
  });
});

// Contrôle automatique d'accessibilité (WCAG 2.0/2.1 A et AA). Il ne remplace
// pas un audit manuel, mais empêche toute régression sur ce qu'il sait détecter.
async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const path = new URL(page.url()).pathname;
  const summary = results.violations.map((v) => {
    const nodes = v.nodes
      .slice(0, 4)
      .map((n) => `    ${n.target.join(" ")} — ${n.any[0]?.message ?? ""}`)
      .join("\n");
    return `${v.id} (${v.impact}) sur ${path} : ${v.nodes.length} élément(s)\n${nodes}`;
  });
  expect(summary, `Violations d'accessibilité :\n${summary.join("\n")}`).toEqual([]);
}

test.describe("accessibilité (axe)", () => {
  for (const path of ["/login", "/mot-de-passe-oublie"]) {
    test(`${path} (public)`, async ({ page }) => {
      await page.goto(path);
      await expectNoViolations(page);
    });
  }

  test("pages d'administration", async ({ page }) => {
    await signIn(page, ACCOUNTS.superadmin);
    for (const path of ["/admin", "/admin/permissions", "/admin/journal", "/rapports", "/profil", "/etudiants"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expectNoViolations(page);
    }
  });

  test("pages d'un agent", async ({ page }) => {
    await signIn(page, ACCOUNTS.agentAdmin);
    for (const path of ["/agent-admin", "/agent-admin/ecolage", "/communiquer"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expectNoViolations(page);
    }
  });

  test("le lien d'évitement est le premier élément atteint au clavier", async ({ page }) => {
    await signIn(page, ACCOUNTS.superadmin);
    await page.goto("/admin");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Aller au contenu principal" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#contenu$/);
  });
});
