"use server";

import { redirect } from "next/navigation";

import { getClientIp, checkActionRateLimit } from "@/lib/rate-limit";
import { activateAccount } from "@/lib/invitations";

export type ActivateState = { error?: string };

// Les jetons font 256 bits : les deviner est hors de portée. La limite freine
// surtout un script qui martèlerait l'endpoint.
const MAX_SUBMISSIONS_PER_WINDOW = 10;

export async function activateAccountAction(
  _prev: ActivateState,
  formData: FormData,
): Promise<ActivateState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || !confirm) return { error: "Tous les champs sont obligatoires." };
  if (password !== confirm) return { error: "La confirmation ne correspond pas au mot de passe." };

  const ip = await getClientIp();
  const limit = checkActionRateLimit(`activate:${ip ?? "inconnue"}`, MAX_SUBMISSIONS_PER_WINDOW);
  if (limit.limited) {
    return { error: `Trop de tentatives. Réessayez dans ${limit.retryAfterMinutes} minutes.` };
  }

  const result = await activateAccount(token, password);
  if (!result.ok) return { error: result.error };

  redirect("/login?active=1");
}
