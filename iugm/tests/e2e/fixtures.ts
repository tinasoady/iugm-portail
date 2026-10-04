import type { Page } from "@playwright/test";

// Comptes créés par global-setup.ts, partagés par tous les scénarios.
export const PASSWORD = "E2e-motdepasse-2026";

export const ACCOUNTS = {
  superadmin: { username: "root", password: PASSWORD, home: "/admin" },
  agentAdmin: { username: "agent.admin", password: PASSWORD, home: "/agent-admin" },
  agentPedago: { username: "agent.pedago", password: PASSWORD, home: "/agent-pedagogique" },
  twoFactor: { username: "tfa", password: PASSWORD, home: "/admin" },
  // Superadmin SANS 2FA, qui la configure pendant le scénario de configuration
  setupTwoFactor: { username: "setup.tfa", password: PASSWORD, home: "/admin" },
  // Compte étudiant dont le mot de passe est temporaire (changement obligatoire)
  mustChange: { username: "etudiant.temp", password: PASSWORD, home: "/mon-profil" },
  // Agent qui ajoute son adresse e-mail vérifiée pendant le scénario dédié
  recoveryUser: { username: "recup", password: PASSWORD, home: "/agent-pedagogique" },
  // Compte utilisé depuis deux « appareils » (deux contextes de navigateur) à la fois
  twoDevices: { username: "deux.appareils", password: PASSWORD, home: "/agent-admin" },
  resetUser: { username: "oubli", password: PASSWORD, home: "/agent-admin" },
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
export async function signIn(page: Page, account: { username: string; password: string; home: string }) {
  await login(page, account.username, account.password);
  await page.waitForURL(`**${account.home}`);
}

export async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}
