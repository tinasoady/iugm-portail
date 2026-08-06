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

// Niveau suivant légal dans la progression stricte (pas de saut) : L1->L2->
// L3->M1->M2. `null` = niveau inconnu OU déjà M2 (dernière année, pas de
// niveau suivant) — à traiter explicitement chez chaque appelant, sans repli
// implicite sur le niveau courant (voir reenrollStudent dans lib/students.ts
// et le formulaire de réinscription, qui restreignent le choix à ce niveau
// suivant ou au redoublement du niveau actuel).
export function nextLevel(current: string | null | undefined): Level | null {
  const i = LEVELS.indexOf((current ?? "") as Level);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
}
