// Libellés et couleurs des statuts du workflow d'inscription
export const STATUS_LABELS: Record<string, string> = {
  ENREGISTRE: "Enregistré",
  PAIEMENT_VERIFIE: "Paiement vérifié",
  ADMIN_VALIDEE: "Inscr. administrative validée",
  INSCRIT: "Inscrit",
};

export const MENTION_LABELS: Record<string, string> = {
  ECHEC: "Échec",
  PASSABLE: "Passable",
  ASSEZ_BIEN: "Assez bien",
  BIEN: "Bien",
  TRES_BIEN: "Très bien",
};

export const MENTION_BADGE_CLASSES: Record<string, string> = {
  ECHEC:
    "rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300",
  PASSABLE:
    "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  ASSEZ_BIEN:
    "rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  BIEN:
    "rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  TRES_BIEN:
    "rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300",
};

export const STATUS_BADGE_CLASSES: Record<string, string> = {
  ENREGISTRE:
    "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  PAIEMENT_VERIFIE:
    "rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  ADMIN_VALIDEE:
    "rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  INSCRIT:
    "rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300",
};
