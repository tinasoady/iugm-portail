"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { getTrustedAppOrigin } from "@/lib/url";
import { inviteStaffMember } from "@/lib/invitations";
import { maskEmail } from "@/lib/recovery-email";

export type InviteUserState = {
  success?: string;
  error?: string;
  hint?: string;
};

// Quelques invitations par tranche de 5 min : assez pour une rentrée, pas pour
// servir de machine à envoyer du courrier.
const MAX_INVITATIONS_PER_WINDOW = 15;

// Création d'un compte du PERSONNEL (agent ou superadmin) par invitation : le
// superadmin ne choisit aucun mot de passe. Voir lib/invitations.ts.
export async function inviteUserAction(
  _prevState: InviteUserState,
  formData: FormData,
): Promise<InviteUserState> {
  // Toute Server Action est appelable par requête POST directe :
  // on revérifie systématiquement l'authentification et le rôle.
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") {
    return { error: "Accès refusé : réservé au Superadmin." };
  }

  const limit = checkActionRateLimit(`invite:${session.sub}`, MAX_INVITATIONS_PER_WINDOW);
  if (limit.limited) {
    return { error: `Trop d'invitations récentes. Réessayez dans ${limit.retryAfterMinutes} minutes.` };
  }

  const result = await inviteStaffMember({
    actorId: session.sub,
    username: String(formData.get("username") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    origin: await getTrustedAppOrigin().catch(() => null),
  });
  if (!result.ok) return { error: result.error, hint: result.hint };

  revalidatePath("/admin");
  revalidatePath("/admin/permissions");
  return {
    success: `Invitation envoyée à ${maskEmail(result.sentTo)}. Le compte sera utilisable dès que la personne aura ouvert le lien (valable 72 h) et choisi son mot de passe.`,
  };
}
