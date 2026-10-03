import { expect, test, type Browser } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures";

// Un « appareil » = un contexte de navigateur distinct (cookies séparés).
async function connectedDevice(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await login(page, ACCOUNTS.twoDevices.email, ACCOUNTS.twoDevices.password);
  await page.waitForURL(`**${ACCOUNTS.twoDevices.home}`);
  return { context, page };
}

test.describe("un compte, un seul appareil connecté", () => {
  test("se connecter sur un second appareil ferme le premier, avec le motif", async ({ browser, baseURL }) => {
    const url = baseURL!;
    const deviceA = await connectedDevice(browser, url);
    const statusA = () => deviceA.page.request.get("/api/session/status");
    expect((await statusA()).status()).toBe(200);

    // Le même compte se connecte ailleurs
    const deviceB = await connectedDevice(browser, url);

    // Appareil A : le contrôle de session répond 401 avec le motif « replaced »
    const closed = await statusA();
    expect(closed.status()).toBe(401);
    expect(await closed.json()).toEqual({ ok: false, reason: "replaced" });
    // Appareil B : toujours connecté
    expect((await deviceB.page.request.get("/api/session/status")).status()).toBe(200);

    // L'écran de A se ferme tout seul au prochain contrôle (ici déclenché par le focus)
    await deviceA.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(deviceA.page).toHaveURL(/\/login\?raison=replaced/);
    await expect(deviceA.page.getByRole("status")).toContainText("autre appareil");

    // A ne peut plus rien ouvrir ; B continue de travailler
    await deviceA.page.goto("/agent-admin");
    await expect(deviceA.page).toHaveURL(/\/login/);
    await deviceB.page.goto("/agent-admin");
    await expect(deviceB.page).toHaveURL(/\/agent-admin$/);

    await deviceA.context.close();
    await deviceB.context.close();
  });

  test("l'appareil fermé peut se reconnecter, ce qui ferme à son tour l'autre", async ({ browser, baseURL }) => {
    const url = baseURL!;
    const deviceA = await connectedDevice(browser, url);
    const deviceB = await connectedDevice(browser, url);
    expect((await deviceA.page.request.get("/api/session/status")).status()).toBe(401);

    // A se reconnecte : c'est maintenant B qui est fermé
    await login(deviceA.page, ACCOUNTS.twoDevices.email, ACCOUNTS.twoDevices.password);
    await deviceA.page.waitForURL(`**${ACCOUNTS.twoDevices.home}`);
    expect((await deviceA.page.request.get("/api/session/status")).status()).toBe(200);
    expect((await deviceB.page.request.get("/api/session/status")).status()).toBe(401);

    await deviceA.context.close();
    await deviceB.context.close();
  });

  test("le contrôle de session répond 401 sans cookie, sans rien révéler", async ({ request }) => {
    const response = await request.get("/api/session/status", { maxRedirects: 0 });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ ok: false, reason: "expired" });
  });

  test("un motif inconnu dans l'adresse n'affiche aucun texte venu de l'URL", async ({ page }) => {
    await page.goto("/login?raison=<script>alert(1)</script>");
    await expect(page.getByText("alert(1)")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveCount(0);
  });
});
