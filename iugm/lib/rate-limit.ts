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
