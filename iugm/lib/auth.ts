import crypto from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";

import { prisma } from "./prisma";

export const SESSION_COOKIE = "iugm_session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8h

// Cookie du défi à deux facteurs : posé entre la saisie du mot de passe et celle
// du code TOTP, sans donner accès à quoi que ce soit tant que le code n'est pas validé.
export const TWO_FACTOR_COOKIE = "iugm_2fa";
export const TWO_FACTOR_MAX_AGE = 60 * 5; // 5 min

export type SessionPayload = {
  sub: string; // id de l'utilisateur
  email: string;
  role: string;
  iat: number; // date d'émission (secondes Unix)
  // Changement de mot de passe obligatoire : le proxy cantonne alors la
  // session à /changer-mot-de-passe (voir proxy.ts).
  mcp?: boolean;
  // Identifiant de session (voir User.currentSessionId) : absent des jetons émis
  // avant l'introduction de la session unique, qui restent valables jusqu'à la
  // prochaine connexion du compte.
  sid?: string;
};

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Configuration AUTH_SECRET manquante");
  return secret;
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", getAuthSecret()).update(payloadB64).digest("hex");
}

// Signe un objet : base64url(JSON).signature
function encodeSigned(payload: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

// Vérifie la signature (comparaison à temps constant) et renvoie le contenu,
// ou null si le jeton est mal formé ou falsifié. Ne vérifie PAS l'expiration
// ni la nature du jeton : c'est le rôle de chaque verifyXxx ci-dessous.
function decodeSigned(token: string): Record<string, unknown> | null {
  const [payloadB64, sig, ...rest] = token.split(".");
  if (!payloadB64 || !sig || rest.length > 0) return null;

  const expectedBuf = Buffer.from(sign(payloadB64), "hex");
  const sigBuf = Buffer.from(sig, "hex");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Crée un jeton de session signé : base64(payload).signature
export function createSessionToken(payload: Omit<SessionPayload, "iat">): string {
  const fullPayload: SessionPayload = { ...payload, iat: Math.floor(Date.now() / 1000) };
  return encodeSigned(fullPayload);
}

// Vérifie la signature et l'expiration du jeton ; retourne null si invalide.
// Un jeton d'un autre usage (défi 2FA, qui porte un champ "typ") est refusé :
// sans cette garde, il pourrait être déposé dans le cookie de session.
export function verifySessionToken(token: string): SessionPayload | null {
  const payload = decodeSigned(token);
  if (!payload || "typ" in payload) return null;

  const { sub, email, role, iat, mcp, sid } = payload;
  if (typeof sub !== "string" || typeof email !== "string" || typeof role !== "string") return null;
  if (typeof iat !== "number") return null;
  // Expiration côté serveur (le maxAge du cookie ne suffit pas)
  if (iat + SESSION_MAX_AGE < Math.floor(Date.now() / 1000)) return null;

  return {
    sub,
    email,
    role,
    iat,
    ...(mcp === true ? { mcp: true } : {}),
    ...(typeof sid === "string" ? { sid } : {}),
  };
}

// ---------------------------------------------------------------------------
// Défi à deux facteurs : jeton signé de courte durée, émis uniquement après
// vérification du mot de passe d'un compte dont le 2FA est activé.
// ---------------------------------------------------------------------------

export type TwoFactorChallenge = { userId: string; destination: string };

export function createTwoFactorChallengeToken(challenge: TwoFactorChallenge): string {
  return encodeSigned({
    typ: "2fa",
    sub: challenge.userId,
    dest: challenge.destination,
    exp: Math.floor(Date.now() / 1000) + TWO_FACTOR_MAX_AGE,
  });
}

export function verifyTwoFactorChallengeToken(token: string): TwoFactorChallenge | null {
  const payload = decodeSigned(token);
  if (!payload || payload.typ !== "2fa") return null;
  const { sub, dest, exp } = payload;
  if (typeof sub !== "string" || typeof dest !== "string" || typeof exp !== "number") return null;
  if (exp < Math.floor(Date.now() / 1000)) return null;
  return { userId: sub, destination: dest };
}

// ---------------------------------------------------------------------------
// Résolution d'une session : le jeton signé prouve qui a ouvert la session,
// mais pas que le compte est toujours autorisé aujourd'hui. On relit donc la
// base à chaque requête : compte supprimé ou désactivé, rôle modifié, mot de
// passe changé depuis (sessionsValidAfter) → la session cesse immédiatement
// d'être valable, au lieu de rester ouverte jusqu'à 8 h.
// ---------------------------------------------------------------------------

export type ResolveSessionOptions = {
  // Autorise un compte soumis au changement de mot de passe obligatoire.
  // Réservé à la page/action de changement de mot de passe et à la déconnexion.
  allowPasswordChange?: boolean;
};

// Pourquoi une session cesse d'être valable (affiché à l'utilisateur sur la page
// de connexion) :
//  - replaced : le compte s'est connecté sur un autre appareil (session unique) ;
//  - disabled : compte désactivé ou supprimé ;
//  - revoked  : mot de passe modifié ou réinitialisé depuis ;
//  - password : changement de mot de passe obligatoire en attente ;
//  - expired  : jeton absent, falsifié ou périmé.
export type SessionFailure = "replaced" | "disabled" | "revoked" | "password" | "expired";

export type SessionEvaluation =
  | { ok: true; session: SessionPayload }
  | { ok: false; reason: SessionFailure };

export async function evaluateSession(
  payload: SessionPayload,
  options: ResolveSessionOptions = {},
): Promise<SessionEvaluation> {
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      sessionsValidAfter: true,
      currentSessionId: true,
    },
  });
  if (!user || !user.active) return { ok: false, reason: "disabled" };

  // Session unique : seule la session ouverte en dernier est valable. Un compte
  // sans identifiant enregistré (jamais reconnecté depuis cette fonctionnalité)
  // garde ses sessions existantes jusqu'à sa prochaine connexion.
  if (user.currentSessionId && payload.sid !== user.currentSessionId) {
    return { ok: false, reason: "replaced" };
  }

  if (user.sessionsValidAfter) {
    // Comparaison à la seconde (iat est en secondes) : le jeton réémis juste
    // après un changement de mot de passe doit rester valide.
    const validAfter = Math.floor(user.sessionsValidAfter.getTime() / 1000);
    if (payload.iat < validAfter) return { ok: false, reason: "revoked" };
  }

  if (user.mustChangePassword && !options.allowPasswordChange) {
    return { ok: false, reason: "password" };
  }

  // Email et rôle viennent de la base, pas du jeton : un changement de rôle
  // prend effet tout de suite.
  return {
    ok: true,
    session: {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: payload.iat,
      ...(payload.sid ? { sid: payload.sid } : {}),
    },
  };
}

export async function resolveSession(
  payload: SessionPayload,
  options: ResolveSessionOptions = {},
): Promise<SessionPayload | null> {
  const evaluation = await evaluateSession(payload, options);
  return evaluation.ok ? evaluation.session : null;
}

// Nouvel identifiant de session : à enregistrer dans User.currentSessionId ET à
// placer dans le jeton. 128 bits aléatoires, jamais devinables.
export function newSessionId(): string {
  return crypto.randomBytes(16).toString("base64url");
}

// État de la session du cookie courant, avec le motif en cas d'échec : sert au
// contrôle périodique côté navigateur (/api/session/status).
export async function getSessionStatus(): Promise<SessionEvaluation> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const payload = token ? verifySessionToken(token) : null;
  if (!payload) return { ok: false, reason: "expired" };
  return evaluateSession(payload, { allowPasswordChange: true });
}

// cache() déduplique les appels d'une même requête (page + layout + actions) :
// une seule lecture en base par requête, quel que soit le nombre de getSession().
const resolveSessionCached = cache(
  async (token: string, allowPasswordChange: boolean): Promise<SessionPayload | null> => {
    const payload = verifySessionToken(token);
    if (!payload) return null;
    return resolveSession(payload, { allowPasswordChange });
  },
);

// Lit la session depuis le cookie de la requête en cours (Server Components / Actions)
export async function getSession(
  options: ResolveSessionOptions = {},
): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSessionCached(token, options.allowPasswordChange === true);
}

// Options communes du cookie de session (login, 2FA, changement de mot de passe)
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
