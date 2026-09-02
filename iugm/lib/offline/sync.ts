"use client";

import { offlineDb, type MutationType } from "./db";

// Ajoute une saisie à la file locale ; ne bloque jamais l'agent. La
// synchronisation réelle a lieu plus tard, au retour du réseau (voir
// startOfflineSync ci-dessous), sans action supplémentaire de sa part.
export async function queueMutation(
  type: MutationType,
  payload: Record<string, string>,
): Promise<string> {
  const id = crypto.randomUUID();
  await offlineDb.mutations.add({ id, type, payload, queuedAt: Date.now(), status: "pending" });
  return id;
}

// Nombre de saisies hors ligne pas encore confirmées par le serveur
// (en attente, en cours d'envoi, ou en erreur après une tentative) — affiché
// dans le bandeau global (voir app/ui/offline-sync-status.tsx). "syncing" est
// inclus : un envoi qui n'a pas encore abouti ne doit jamais disparaître du
// compteur, même s'il reste bloqué (voir la récupération dans
// syncPendingMutations ci-dessous).
export async function pendingMutationCount(): Promise<number> {
  return offlineDb.mutations.where("status").anyOf(["pending", "syncing", "error"]).count();
}

type SyncOutcome = { id: string; ok: boolean; error?: string };

// Délai au-delà duquel une tentative d'envoi est considérée bloquée plutôt
// qu'en cours (ex. requête qui ne répond jamais malgré `navigator.onLine`
// à `true` — une connexion instable peut se déclarer "en ligne" avant
// d'être réellement utilisable). Sans ça, un `fetch` qui ne se résout ni ne
// rejette jamais laisserait la mutation bloquée en "syncing" indéfiniment :
// plus reprise par cette boucle (qui ne cherche que "pending"), plus comptée
// nulle part puisque son statut ne correspondrait à aucun des filtres.
const FETCH_TIMEOUT_MS = 20_000;

// Rejoue la file dans l'ordre de saisie (l'ordre compte : le matricule est
// attribué séquentiellement côté serveur à la réception). Une mutation
// refusée pour une vraie raison métier (ex. contrainte d'unicité) reste en
// file avec son message d'erreur, visible par l'agent, plutôt que d'être
// perdue silencieusement ou retentée en boucle sans succès possible.
export async function syncPendingMutations(): Promise<SyncOutcome[]> {
  // Récupération : une mutation restée en "syncing" ne peut venir que d'une
  // tentative interrompue (onglet fermé, app rechargée, requête bloquée en
  // cours) puisque cette fonction ne s'exécute jamais deux fois en parallèle
  // sur la même mutation — elle est donc rejouable sans risque de doublon
  // (l'idempotence est de toute façon garantie côté serveur par SyncedMutation).
  await offlineDb.mutations.where("status").equals("syncing").modify({ status: "pending" });

  const pending = await offlineDb.mutations.where("status").equals("pending").sortBy("queuedAt");
  const results: SyncOutcome[] = [];

  for (const mutation of pending) {
    await offlineDb.mutations.update(mutation.id, { status: "syncing" });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch("/api/sync/mutations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: mutation.id,
            type: mutation.type,
            payload: mutation.payload,
            queuedAt: mutation.queuedAt,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (res.ok) {
        await offlineDb.mutations.delete(mutation.id);
        results.push({ id: mutation.id, ok: true });
      } else {
        await offlineDb.mutations.update(mutation.id, {
          status: "error",
          errorMessage: data.error ?? `Erreur ${res.status}`,
        });
        results.push({ id: mutation.id, ok: false, error: data.error });
      }
    } catch {
      // Réseau reperdu (ou délai dépassé) pendant la synchronisation
      // elle-même : remise en attente (pas "error", ce n'est pas un refus
      // métier) et on arrête là, la prochaine détection de reconnexion
      // relancera la file.
      await offlineDb.mutations.update(mutation.id, { status: "pending" });
      results.push({ id: mutation.id, ok: false, error: "Réseau indisponible." });
      break;
    }
  }
  return results;
}

let listenerAttached = false;

// Filet de secours entre deux vrais événements "online" du navigateur : une
// connexion signalée "en ligne" par l'OS n'est pas toujours réellement
// utilisable tout de suite (Wi-Fi qui finit de s'associer, portail captif...),
// d'où le délai de FETCH_TIMEOUT_MS avant qu'une tentative bloquée soit
// abandonnée puis reprise. Ce sondage périodique est ce qui déclenche cette
// reprise sans attendre un nouvel événement "online" qui peut ne jamais
// arriver (la connexion ne s'est jamais vraiment coupée du point de vue du
// navigateur).
const RETRY_POLL_MS = 30_000;

// À appeler une seule fois (voir app/ui/offline-sync-status.tsx) : synchronise
// dès que le navigateur signale un retour en ligne, une première fois au
// montage si déjà en ligne (ex. redémarrage de l'app avec une file restée
// bloquée depuis la dernière session), et périodiquement en filet de secours.
export function startOfflineSync(onDone?: () => void): void {
  if (listenerAttached || typeof window === "undefined") return;
  listenerAttached = true;

  const run = () => {
    if (!navigator.onLine) return;
    syncPendingMutations().then(() => onDone?.());
  };
  window.addEventListener("online", run);
  run();
  setInterval(run, RETRY_POLL_MS);
}
