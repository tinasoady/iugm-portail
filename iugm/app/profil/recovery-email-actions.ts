"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { getTrustedAppOrigin } from "@/lib/url";
import {
  maskEmail,
  removeRecoveryEmail,
  requestRecoveryEmail,
} from "@/lib/recovery-email";

export type RecoveryEmailState = { success?: string; error?: string; hint?: string };

// Chaque personne ne gère que l'adresse de SON compte (celui de la session).
// Les deux actions exigent le mot de passe actuel, avec une limite d'essais :
// une session volée ne doit pas servir à deviner le mot de passe ici.
const MAX_ATTEMPTS = 5;

async function guard() {
  const session = await getSession();
  if (!session) return { error: "Session expirée : reconnectez-vous." } as const;
  const limit = checkActionRateLimit(`recovery-email:${session.sub}`, MAX_ATTEMPTS);
  if (limit.limited) {
    return { error: `Trop d'essais. Réessayez dans ${limit.retryAfterMinutes} minutes.` } as const;
  }
  return { session } as const;
}

export async function requestRecoveryEmailAction(
  _prev: RecoveryEmailState,
  formData: FormData,
): Promise<RecoveryEmailState> {
  const checked = await guard();
  if ("error" in checked) return { error: checked.error };

  const result = await requestRecoveryEmail({
    userId: checked.session.sub,
    newEmail: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    origin: await getTrustedAppOrigin().catch(() => null),
  });
  if (!result.ok) return { error: result.error, hint: result.hint };

  revalidatePath("/profil");
  return {
    success: `Un message de confirmation vient d'être envoyé à ${maskEmail(result.sentTo)}. L'adresse ne sera active qu'après avoir ouvert le lien qu'il contient (valable 24 h) — pensez aux courriers indésirables.`,
  };
}

export async function removeRecoveryEmailAction(
  _prev: RecoveryEmailState,
  formData: FormData,
): Promise<RecoveryEmailState> {
  const checked = await guard();
  if ("error" in checked) return { error: checked.error };

  const result = await removeRecoveryEmail(checked.session.sub, String(formData.get("password") ?? ""));
  if (!result.ok) return { error: result.error };

  revalidatePath("/profil");
  return { success: "Adresse de récupération retirée." };
}
