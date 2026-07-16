// E2E de la page Permissions avec un utilisateur jetable
import "./prisma/load-env";
import bcrypt from "bcryptjs";
import puppeteer from "puppeteer-core";
import { prisma } from "./lib/prisma";

const BASE = "http://localhost:3000";
const TEST_EMAIL = "test.perm@iugm.edu";

async function tryLogin(email: string, password: string): Promise<number> {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", body: form, redirect: "manual" });
  return res.status;
}

async function main() {
  // Utilisateur jetable
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      fullName: "Test Permission",
      role: "AGENT_PEDAGOGIQUE",
      passwordHash: await bcrypt.hash("testperm123", 10),
    },
  });
  console.log("✅ Utilisateur jetable créé,", "login initial:", await tryLogin(TEST_EMAIL, "testperm123"), "(303 attendu)");

  const browser = await puppeteer.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox"],
    defaultViewport: { width: 1500, height: 1000 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on("dialog", (d) => void d.accept());

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type("#email", "admin@iugm.edu");
  await page.type("#password", "admin123");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click("main form button[type=submit], form button[type=submit]"),
  ]);
  await page.goto(`${BASE}/admin/permissions`, { waitUntil: "networkidle0" });

  // Helpers : agit dans la ligne du tableau contenant l'email cible
  const inRow = async (fn: (rowIndex: number) => Promise<void>) => {
    const rows = await page.$$("tbody tr");
    for (let i = 0; i < rows.length; i++) {
      const text = await rows[i].evaluate((el) => el.textContent ?? "");
      if (text.includes(TEST_EMAIL)) {
        await fn(i);
        return;
      }
    }
    throw new Error("Ligne du testeur introuvable");
  };
  const clickRowButton = async (label: string) => {
    await inRow(async (i) => {
      const buttons = await page.$$(`tbody tr:nth-child(${i + 1}) button`);
      for (const b of buttons) {
        const t = await b.evaluate((el) => el.textContent ?? "");
        if (t.includes(label)) {
          await b.click();
          return;
        }
      }
      throw new Error(`Bouton ${label} introuvable`);
    });
  };
  const rowText = async (): Promise<string> => {
    let out = "";
    await inRow(async (i) => {
      out = await page.$eval(`tbody tr:nth-child(${i + 1})`, (el) => el.textContent ?? "");
    });
    return out;
  };
  const waitRow = (pred: string, timeout = 15000) =>
    page.waitForFunction(
      (email, needle) => {
        const row = [...document.querySelectorAll("tbody tr")].find((r) =>
          (r.textContent ?? "").includes(email),
        );
        return row ? (row.textContent ?? "").includes(needle) : false;
      },
      { timeout },
      TEST_EMAIL,
      pred,
    );

  // Ma propre ligne est verrouillée
  const selfRow = await page.evaluate(() => {
    const row = [...document.querySelectorAll("tbody tr")].find((r) =>
      (r.textContent ?? "").includes("admin@iugm.edu"),
    );
    return row?.textContent ?? "";
  });
  console.log(
    selfRow.includes("Votre propre compte")
      ? "✅ Ligne du superadmin verrouillée (non modifiable)"
      : "❌ La ligne du superadmin devrait être verrouillée",
  );

  // 1. Désactivation -> connexion refusée
  await clickRowButton("Désactiver");
  await waitRow("Désactivé");
  console.log("✅ Compte désactivé (badge mis à jour)");
  console.log("   login pendant désactivation:", await tryLogin(TEST_EMAIL, "testperm123"), "(403 attendu)");

  // 2. Réactivation -> connexion possible
  await clickRowButton("Réactiver");
  await waitRow("Actif");
  console.log("✅ Compte réactivé,", "login:", await tryLogin(TEST_EMAIL, "testperm123"), "(303 attendu)");

  // 3. Changement de rôle
  await inRow(async (i) => {
    await page.select(`tbody tr:nth-child(${i + 1}) select[name=role]`, "AGENT_ADMINISTRATION");
  });
  await clickRowButton("Appliquer");
  await waitRow("Agent d'administration");
  const dbRole = (await prisma.user.findUnique({ where: { email: TEST_EMAIL } }))?.role;
  console.log(dbRole === "AGENT_ADMINISTRATION" ? "✅ Rôle changé en base" : `❌ Rôle en base : ${dbRole}`);

  // 4. Réinitialisation du mot de passe
  await clickRowButton("Réinit. mdp");
  await waitRow("Mot de passe temporaire");
  const temp = (await rowText()).match(/transmettre\s*:\s*(\S+)/)?.[1];
  console.log("✅ Mot de passe temporaire affiché :", temp);
  const status = await tryLogin(TEST_EMAIL, temp!);
  console.log("   login avec temporaire:", status, "(303 attendu, redirigé vers changement)");

  await browser.close();

  // Nettoyage
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  console.log("🧹 Utilisateur jetable supprimé");
}

main()
  .catch((e) => {
    console.error("❌ ÉCHEC :", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
