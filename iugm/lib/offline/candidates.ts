"use client";

import { offlineDb, type CachedCandidate } from "./db";

// Remplace entièrement le cache local par la liste reçue du serveur (voir
// getPreselectionCacheAction, appelée pendant que l'agent est en ligne) —
// pas une fusion incrémentale : plus simple, et la liste reçue est déjà la
// vérité serveur pour les années concernées (voir search-entry.tsx).
export async function refreshCandidateCache(list: CachedCandidate[]): Promise<void> {
  await offlineDb.transaction("rw", offlineDb.candidates, async () => {
    await offlineDb.candidates.clear();
    await offlineDb.candidates.bulkAdd(list);
  });
}

// Recherche locale par nom (contains, insensible à la casse) — même
// comportement que searchPreselectionCandidates côté serveur, en beaucoup
// plus simple puisque le volume tient entièrement en mémoire côté client.
export async function searchCachedCandidates(query: string, limit = 8): Promise<CachedCandidate[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const all = await offlineDb.candidates.toArray();
  return all
    .filter((c) => c.fullName.toLowerCase().includes(q))
    .sort((a, b) => {
      if (a.used !== b.used) return a.used ? 1 : -1;
      return a.fullName.localeCompare(b.fullName);
    })
    .slice(0, limit);
}

export async function getCachedCandidate(id: string): Promise<CachedCandidate | undefined> {
  return offlineDb.candidates.get(id);
}
