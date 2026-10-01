import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";

// Tests de bout en bout : un vrai navigateur pilote l'application construite
// (next build + next start) branchée sur la base de TEST — jamais celle de
// développement ni de production. En local, DATABASE_URL vient de .env.test ;
// en CI, du service PostgreSQL du job (voir .github/workflows/ci.yml).
if (existsSync(".env.test")) loadEnvFile(".env.test");

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Les scénarios partagent une seule base et s'enchaînent (le dossier créé par
  // l'un sert au suivant) : exécution séquentielle, un seul worker.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "fr-FR",
    timezoneId: "Indian/Antananarivo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // L'application doit avoir été construite avant (npm run test:e2e s'en charge)
    command: `npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "",
      // Les e-mails sont écrits dans la console du serveur, jamais envoyés
      MAIL_DRIVER: "log",
      APP_URL: BASE_URL,
    },
  },
});
