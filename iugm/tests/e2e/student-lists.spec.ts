import { expect, test, type Page } from "@playwright/test";

import { ACCOUNTS, signIn } from "./fixtures";

// Listes d'étudiants : 10 par 10, avec défilement dans leur propre cadre (la
// page ne bouge pas), et choix du niveau / de la filière sur « Notes par
// matière ». 25 dossiers de test sont créés puis supprimés.
const PREFIX = "LISTETEST";
const TOTAL = 25;
const createdIds: string[] = [];

test.describe.serial("listes d'étudiants", () => {
  test.beforeAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    const { registerStudent } = await import("@/lib/students");
    const agent = await prisma.user.findUniqueOrThrow({
      where: { email: ACCOUNTS.agentAdmin.username },
    });
    for (let i = 1; i <= TOTAL; i++) {
      const student = await registerStudent(
        {
          academicYear: "2026-2027",
          lastName: PREFIX,
          firstName: `Etu${String(i).padStart(2, "0")}`,
          nationality: "Malagasy",
          gender: "M",
          birthDate: new Date("2005-01-01"),
          birthPlace: "Mahajanga",
          phone: "0341234567",
          address: "Lot 12 Mahajanga",
          maritalStatus: "Célibataire",
          baccNumber: `LT-BACC-${i}`,
          baccSeries: "D",
          baccMention: "Passable",
          baccYear: "2024",
          guardianName: "Parent Test",
          guardianPhone: "0341112233",
          mention: "Management",
          level: i > 20 ? "L2" : "L1",
          docResidenceCert: true,
          docCinCopy: true,
          docParentCin: true,
          docPhotos: true,
          docPinkFolder: true,
          docPaymentSlip: true,
          docEngagementLetter: true,
        },
        agent.id,
      );
      createdIds.push(student.id);
    }
    await prisma.student.updateMany({
      where: { id: { in: createdIds } },
      data: { status: "INSCRIT" },
    });
  });

  test.afterAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.student.deleteMany({ where: { id: { in: createdIds } } });
  });

  async function rowCount(page: Page) {
    return page.locator("table tbody tr:visible").count();
  }

  test("liste générale : 10 dossiers, « Voir plus » en ajoute 10, la page ne défile pas", async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.agentAdmin);
    await page.goto(`/etudiants?q=${PREFIX}&niveau=`);

    await expect.poll(() => rowCount(page)).toBe(10);
    await expect(page.getByText(`10 sur ${TOTAL} affichés`)).toBeVisible();

    await page.getByRole("link", { name: "Voir plus" }).click();
    await expect.poll(() => rowCount(page)).toBe(20);
    await expect(page.getByText(`20 sur ${TOTAL} affichés`)).toBeVisible();

    // Le cadre défile à l'intérieur, sans faire bouger la page entière
    const frame = page.locator("div.overflow-auto").filter({ has: page.locator("table") }).first();
    const metrics = await frame.evaluate((el) => ({
      scrollable: el.scrollHeight > el.clientHeight,
      height: el.clientHeight,
    }));
    expect(metrics.scrollable).toBe(true);
    expect(metrics.height).toBeLessThan(600);
    const pageBefore = await page.evaluate(() => window.scrollY);
    await frame.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await frame.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageBefore);

    // Le défilement du cadre est conservé quand on en charge dix de plus
    await page.getByRole("link", { name: "Voir plus" }).click();
    await expect.poll(() => rowCount(page)).toBe(25);
    expect(await frame.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: "Voir plus" })).toHaveCount(0);
  });

  test("notes par matière : niveau et filière se choisissent d'un clic", async ({ page }) => {
    await signIn(page, ACCOUNTS.agentPedago);
    await page.goto(`/agent-pedagogique/notes?qi=${PREFIX}&niveau=ALL`);

    await expect.poll(() => rowCount(page)).toBe(10);
    await expect(page.getByText(`10 sur ${TOTAL} affichés`)).toBeVisible();

    // Niveau : la liste se met à jour sans cliquer sur « Rechercher »
    await page.getByLabel("Niveau", { exact: true }).selectOption("L2");
    await expect(page).toHaveURL(/niveau=L2/);
    await expect.poll(() => rowCount(page)).toBe(5);

    // Filière : idem, et le niveau choisi est conservé
    await page.getByLabel("Filière", { exact: true }).selectOption("Management");
    await expect(page).toHaveURL(/filiere=Management/);
    await expect(page).toHaveURL(/niveau=L2/);
    await expect.poll(() => rowCount(page)).toBe(5);

    // Retour à tous les niveaux : les 25 reviennent, 10 par 10
    await page.getByLabel("Niveau", { exact: true }).selectOption("ALL");
    await expect.poll(() => rowCount(page)).toBe(10);
    await expect(page.getByText(`10 sur ${TOTAL} affichés`)).toBeVisible();
  });
});
