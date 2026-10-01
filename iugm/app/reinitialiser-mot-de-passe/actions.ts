"use server";

import { redirect } from "next/navigation";

import { getClientIp, checkActionRateLimit } from "@/lib/rate-limit";
import { resetPasswordWithToken } from "@/lib/password-reset";

export type ResetPasswordState = { error?: string };

// Les jetons font 256 bits : les deviner est hors de portée. Cette limite
// freine surtout un script qui martèlerait l'endpoint.
const MAX_SUBMISSIONS_PER_WINDOW = 10;

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!newPassword || !confirm) return { error: "Tous les champs sont obligatoires." };
  if (newPassword !== confirm) {
    return { error: "La confirmation ne correspond pas au nouveau mot de passe." };
  }

  const ip = await getClientIp();
  const limit = checkActionRateLimit(`pwd-reset-submit:${ip ?? "inconnue"}`, MAX_SUBMISSIONS_PER_WINDOW);
  if (limit.limited) {
    return { error: `Trop de tentatives. Réessayez dans ${limit.retryAfterMinutes} minutes.` };
  }

  const result = await resetPasswordWithToken(token, newPassword);
  if (!result.ok) return { error: result.error };

  redirect("/login?reinitialise=1");
}
