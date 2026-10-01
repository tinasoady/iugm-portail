// Pagination « Voir plus » des listes longues : l'URL porte le nombre de lignes
// à afficher (?limit=40), par pas de LIST_PAGE_SIZE. Pas de numéro de page : la
// liste s'allonge sans perdre la position de lecture.

export const LIST_PAGE_SIZE = 20;
export const LIST_MAX_LIMIT = 1000;

// Lit le paramètre d'URL et le ramène à un multiple de `pageSize` compris
// entre `pageSize` et `max` (valeur absente, négative ou absurde = une page).
export function parseListLimit(
  raw: string | string[] | undefined,
  pageSize = LIST_PAGE_SIZE,
  max = LIST_MAX_LIMIT,
): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  const requested = Number.isFinite(value) && value > 0 ? value : pageSize;
  return Math.min(max, Math.max(pageSize, Math.ceil(requested / pageSize) * pageSize));
}

// Adresse de la page « une tranche de plus » : conserve les autres paramètres
// (recherche, filtres) et remplace seulement celui de la limite `key`.
export function moreHref(
  path: string,
  params: Record<string, string | undefined>,
  key: string,
  currentLimit: number,
  pageSize = LIST_PAGE_SIZE,
): string {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k !== key && v) query.set(k, v);
  }
  query.set(key, String(currentLimit + pageSize));
  return `${path}?${query.toString()}`;
}

// Faut-il encore proposer « Voir plus » ?
export function hasMore(shown: number, total: number, limit: number, max = LIST_MAX_LIMIT): boolean {
  return shown < total && limit < max;
}
