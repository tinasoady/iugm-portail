import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAction } from "@/lib/audit";
import { checkActionRateLimit } from "@/lib/rate-limit";
import { submitInscription } from "@/app/agent-admin/inscription/actions";
import { submitEcolagePayment } from "@/app/agent-admin/actions";

// Résultat commun à tous les gestionnaires de mutation : `label` est la
// description humaine tracée dans le journal d'audit et renvoyée au client,
// propre à chaque type (matricule pour une inscription, n° de reçu pour un
// versement...) — pas de champ générique qui masquerait ce qui a vraiment
// été synchronisé.
type MutationResult = { error?: string; studentId?: string; label?: string };

// Rejeu des mutations saisies hors ligne (voir lib/offline/ et
// docs/OFFLINE_SYNC.md) : appelé automatiquement par le navigateur au retour
// du réseau, jamais directement par l'agent. Chaque type a son propre
// gestionnaire, qui délègue à la même fonction métier que la Server Action
// en ligne équivalente (submitInscription, submitEcolagePayment).
const MUTATION_HANDLERS: Record<
  string,
  (payload: Record<string, string>, session: { sub: string; role: string }) => Promise<MutationResult>
> = {
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

  let body: { id?: string; type?: string; payload?: Record<string, string>; queuedAt?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!body.id || !body.type || !body.payload || !body.queuedAt) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const rateLimit = checkActionRateLimit(`sync-mutation:${session.sub}`, MAX_SYNCS_PER_WINDOW);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: `Trop de synchronisations récentes. Réessayez dans ${rateLimit.retryAfterMinutes} minutes.` },
      { status: 429 },
    );
  }

  // Idempotence : le `id` est un UUID généré côté client à la mise en file.
  // Un rejeu réseau (l'agent perd la connexion juste après avoir reçu la
  // réponse, ou relance la synchronisation) ne doit jamais appliquer deux
  // fois la même mutation — voir le commentaire sur SyncedMutation dans
  // prisma/schema.prisma.
  const already = await prisma.syncedMutation.findUnique({ where: { id: body.id } });
  if (already) {
    return NextResponse.json({ ok: true, alreadyApplied: true });
  }

  const handler = MUTATION_HANDLERS[body.type];
  if (!handler) {
    return NextResponse.json({ error: `Type de mutation inconnu : ${body.type}.` }, { status: 400 });
  }

  const result = await handler(body.payload, session);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  await prisma.syncedMutation.create({
    data: {
      id: body.id,
      type: body.type,
      studentId: result.studentId ?? null,
      queuedAt: new Date(body.queuedAt),
    },
  });
  await logAction(
    "OFFLINE_MUTATION_SYNCED",
    `${result.label} — synchronisé après saisie hors ligne (en attente depuis ${new Date(body.queuedAt).toLocaleString("fr-FR")})`,
    session.sub,
  );

  return NextResponse.json({ ok: true, label: result.label });
}
