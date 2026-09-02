"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { FaCloudUploadAlt, FaWifi } from "react-icons/fa";

import { pendingMutationCount, startOfflineSync } from "@/lib/offline/sync";

const POLL_MS = 5000;

// navigator.onLine est une vraie donnée externe au rendu React (comme un
// store) : le serveur ne peut pas la connaître, donc `useSyncExternalStore`
// est l'outil prévu pour ce cas précis, avec un instantané serveur distinct
// (`getServerSnapshot`) — plutôt qu'un useState corrigé après coup dans un
// effet, qui produirait un vrai flash d'hydratation React (le HTML servi
// suppose toujours "en ligne", donc un client réellement hors ligne dès le
// premier rendu afficherait un DOM différent de celui du serveur : exactement
// l'erreur observée en testant la fonctionnalité — voir git blame).
function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const getOnlineSnapshot = () => navigator.onLine;
const getServerOnlineSnapshot = () => true;

// Bandeau global (monté dans AppShell) : signale l'absence de réseau et le
// nombre d'opérations en attente de synchronisation, sur tout l'espace agent —
// pas seulement la page d'inscription, puisque la file peut rester non vide
// en changeant de page. Invisible dès qu'il n'y a rien à signaler (en ligne,
// file vide).
export function OfflineSyncStatus() {
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(() => {
    pendingMutationCount()
      .then(setPending)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshPending();

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
          : "sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-600 px-4 py-1.5 text-center text-xs font-medium text-white"
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
