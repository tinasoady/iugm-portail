import { expect, test } from "@playwright/test";

import { alertOf, ACCOUNTS, PASSWORD, login } from "./fixtures";

test.describe("accès et connexion", () => {
  test("une page protégée renvoie vers la connexion sans session", async ({ page }) => {
    for (const path of ["/admin", "/agent-admin", "/etudiants", "/rapports", "/profil"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("l'API protégée refuse un appel sans session", async ({ request }) => {
    const response = await request.get("/api/students/export", { maxRedirects: 0 });
    // le proxy redirige vers /login (302/307) : jamais de données
    expect([301, 302, 303, 307, 308]).toContain(response.status());
  });

  test("un mauvais mot de passe affiche une erreur générique sans quitter la page", async ({ page }) => {
    await login(page, ACCOUNTS.superadmin.email, "mauvais-motdepasse-1");
    await expect(alertOf(page)).toHaveText(/Email ou mot de passe incorrect/);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("un email inconnu reçoit exactement le même message", async ({ page }) => {
    await login(page, "personne@e2e.test", PASSWORD);
    await expect(alertOf(page)).toHaveText(/Email ou mot de passe incorrect/);
  });

  for (const key of ["superadmin", "agentAdmin", "agentPedago"] as const) {
    test(`${key} arrive sur son espace et peut se déconnecter`, async ({ page }) => {
      const account = ACCOUNTS[key];
      await login(page, account.email, account.password);
      await expect(page).toHaveURL(new RegExp(`${account.home}$`));

      // Menu du compte : <details> ouvert par son résumé, puis déconnexion
      await page.locator("header summary").click();
      await page.getByRole("button", { name: "Se déconnecter" }).click();
      await expect(page).toHaveURL(/\/login$/);

      // La session est bien fermée : l'espace n'est plus accessible
      await page.goto(account.home);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("un agent ne peut pas ouvrir l'espace d'administration", async ({ page }) => {
    await login(page, ACCOUNTS.agentAdmin.email, ACCOUNTS.agentAdmin.password);
    await expect(page).toHaveURL(/\/agent-admin$/);
    await page.goto("/admin/permissions");
    await expect(page).not.toHaveURL(/\/admin\/permissions/);
  });

  test("icône d'onglet, manifeste et service worker sont servis SANS session", async ({ request }) => {
    for (const path of ["/icon.png", "/icon-192.png", "/manifest.json", "/sw.js"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
    }
    const icon = await request.get("/icon.png");
    expect(icon.headers()["content-type"]).toContain("image/png");
  });

  test("la page de connexion déclare l'icône d'onglet", async ({ request }) => {
    const html = await (await request.get("/login")).text();
    expect(html).toMatch(/<link[^>]*rel="icon"[^>]*href="\/icon\.png/);
  });

  test("la sonde de santé répond 200 sans détail interne", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", database: "ok" });
    expect(JSON.stringify(body)).not.toMatch(/postgres|password|localhost/i);
  });

  test("les en-têtes de sécurité sont présents", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
});
