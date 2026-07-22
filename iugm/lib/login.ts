import bcrypt from "bcryptjs";

import { prisma } from "./prisma";
import { createSessionToken } from "./auth";
import { logAction } from "./audit";
import { getClientIp, checkLoginRateLimit, recordLoginAttempt } from "./rate-limit";

export type LoginResult =
  | { ok: true; token: string; destination: string }
  | { ok: false; status: number; error: string };

const HOME_BY_ROLE: Record<string, string> = {
  SUPERADMIN: "/admin",
  AGENT_ADMINISTRATION: "/agent-admin",
  AGENT_PEDAGOGIQUE: "/agent-pedagogique",
  ETUDIANT: "/mon-profil",
};

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
    },
  });

  if (!user) {
    await recordLoginAttempt(email, ip, false);
    await logAction("LOGIN_FAILED", `Email inconnu : ${email}`);
    return { ok: false, status: 401, error: "Email ou mot de passe incorrect." };
  }

  if (!user.active) {
    await recordLoginAttempt(email, ip, false);
    await logAction("LOGIN_FAILED", `Compte désactivé : ${email}`, user.id);
    return { ok: false, status: 403, error: "Compte désactivé. Contactez l'administration." };
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    await recordLoginAttempt(email, ip, false);
    await logAction("LOGIN_FAILED", `Mot de passe erroné pour ${email}`, user.id);
    return { ok: false, status: 401, error: "Email ou mot de passe incorrect." };
  }

  await recordLoginAttempt(email, ip, true);
  const token = createSessionToken({ sub: user.id, email: user.email, role: user.role });
  await logAction("LOGIN_SUCCESS", `Connexion de ${user.email}`, user.id);

  // Mot de passe initial prévisible : changement forcé avant tout accès
  const destination = user.mustChangePassword
    ? "/changer-mot-de-passe"
    : (HOME_BY_ROLE[user.role] ?? "/");
  return { ok: true, token, destination };
}
