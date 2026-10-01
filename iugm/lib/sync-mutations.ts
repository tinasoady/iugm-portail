import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { logAction } from "./audit";

// Résultat commun à tous les gestionnaires de mutation : `label` est la
// description humaine tracée dans le journal d'audit et renvoyée au client,
// propre à chaque type (matricule pour une inscription, n° de reçu pour un
// versement...) — pas de champ générique qui masquerait ce qui a vraiment
// été synchronisé.
export type MutationResult = { error?: string; studentId?: string; label?: string };

export type MutationHandler = (
  payload: Record<string, string>,
  session: { sub: string; role: string },
) => Promise<MutationResult>;

export type SyncRequest = {
  id?: string;
  type?: string;
  payload?: Record<string, string>;
  queuedAt?: number;
};

export type SyncOutcome = { status: number; body: Record<string, unknown> };

// Applique une mutation saisie hors ligne, au plus UNE fois par identifiant.
//
// Le `id` est un UUID généré côté client à la mise en file. Un rejeu réseau
// (l'agent perd la connexion juste après avoir reçu la réponse, ou relance la
// synchronisation) ne doit jamais appliquer deux fois la même mutation — voir
// le commentaire sur SyncedMutation dans prisma/schema.prisma.
//
// On "réserve" l'identifiant AVANT d'appliquer la mutation (et non après,
// comme une simple lecture suivie d'une écriture) : deux requêtes simultanées
// avec le même id passeraient toutes deux le contrôle "déjà appliqué ?" et
// créeraient deux dossiers. La contrainte d'unicité tranche : une seule
// réservation aboutit, l'autre est refusée sans rien appliquer.
export async function applySyncedMutation(
  request: SyncRequest,
  session: { sub: string; role: string },
  handlers: Record<string, MutationHandler>,
): Promise<SyncOutcome> {
  const { id, type, payload } = request;
  if (!id || !type || !payload || !request.queuedAt) {
    return { status: 400, body: { error: "Requête invalide." } };
  }

  // Object.hasOwn : un type "constructor" ou "__proto__" ne doit pas retomber
  // sur un membre hérité d'Object.prototype
  if (!Object.hasOwn(handlers, type)) {
    return { status: 400, body: { error: `Type de mutation inconnu : ${type}.` } };
  }
  const handler = handlers[type];

  const queuedAt = new Date(request.queuedAt);
  if (Number.isNaN(queuedAt.getTime())) {
    return { status: 400, body: { error: "Requête invalide." } };
  }

  try {
    await prisma.syncedMutation.create({ data: { id, type, queuedAt } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { status: 200, body: { ok: true, alreadyApplied: true } };
    }
    throw e;
  }

  const release = () => prisma.syncedMutation.delete({ where: { id } }).catch(() => {});

  let result: MutationResult;
  try {
    result = await handler(payload, session);
  } catch (e) {
    // Échec inattendu : on libère la réservation pour que l'agent puisse relancer
    await release();
    throw e;
  }
  if (result.error) {
    // Refus métier (doublon, permission...) : rien n'a été appliqué, on libère
    // la réservation pour permettre une correction puis un nouveau rejeu.
    await release();
    return { status: 422, body: { error: result.error } };
  }

  if (result.studentId) {
    await prisma.syncedMutation.update({ where: { id }, data: { studentId: result.studentId } });
  }
  await logAction(
    "OFFLINE_MUTATION_SYNCED",
    `${result.label} — synchronisé après saisie hors ligne (en attente depuis ${queuedAt.toLocaleString("fr-FR")})`,
    session.sub,
  );

  return { status: 200, body: { ok: true, label: result.label } };
}
