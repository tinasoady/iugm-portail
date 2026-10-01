"use server";

import { after } from "next/server";

import { getClientIp, checkActionRateLimit } from "@/lib/rate-limit";
import { isMailConfigured } from "@/lib/mailer";
import { requestPasswordReset } from "@/lib/password-reset";
import { getTrustedAppOrigin } from "@/lib/url";

export type ForgotPasswordState = { error?: string; success?: string };

// Même réponse que le compte existe ou non : on ne révèle jamais quels
// identifiants sont enregistrés.
const GENERIC_SUCCESS =
  "Si un compte correspond à cet identifiant et possède une adresse e-mail, un lien de réinitialisation vient d'être envoyé. Pensez à vérifier vos courriers indésirables.";

const MAX_REQUESTS_PER_WINDOW = 5;

export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const identifier = String(formData.get("email") ?? "").trim();
  if (!identifier) return { error: "Saisissez votre identifiant de connexion." };
  if (identifier.length > 254) return { error: "Identifiant invalide." };

  // Propriété globale (non liée au compte) : l'annoncer ne révèle rien
  if (!isMailConfigured()) {
    return {
      error:
        "La réinitialisation par e-mail n'est pas activée sur ce portail. Contactez l'administration pour obtenir un nouveau mot de passe.",
    };
  }

  const ip = await getClientIp();
  const limit = checkActionRateLimit(`pwd-reset:${ip ?? "inconnue"}`, MAX_REQUESTS_PER_WINDOW);
  if (limit.limited) {
    return { error: `Trop de demandes. Réessayez dans ${limit.retryAfterMinutes} minutes.` };
  }

  // Le traitement (recherche du compte, écriture, envoi SMTP) se fait APRÈS la
  // réponse : sa durée ne doit pas trahir l'existence du compte.
  const origin = await getTrustedAppOrigin();
  after(async () => {
    try {
      await requestPasswordReset(identifier, origin);
    } catch (e) {
      console.error("Échec de la demande de réinitialisation :", e);
    }
  });

  return { success: GENERIC_SUCCESS };
}
