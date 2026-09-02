"use client";

import Dexie, { type Table } from "dexie";

// Types de mutations pouvant être saisies hors ligne (voir
// docs/OFFLINE_SYNC.md pour étendre à d'autres écrans) : chaque type a son
// propre traitement serveur idempotent dans app/api/sync/mutations/route.ts.
export type MutationType = "inscription" | "ecolage_payment";

export type PendingMutation = {
  id: string; // UUID généré côté client, sert de clé d'idempotence au sync
  type: MutationType;
  payload: Record<string, string>;
  queuedAt: number; // Date.now() au moment de la saisie hors ligne
  status: "pending" | "syncing" | "error";
  errorMessage?: string;
};

// Fiche de présélection mise en cache localement pour que la recherche du
// formulaire d'inscription (search-entry.tsx) reste utilisable hors ligne —
// sinon seul l'envoi final du dossier fonctionnerait hors ligne, pas la
// recherche qui le précède. `values` contient les champs de pré-remplissage
// (même forme que PreselectionPrefill côté serveur), à plat pour être réinjectés
// tels quels dans le formulaire, comme pour une saisie en ligne normale.
export type CachedCandidate = {
  id: string;
  fullName: string;
  academicYear: string;
  category: string;
  cin: string | null;
  baccNumber: string | null;
  formation: string | null;
  level: string | null;
  used: boolean;
  usedMatricule: string | null;
  values: Record<string, string>;
};

// Base IndexedDB locale (Dexie). Persiste tant que l'utilisateur ne vide pas
// les données du site — un dossier saisi hors ligne survit à la fermeture de
// l'onglet/du navigateur en attendant la synchronisation.
class OfflineDatabase extends Dexie {
  mutations!: Table<PendingMutation, string>;
  candidates!: Table<CachedCandidate, string>;

  constructor() {
    super("iugm-offline");
    this.version(1).stores({
      mutations: "id, status, queuedAt",
    });
    // v2 : cache des fiches de présélection pour la recherche hors ligne
    // (voir candidates.ts) — store additionnel, la migration Dexie ne touche
    // pas aux mutations déjà en file.
    this.version(2).stores({
      mutations: "id, status, queuedAt",
      candidates: "id, fullName",
    });
  }
}

export const offlineDb = new OfflineDatabase();
