import { headers } from "next/headers";

import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Anti-bruteforce sur la connexion : bloque après trop d'échecs récents,
// par email (protège un compte donné) ET par IP (protège contre une même
// source qui essaie beaucoup d'emails différents).
// ---------------------------------------------------------------------------

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

// Adresse IP du client, déduite des en-têtes posés par un proxy/reverse-proxy
// en amont (x-forwarded-for). Renvoie null si absente (ex. accès direct sans
// proxy) : dans ce cas, seule la limite par email s'applique.
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip");
}

export type RateLimitStatus = { limited: boolean; retryAfterMinutes: number };

// À appeler AVANT de vérifier le mot de passe : si limité, on ne doit même
// pas comparer le hash (inutile, et ça laisserait deviner un timing différent).
export async function checkLoginRateLimit(
  email: string,
  ip: string | null,
): Promise<RateLimitStatus> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const emailFailures = await prisma.loginAttempt.count({
    where: { email, success: false, createdAt: { gte: windowStart } },
  });
  if (emailFailures >= MAX_FAILURES_PER_EMAIL) {
    return { limited: true, retryAfterMinutes: WINDOW_MINUTES };
  }

  if (ip) {
    const ipFailures = await prisma.loginAttempt.count({
      where: { ip, success: false, createdAt: { gte: windowStart } },
    });
    if (ipFailures >= MAX_FAILURES_PER_IP) {
      return { limited: true, retryAfterMinutes: WINDOW_MINUTES };
    }
  }

  return { limited: false, retryAfterMinutes: 0 };
}

// Enregistre une tentative (succès ou échec). Sur un succès, purge les échecs
// passés pour cet email : un utilisateur qui vient de se reconnecter
// correctement ne doit pas hériter d'un compteur d'échecs antérieur.
export async function recordLoginAttempt(
  email: string,
  ip: string | null,
  success: boolean,
): Promise<void> {
  await prisma.loginAttempt.create({ data: { email, ip, success } });

  if (success) {
    await prisma.loginAttempt.deleteMany({ where: { email, success: false } });
  } else {
    // Ménage opportuniste : évite d'accumuler indéfiniment de vieilles lignes
    // pour cet email (pas de tâche planifiée dans ce projet pour le faire).
    const staleBefore = new Date(Date.now() - 24 * 60 * 60_000);
    await prisma.loginAttempt.deleteMany({
      where: { email, createdAt: { lt: staleBefore } },
    });
  }
}

// ---------------------------------------------------------------------------
// Limiteur générique en mémoire, pour les routes sensibles déjà authentifiées
// (ex : export complet de la base). Contrairement à l'anti-bruteforce de
// connexion ci-dessus (basé sur LoginAttempt en base, qui doit résister à un
// redémarrage et protéger un point d'entrée public non authentifié), un
// compteur en mémoire suffit ici : la route est déjà protégée par la session,
// l'objectif est seulement de limiter le débit d'un compte compromis ou d'un
// script mal écrit, pas d'empêcher une attaque par force brute. Un
// redémarrage du serveur réinitialise simplement le compteur.
// ---------------------------------------------------------------------------

const ACTION_WINDOW_MS = 5 * 60_000;
const actionAttempts = new Map<string, number[]>();

export type ActionRateLimitStatus = { limited: boolean; retryAfterMinutes: number };

// `key` identifie l'acteur ET l'action (ex: "export-csv:<userId>"), pour que
// la limite d'une action n'affecte pas les autres. Fenêtre glissante de 5 min.
export function checkActionRateLimit(key: string, max: number): ActionRateLimitStatus {
  const now = Date.now();
  const windowStart = now - ACTION_WINDOW_MS;
  const timestamps = (actionAttempts.get(key) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= max) {
    return { limited: true, retryAfterMinutes: Math.ceil(ACTION_WINDOW_MS / 60_000) };
  }
  timestamps.push(now);
  actionAttempts.set(key, timestamps);
  return { limited: false, retryAfterMinutes: 0 };
}
