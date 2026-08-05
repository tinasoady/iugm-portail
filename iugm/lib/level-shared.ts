// Constantes/logique pures (aucune dépendance à next/headers), pour rester
// importables depuis un composant client (app/ui/level-selector.tsx) sans
// faire fuiter next/headers dans le bundle navigateur. Voir lib/level.ts
// pour la partie serveur (lecture du cookie). Miroir de
// lib/academic-year-shared.ts pour le sélecteur global de niveau.

export const LEVEL_COOKIE = "iugm_level";

// Valeur de cookie signifiant "tous les niveaux confondus"
export const ALL_LEVELS_VALUE = "ALL";

// Niveaux d'étude, du L1 au M2 (même liste que les formulaires d'inscription
// et de réinscription).
export const LEVELS = ["L1", "L2", "L3", "M1", "M2"] as const;

export type Level = (typeof LEVELS)[number];
