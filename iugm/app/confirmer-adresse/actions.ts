"use server";

import { getClientIp, checkActionRateLimit } from "@/lib/rate-limit";
import { confirmRecoveryEmail } from "@/lib/recovery-email";

export type ConfirmState = { success?: string; error?: string };

// Les jetons font 256 bits : les deviner est hors de portée. La limite freine
// surtout un script qui martèlerait l'endpoint.
const MAX_SUBMISSIONS_PER_WINDOW = 10;

// La confirmation est une ACTION (bouton), jamais un simple chargement de page :
// les antivirus et prévisualiseurs de messagerie ouvrent les liens des e-mails
// automatiquement, ce qui confirmerait l'adresse à l'insu de la personne.
export async function confirmRecoveryEmailAction(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const ip = await getClientIp();
  const limit = checkActionRateLimit(`confirm-recovery:${ip ?? "inconnue"}`, MAX_SUBMISSIONS_PER_WINDOW);
  if (limit.limited) {
    return { error: `Trop de tentatives. Réessayez dans ${limit.retryAfterMinutes} minutes.` };
  }

  const result = await confirmRecoveryEmail(String(formData.get("token") ?? ""));
  if (!result.ok) return { error: result.error };
  return {
    success: `L'adresse ${result.maskedEmail} est maintenant votre adresse de récupération : le lien « mot de passe oublié » y sera envoyé.`,
  };
}
