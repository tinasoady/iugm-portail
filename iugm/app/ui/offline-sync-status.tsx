"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { FaCloudUploadAlt, FaWifi } from "react-icons/fa";

import {
  getReachableSnapshot,
  startConnectivityMonitor,
  subscribeReachability,
} from "@/lib/offline/connectivity";
import { pendingMutationCount, startOfflineSync } from "@/lib/offline/sync";
import { warmOfflinePages } from "@/lib/offline/warm";

const POLL_MS = 5000;

// navigator.onLine est une vraie donnée externe au rendu React (comme un
// store) : le serveur ne peut pas la connaître, donc `useSyncExternalStore`
// est l'outil prévu pour ce cas précis, avec un instantané serveur distinct
// (`getServerSnapshot`) — plutôt qu'un useState corrigé après coup dans un
// effet, qui produirait un vrai flash d'hydratation React (le HTML servi
// suppose toujours "en ligne", donc un client réellement hors ligne dès le
// premier rendu afficherait un DOM différent de celui du serveur : exactement
// l'erreur observée en testant la fonctionnalité — voir git blame).
//
// « En ligne » ne se limite pas à navigator.onLine, qui reste vrai sur un
// poste avec carte réseau virtuelle (Docker, VPN) même sans Internet : on y
// ajoute la joignabilité réelle du serveur (voir lib/offline/connectivity.ts).
function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  const unsubscribeReachability = subscribeReachability(callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
    unsubscribeReachability();
  };
}
const getOnlineSnapshot = () => navigator.onLine && getReachableSnapshot();
const getServerOnlineSnapshot = () => true;

// Bandeau global (monté dans AppShell) : signale l'absence de réseau et le
// nombre d'opérations en attente de synchronisation, sur tout l'espace agent —
// pas seulement la page d'inscription, puisque la file peut rester non vide
// en changeant de page. Invisible dès qu'il n'y a rien à signaler (en ligne,
// file vide).
export function OfflineSyncStatus({ warmPages = false }: { warmPages?: boolean }) {
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const [pending, setPending] = useState(0);

  // Personnel d'administration : prépare les pages d'inscription et d'écolage
  // pour qu'elles s'ouvrent même si le réseau est coupé avant de les avoir
  // rechargées (voir lib/offline/warm.ts)
  useEffect(() => {
    if (warmPages && online) warmOfflinePages();
  }, [warmPages, online]);

  const refreshPending = useCallback(() => {
    pendingMutationCount()
      .then(setPending)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshPending();
    startConnectivityMonitor();

    // Déclenche/écoute la synchronisation automatique au retour du réseau
    // (voir lib/offline/sync.ts) ; le sondage périodique ci-dessous rafraîchit
    // le compteur pendant qu'elle tourne (pas d'événement dédié pour ça).
    startOfflineSync(refreshPending);
    const interval = setInterval(refreshPending, POLL_MS);

    return () => clearInterval(interval);
  }, [refreshPending]);

  if (online && pending === 0) return null;

  return (
    <div
      className={
        online
          ? "sticky top-0 z-40 flex items-center justify-center gap-2 bg-indigo-600 px-4 py-1.5 text-center text-xs font-medium text-white"
          : "sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-700 px-4 py-1.5 text-center text-xs font-medium text-white"
      }
    >
      {online ? (
        <>
          <FaCloudUploadAlt size={12} />
          Synchronisation de {pending} opération{pending > 1 ? "s" : ""} saisie
          {pending > 1 ? "s" : ""} hors ligne…
        </>
      ) : (
        <>
          <FaWifi size={12} className="opacity-70" />
          Hors ligne — les saisies seront synchronisées automatiquement à la reconnexion
          {pending > 0 && ` (${pending} en attente)`}
        </>
      )}
    </div>
  );
}
