import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { checkActionRateLimit } from "@/lib/rate-limit";
import {
  applySyncedMutation,
  type MutationHandler,
  type SyncRequest,
} from "@/lib/sync-mutations";
import { submitInscription } from "@/app/agent-admin/inscription/actions";
import { submitEcolagePayment } from "@/app/agent-admin/actions";

// Rejeu des mutations saisies hors ligne (voir lib/offline/ et
// docs/OFFLINE_SYNC.md) : appelé automatiquement par le navigateur au retour
// du réseau, jamais directement par l'agent. Chaque type a son propre
// gestionnaire, qui délègue à la même fonction métier que la Server Action
// en ligne équivalente (submitInscription, submitEcolagePayment). La logique
// d'idempotence (une mutation = au plus une application) est dans
// lib/sync-mutations.ts.
const MUTATION_HANDLERS: Record<string, MutationHandler> = {
  inscription: async (payload, session) => {
    const r = await submitInscription(payload, session);
    if (r.error) return { error: r.error };
    return { studentId: r.studentId, label: `Inscription (matricule ${r.matricule})` };
  },
  ecolage_payment: async (payload, session) => {
    const r = await submitEcolagePayment(payload, session);
    if (r.error) return { error: r.error };
    return { studentId: r.studentId, label: `Versement d'écolage (reçu ${r.receiptNumber})` };
  },
};

// Plafond volontairement large (contrairement aux exports) : un agent qui
// synchronise après une matinée entière de saisie hors ligne peut avoir des
// dizaines de dossiers en file d'un coup, ce n'est pas un usage anormal.
const MAX_SYNCS_PER_WINDOW = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }

  let body: SyncRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (body === null || typeof body !== "object") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const rateLimit = checkActionRateLimit(`sync-mutation:${session.sub}`, MAX_SYNCS_PER_WINDOW);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: `Trop de synchronisations récentes. Réessayez dans ${rateLimit.retryAfterMinutes} minutes.` },
      { status: 429 },
    );
  }

  const outcome = await applySyncedMutation(body, session, MUTATION_HANDLERS);
  return NextResponse.json(outcome.body, { status: outcome.status });
}
