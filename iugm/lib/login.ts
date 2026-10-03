import bcrypt from "bcryptjs";

import { prisma } from "./prisma";
import {
  createSessionToken,
  newSessionId,
  createTwoFactorChallengeToken,
  verifyTwoFactorChallengeToken,
} from "./auth";
import { logAction } from "./audit";
import { getClientIp, checkLoginRateLimit, recordLoginAttempt } from "./rate-limit";
import { sendWelcomeAnnouncementOnFirstLogin } from "./announcements";
import { verifyTwoFactorLogin } from "./two-factor";

export type LoginResult =
  | { ok: true; kind: "session"; token: string; destination: string }
  // Mot de passe correct, mais le compte exige un second facteur : aucun accès
  // n'est accordé avant la saisie du code (voir completeTwoFactorLogin).
  | { ok: true; kind: "two-factor"; challengeToken: string }
  | { ok: false; status: number; error: string };

export const HOME_BY_ROLE: Record<string, string> = {
  SUPERADMIN: "/admin",
  AGENT_ADMINISTRATION: "/agent-admin",
  AGENT_PEDAGOGIQUE: "/agent-pedagogique",
  ETUDIANT: "/mon-profil",
};

const GENERIC_CREDENTIALS_ERROR = "Email ou mot de passe incorrect.";

// Hash bcrypt (coût 10) d'une valeur sans importance : comparé quand le compte
// n'existe pas, pour que la durée de la réponse ne révèle pas si un email est
// enregistré (sinon : réponse instantanée = email inconnu, ~60 ms = email connu).
const DUMMY_PASSWORD_HASH = "$2b$10$kTA1qS950F2FbFsggUcSo.BbxspQlDpIKbekqmLvmIqJMwimQe5.i";

// Authentifie un utilisateur : vérifie identifiants et compte actif,
// journalise le résultat, retourne le jeton et la destination selon le rôle.
export async function authenticateUser(email: string, password: string): Promise<LoginResult> {
  if (!email || !password) {
    return { ok: false, status: 400, error: "Email et mot de passe obligatoires." };
  }

  const ip = await getClientIp();

  // Anti-bruteforce : on refuse AVANT de toucher au mot de passe (pas de
  // comparaison bcrypt inutile, pas de différence de timing exploitable).
  const rateLimit = await checkLoginRateLimit(email, ip);
  if (rateLimit.limited) {
    await logAction("LOGIN_RATE_LIMITED", `Blocage anti-bruteforce pour ${email}`);
    return {
      ok: false,
      status: 429,
      error: `Trop de tentatives. Réessayez dans ${rateLimit.retryAfterMinutes} minutes.`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      mustChangePassword: true,
      active: true,
      totpEnabled: true,
    },
  });

  // Toujours une comparaison bcrypt, que le compte existe ou non
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user) {
    await recordLoginAttempt(email, ip, false);
    await logAction("LOGIN_FAILED", `Email inconnu : ${email}`);
    return { ok: false, status: 401, error: GENERIC_CREDENTIALS_ERROR };
  }

  if (!passwordOk) {
    await recordLoginAttempt(email, ip, false);
    await logAction("LOGIN_FAILED", `Mot de passe erroné pour ${email}`, user.id);
    return { ok: false, status: 401, error: GENERIC_CREDENTIALS_ERROR };
  }

  // Le statut du compte n'est révélé qu'à qui connaît le bon mot de passe :
  // sinon n'importe qui pourrait lister les comptes désactivés.
  if (!user.active) {
    await recordLoginAttempt(email, ip, false);
    await logAction("LOGIN_FAILED", `Compte désactivé : ${email}`, user.id);
    return { ok: false, status: 403, error: "Compte désactivé. Contactez l'administration." };
  }

  // Mot de passe initial prévisible : changement forcé avant tout accès
  const destination = user.mustChangePassword
    ? "/changer-mot-de-passe"
    : (HOME_BY_ROLE[user.role] ?? "/");

  if (user.totpEnabled) {
    // Le compteur d'échecs n'est PAS purgé ici : tant que le second facteur
    // n'est pas validé, l'attaquant qui connaît le mot de passe ne gagne rien.
    await logAction("LOGIN_2FA_REQUIRED", `Second facteur demandé pour ${user.email}`, user.id);
    return {
      ok: true,
      kind: "two-factor",
      challengeToken: createTwoFactorChallengeToken({ userId: user.id, destination }),
    };
  }

  await recordLoginAttempt(email, ip, true);
  const token = await openSession(user);
  await logAction("LOGIN_SUCCESS", `Connexion de ${user.email}`, user.id);
  await runFirstLoginHooks(user.id, user.role);

  return { ok: true, kind: "session", token, destination };
}

// Ouvre LA session du compte : un nouvel identifiant remplace celui enregistré
// (User.currentSessionId), ce qui ferme d'un coup les sessions ouvertes sur tout
// autre appareil — un compte n'est connecté qu'à un endroit à la fois.
// L'écriture précède l'émission du jeton : à aucun moment il n'existe de jeton
// valable que la base ne reconnaisse pas, et de deux connexions simultanées une
// seule survit (la dernière à écrire).
async function openSession(user: {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}): Promise<string> {
  const sid = newSessionId();
  await prisma.user.update({ where: { id: user.id }, data: { currentSessionId: sid } });
  return createSessionToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    sid,
    ...(user.mustChangePassword ? { mcp: true } : {}),
  });
}

// Best-effort : un souci ici (compte étudiant sans dossier lié, etc.) ne
// doit jamais empêcher la connexion elle-même.
async function runFirstLoginHooks(userId: string, role: string): Promise<void> {
  if (role !== "ETUDIANT") return;
  try {
    await sendWelcomeAnnouncementOnFirstLogin(userId);
  } catch (e) {
    console.error("Échec de l'envoi du communiqué de bienvenue :", e);
  }
}

// Seconde étape de la connexion : valide le code (TOTP ou secours) contre le
// défi émis par authenticateUser, puis ouvre la session. Partage le compteur
// anti-bruteforce de la première étape : 5 mauvais codes = compte bloqué 15 min.
export async function completeTwoFactorLogin(
  challengeToken: string | undefined,
  code: string,
): Promise<LoginResult> {
  const challenge = challengeToken ? verifyTwoFactorChallengeToken(challengeToken) : null;
  if (!challenge) {
    return {
      ok: false,
      status: 401,
      error: "La vérification a expiré. Reconnectez-vous avec votre mot de passe.",
    };
  }
  if (!code.trim()) {
    return { ok: false, status: 400, error: "Saisissez le code de vérification." };
  }

  const user = await prisma.user.findUnique({
    where: { id: challenge.userId },
    select: { id: true, email: true, role: true, active: true, mustChangePassword: true },
  });
  if (!user || !user.active) {
    return {
      ok: false,
      status: 401,
      error: "La vérification a expiré. Reconnectez-vous avec votre mot de passe.",
    };
  }

  const ip = await getClientIp();
  const rateLimit = await checkLoginRateLimit(user.email, ip);
  if (rateLimit.limited) {
    await logAction("LOGIN_RATE_LIMITED", `Blocage anti-bruteforce (2FA) pour ${user.email}`, user.id);
    return {
      ok: false,
      status: 429,
      error: `Trop de tentatives. Réessayez dans ${rateLimit.retryAfterMinutes} minutes.`,
    };
  }

  const verification = await verifyTwoFactorLogin(user.id, code);
  if (!verification.ok) {
    await recordLoginAttempt(user.email, ip, false);
    await logAction("LOGIN_FAILED", `Code 2FA incorrect pour ${user.email}`, user.id);
    return { ok: false, status: 401, error: "Code incorrect ou expiré." };
  }

  await recordLoginAttempt(user.email, ip, true);
  const token = await openSession(user);
  await logAction(
    "LOGIN_SUCCESS",
    verification.usedRecoveryCode
      ? `Connexion de ${user.email} (2FA, code de secours utilisé)`
      : `Connexion de ${user.email} (2FA)`,
    user.id,
  );
  await runFirstLoginHooks(user.id, user.role);

  // La destination du défi est recalculée plutôt que reprise du jeton : un
  // changement de mot de passe obligatoire posé entre-temps reste respecté.
  const destination = user.mustChangePassword
    ? "/changer-mot-de-passe"
    : (HOME_BY_ROLE[user.role] ?? "/");
  return { ok: true, kind: "session", token, destination };
}
