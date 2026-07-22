import type { StudentWithAccountAndResults } from "@/lib/students";
import { MENTION_LABELS } from "@/app/ui/student-status";

// Modes de classement des blocs — partagé entre la liste paginée et la vue imprimable
export const GROUP_OPTIONS: Record<string, string> = {
  annee: "Année universitaire",
  filiere: "Filière",
  niveau: "Niveau",
  "filiere-niveau": "Filière / Niveau",
  domaine: "Domaine",
  mention: "Mention",
};

const UNSET = "Non renseigné(e)";

export function resolveGroup(groupParam?: string): string {
  return GROUP_OPTIONS[groupParam ?? ""] ? (groupParam as string) : "annee";
}

// Regroupe une liste de dossiers en blocs selon le critère choisi. Utilisée
// à la fois par l'affichage paginé (blocs de la page courante) et par la vue
// imprimable (blocs sur l'ensemble filtré) : une seule définition du
// classement pour que les deux vues restent toujours cohérentes.
export function groupStudents(
  students: StudentWithAccountAndResults[],
  group: string,
): Array<[string, StudentWithAccountAndResults[]]> {
  const keyOf = (s: StudentWithAccountAndResults): string => {
    switch (group) {
      case "filiere":
        return s.mention ?? s.program ?? UNSET;
      case "niveau":
        return s.level ?? s.track ?? UNSET;
      case "filiere-niveau":
        return `${s.mention ?? s.program ?? "Filière non renseignée"} / ${s.level ?? s.track ?? "niveau ?"}`;
      case "domaine":
        return s.domain ?? s.department ?? UNSET;
      case "mention":
        return s.results[0] ? (MENTION_LABELS[s.results[0].mention] ?? s.results[0].mention) : "Sans résultat";
      default:
        return s.academicYear ?? UNSET;
    }
  };

  const map = new Map<string, StudentWithAccountAndResults[]>();
  for (const s of students) {
    const key = keyOf(s);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  const keys = [...map.keys()].sort((a, b) => {
    const aLast = a === UNSET || a === "Sans résultat";
    const bLast = b === UNSET || b === "Sans résultat";
    if (aLast !== bLast) return aLast ? 1 : -1;
    return group === "annee" ? b.localeCompare(a) : a.localeCompare(b);
  });
  return keys.map((k) => [k, map.get(k)!]);
}
