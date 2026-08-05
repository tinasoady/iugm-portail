import { cookies } from "next/headers";

import { LEVEL_COOKIE, ALL_LEVELS_VALUE, LEVELS } from "./level-shared";

// ---------------------------------------------------------------------------
// Niveau "actif" pour la consultation : un sélecteur dans l'en-tête (voir
// app/ui/level-selector.tsx), à côté du sélecteur d'année universitaire,
// pilote les données et statistiques affichées sur le site. Mémorisé dans un
// cookie, comme l'année universitaire (lib/academic-year.ts).
// ---------------------------------------------------------------------------

export { LEVEL_COOKIE, ALL_LEVELS_VALUE, LEVELS };

// Niveau sélectionné par l'agent connecté. `null` = "tous les niveaux"
// (valeur par défaut tant que rien n'a été choisi, ou choix explicite).
export async function getSelectedLevel(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(LEVEL_COOKIE)?.value;
  if (!raw || raw === ALL_LEVELS_VALUE) return null;
  return LEVELS.includes(raw as (typeof LEVELS)[number]) ? raw : null;
}
