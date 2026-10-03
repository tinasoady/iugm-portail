import { NextResponse } from "next/server";

import { getSessionStatus } from "@/lib/auth";

// Toujours calculée à la demande : une réponse mise en cache masquerait la
// fermeture d'une session.
export const dynamic = "force-dynamic";

// Interrogée périodiquement par le navigateur (app/ui/session-watcher.tsx) pour
// qu'une session fermée depuis ailleurs (connexion sur un autre appareil, compte
// désactivé, mot de passe changé) le soit aussi à l'écran, avec le motif, sans
// attendre la prochaine navigation.
//
// Publique (voir proxy.ts) afin de répondre 401 + motif plutôt que de rediriger
// vers la page de connexion. Elle ne révèle rien : sans cookie valide, elle dit
// seulement « pas de session » ; avec le cookie de la personne, ce qui la
// concerne déjà.
export async function GET() {
  const status = await getSessionStatus();
  return NextResponse.json(status.ok ? { ok: true } : { ok: false, reason: status.reason }, {
    status: status.ok ? 200 : 401,
    headers: { "Cache-Control": "no-store" },
  });
}
