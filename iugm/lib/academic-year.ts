import { cookies } from "next/headers";

import { ACADEMIC_YEAR_COOKIE, ALL_YEARS_VALUE, currentAcademicYear } from "./academic-year-shared";

// ---------------------------------------------------------------------------
// Année universitaire "active" pour la consultation : un seul sélecteur dans
// l'en-tête (voir app/ui/academic-year-selector.tsx) pilote les données et
// statistiques affichées sur tout le site (tableau de bord, dossiers,
// écolage, liste étudiants...). Mémorisée dans un cookie, comme la session.
//
// Distinct de defaultEnrollmentYear() (lib/students.ts) : celle-ci choisit
// l'année dans laquelle inscrire un NOUVEL étudiant (toujours l'année en
// cours calendaire), alors que currentAcademicYear() sert de valeur par
// défaut pour CONSULTER des données déjà existantes — un besoin différent,
// qui bascule au 1er septembre plutôt qu'au 1er janvier.
//
// Ce module réexporte les constantes/fonctions pures de academic-year-shared
// (utilisables aussi côté client) et n'ajoute que la lecture du cookie, qui
// dépend de next/headers — donc réservée aux composants serveur.
// ---------------------------------------------------------------------------

export { ACADEMIC_YEAR_COOKIE, ALL_YEARS_VALUE, currentAcademicYear };

// Année sélectionnée par l'agent connecté. `null` = "toutes les années"
// (choix explicite). Si l'agent n'a encore rien choisi, l'année en cours
// sert de valeur par défaut plutôt que "toutes les années confondues" : la
// vue la plus utile au quotidien est l'année en train de se dérouler.
export async function getSelectedAcademicYear(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(ACADEMIC_YEAR_COOKIE)?.value;
  if (!raw) return currentAcademicYear();
  if (raw === ALL_YEARS_VALUE) return null;
  return raw;
}
