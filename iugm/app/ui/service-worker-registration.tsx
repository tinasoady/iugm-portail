"use client";

import { useEffect } from "react";

// Enregistre le service worker (public/sw.js) une seule fois au montage.
// Composant séparé (plutôt qu'un script inline dans layout.tsx) car
// l'enregistrement doit passer par l'API navigator, indisponible côté
// serveur — voir docs/OFFLINE_SYNC.md pour la portée exacte du cache.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Pas bloquant pour l'app : sans service worker, le comportement
      // retombe simplement sur l'ancien (pas de démarrage à froid hors ligne).
    });
  }, []);

  return null;
}
