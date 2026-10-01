"use client";

import { offlineDb } from "./db";

// Nom du cache de pages du service worker (voir PAGE_CACHE dans public/sw.js)
const PAGE_CACHE = "iugm-pages-v1";

// À appeler à la déconnexion : efface ce que le navigateur garde de lisible
// sur le poste — fiches de présélection mises en cache pour la recherche hors
// ligne (noms, CIN, n° de bacc...) et pages de secours du service worker.
// Sur un poste partagé, la personne suivante ne doit pas en hériter.
//
// Les saisies hors ligne EN ATTENTE de synchronisation ne sont volontairement
// PAS supprimées : ce sont des dossiers saisis et pas encore enregistrés, les
// perdre en se déconnectant serait pire. Elles repartent à la synchronisation
// de la prochaine session valide (voir docs/OFFLINE_SYNC.md).
//
// Ne lève jamais d'exception : une erreur de nettoyage ne doit pas empêcher la
// déconnexion.
export async function clearOfflineCaches(): Promise<void> {
  try {
    await offlineDb.candidates.clear();
  } catch {
    // IndexedDB indisponible (navigation privée, stockage bloqué) : rien à effacer
  }
  try {
    if (typeof caches !== "undefined") await caches.delete(PAGE_CACHE);
  } catch {
    // Cache Storage indisponible : idem
  }
}
