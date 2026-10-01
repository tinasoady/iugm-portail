"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { checkActionRateLimit } from "@/lib/rate-limit";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  regenerateRecoveryCodes,
  disableTwoFactor,
  canUseTwoFactor,
} from "@/lib/two-factor";

// Chaque utilisateur ne gère que SON propre second facteur (identifié par la
// session). Les actions qui affaiblissent ou renouvellent la protection
// (désactiver, régénérer les codes de secours) exigent en plus le mot de
// passe actuel : une session laissée ouverte sur un poste partagé ne suffit pas.

export type TwoFactorState = {
  error?: string;
  success?: string;
  // Configuration en cours : secret à saisir à la main et QR code à scanner
  setup?: { secret: string; qrDataUrl: string };
  // Affichés une seule fois, à l'activation ou à la régénération
  recoveryCodes?: string[];
};

// Limite de tentatives de mot de passe depuis une même session (5 / 5 min)
const MAX_PASSWORD_CHECKS = 5;

async function requireStaffSession() {
  const session = await getSession();
  if (!session) return { error: "Session expirée : reconnectez-vous." } as const;
  if (!canUseTwoFactor(session.role)) {
    return { error: "La double authentification n'est pas disponible pour ce compte." } as const;
  }
  return { session } as const;
}

async function checkCurrentPassword(
  userId: string,
  password: string,
): Promise<string | null> {
  const limit = checkActionRateLimit(`2fa-password:${userId}`, MAX_PASSWORD_CHECKS);
  if (limit.limited) {
    return `Trop de tentatives. Réessayez dans ${limit.retryAfterMinutes} minutes.`;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user || !password || !(await bcrypt.compare(password, user.passwordHash))) {
    return "Mot de passe incorrect.";
  }
  return null;
}

export async function startTwoFactorSetupAction(
  _prev: TwoFactorState,
  _formData: FormData,
): Promise<TwoFactorState> {
  const auth = await requireStaffSession();
  if ("error" in auth) return { error: auth.error };

  try {
    const { secret, otpAuthUri } = await beginTwoFactorSetup(auth.session.sub);
    const qrDataUrl = await QRCode.toDataURL(otpAuthUri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 224,
    });
    return { setup: { secret, qrDataUrl } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Impossible de démarrer la configuration." };
  }
}

export async function confirmTwoFactorSetupAction(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const auth = await requireStaffSession();
  if ("error" in auth) return { error: auth.error };

  const limit = checkActionRateLimit(`2fa-confirm:${auth.session.sub}`, 10);
  if (limit.limited) {
    return { error: `Trop de tentatives. Réessayez dans ${limit.retryAfterMinutes} minutes.` };
  }

  const result = await confirmTwoFactorSetup(auth.session.sub, String(formData.get("code") ?? ""));
  if (!result.ok) return { error: result.error };

  await logAction(
    "TWO_FACTOR_ENABLED",
    `Double authentification activée par ${auth.session.email}`,
    auth.session.sub,
  );
  revalidatePath("/profil");
  return {
    success: "Double authentification activée.",
    recoveryCodes: result.recoveryCodes,
  };
}

export async function regenerateRecoveryCodesAction(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const auth = await requireStaffSession();
  if ("error" in auth) return { error: auth.error };

  const passwordError = await checkCurrentPassword(
    auth.session.sub,
    String(formData.get("password") ?? ""),
  );
  if (passwordError) return { error: passwordError };

  try {
    const recoveryCodes = await regenerateRecoveryCodes(auth.session.sub);
    await logAction(
      "RECOVERY_CODES_REGENERATED",
      `Codes de secours régénérés par ${auth.session.email}`,
      auth.session.sub,
    );
    revalidatePath("/profil");
    return { success: "Nouveaux codes de secours générés. Les anciens ne fonctionnent plus.", recoveryCodes };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Impossible de régénérer les codes." };
  }
}

export async function disableTwoFactorAction(
  _prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  const auth = await requireStaffSession();
  if ("error" in auth) return { error: auth.error };

  const passwordError = await checkCurrentPassword(
    auth.session.sub,
    String(formData.get("password") ?? ""),
  );
  if (passwordError) return { error: passwordError };

  await disableTwoFactor(auth.session.sub);
  await logAction(
    "TWO_FACTOR_DISABLED",
    `Double authentification désactivée par ${auth.session.email}`,
    auth.session.sub,
  );
  revalidatePath("/profil");
  return { success: "Double authentification désactivée." };
}
