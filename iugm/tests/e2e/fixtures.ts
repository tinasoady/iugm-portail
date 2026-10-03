import type { Page } from "@playwright/test";

// Comptes créés par global-setup.ts, partagés par tous les scénarios.
export const PASSWORD = "E2e-motdepasse-2026";

export const ACCOUNTS = {
  superadmin: { email: "root@e2e.test", password: PASSWORD, home: "/admin" },
  agentAdmin: { email: "agent-admin@e2e.test", password: PASSWORD, home: "/agent-admin" },
  agentPedago: { email: "agent-pedago@e2e.test", password: PASSWORD, home: "/agent-pedagogique" },
  twoFactor: { email: "tfa@e2e.test", password: PASSWORD, home: "/admin" },
  // Superadmin SANS 2FA, qui la configure pendant le scénario de configuration
  setupTwoFactor: { email: "setup-tfa@e2e.test", password: PASSWORD, home: "/admin" },
  // Compte étudiant dont le mot de passe est temporaire (changement obligatoire)
  mustChange: { email: "etudiant-temp@e2e.test", password: PASSWORD, home: "/mon-profil" },
  // Compte pour le scénario « mot de passe oublié » (adresse e-mail réelle du compte)
  // Agent qui configure son adresse de récupération pendant le scénario dédié
  recoveryUser: { email: "recup@e2e.test", password: PASSWORD, home: "/agent-pedagogique" },
  // Compte utilisé depuis deux « appareils » (deux contextes de navigateur) à la fois
  twoDevices: { email: "deux-appareils@e2e.test", password: PASSWORD, home: "/agent-admin" },
  resetUser: { email: "oubli@e2e.test", password: PASSWORD, home: "/agent-admin" },
} as const;

// Secret TOTP du compte à double authentification (base32, 160 bits)
export const TFA_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
export const TFA_RECOVERY_CODE = "ABCDE-FGHJK";

// Les messages d'erreur de l'application (role="alert") — hors annonceur de
// navigation de Next.js, qui porte lui aussi ce rôle.
export function alertOf(page: Page) {
  return page.locator("[role=alert]:not(#__next-route-announcer__)");
}

// Connexion complète : attend d'être arrivé dans l'espace du compte. Sans cette
// attente, une navigation immédiate (page.goto) interromprait la redirection
// avant que le cookie de session ne soit posé.
export async function signIn(page: Page, account: { email: string; password: string; home: string }) {
  await login(page, account.email, account.password);
  await page.waitForURL(`**${account.home}`);
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}
