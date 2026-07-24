// Constantes/logique pures (aucune dépendance à next/headers), pour rester
// importables depuis un composant client (app/ui/academic-year-selector.tsx)
// sans faire fuiter next/headers dans le bundle navigateur. Voir
// lib/academic-year.ts pour la partie serveur (lecture du cookie).

export const ACADEMIC_YEAR_COOKIE = "iugm_academic_year";

// Valeur de cookie signifiant "toutes les années confondues" (choix explicite,
// distinct de "jamais choisi" qui retombe sur currentAcademicYear()).
export const ALL_YEARS_VALUE = "ALL";

// Année universitaire en cours, pour bascule au 1er septembre (avant cette
// date, on est encore dans l'année qui se termine).
export function currentAcademicYear(): string {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}
