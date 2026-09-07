// Filières proposées à l'inscription en L1, L2 et L3 (mentions de licence).
export const FORMATIONS_LICENCE = [
  { code: "MGT", label: "Management" },
  { code: "FC", label: "Finance-Comptabilité" },
  { code: "CI", label: "Commerce International" },
  { code: "PGI", label: "Progiciel de Gestion Intégrée (Informatique de gestion)" },
  { code: "ECO", label: "Économie générale" },
  { code: "GRH", label: "Gestion des Ressources Humaines" },
  { code: "MC", label: "Marketing et Communication" },
];

// Filières (spécialisations) proposées en M1 et M2 — distinctes des mentions
// de licence ci-dessus : un étudiant de master choisit sa spécialisation, pas
// l'ancienne mention de L1-L3 (même quand le nom se recoupe, ex. "Commerce
// International" ou "Marketing et Communication", reconduits comme
// spécialisations à part entière).
export const FORMATIONS_MASTER = [
  { code: "CCA", label: "Comptabilité, Contrôle et Audit" },
  { code: "FE", label: "Finance d'Entreprise" },
  { code: "RH", label: "Ressources Humaines" },
  { code: "MC", label: "Marketing et Communication" },
  { code: "CI", label: "Commerce International" },
  { code: "EDDT", label: "Économie de Développement Durable et Territorial" },
  { code: "MBA", label: "Master of Business Administration" },
  { code: "BMA", label: "Banque, Microfinance, Assurance" },
  { code: "EIFM", label: "Économie Internationale, Finance et Modélisation" },
  { code: "EE", label: "Expertise Économique" },
];

// Liste complète (licence + master réunis) : pour les usages qui ne dépendent
// pas du niveau — assignation d'une formation à un secrétaire/agent (page
// Permissions), ciblage libre des communiqués, recherche/filtre des dossiers.
export const FORMATIONS = [...FORMATIONS_LICENCE, ...FORMATIONS_MASTER];

// Filières disponibles pour un niveau donné : mentions de licence en
// L1/L2/L3, spécialisations de master en M1/M2. Niveau inconnu ou vide =
// liste complète (l'appelant n'a pas encore choisi de niveau, ex. import en
// lot dont le nom de feuille ne précise pas le niveau).
export function formationsForLevel(level: string | null | undefined) {
  if (level === "M1" || level === "M2") return FORMATIONS_MASTER;
  if (level === "L1" || level === "L2" || level === "L3") return FORMATIONS_LICENCE;
  return FORMATIONS;
}
