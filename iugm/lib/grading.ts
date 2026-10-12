// ---------------------------------------------------------------------------
// Calcul de la moyenne d'un semestre à partir des notes par matière, selon
// les paramètres fixés sur chaque matière du catalogue (Admin > Matières) :
//   - note de la matière : note unique, ou combinaison contrôle continu +
//     examen selon la part du CC (ccWeight, en %) — voir combineCcExam ;
//   - matière obligatoire : note × coefficient, coefficient compté au
//     dénominateur ;
//   - matière facultative : bonus uniquement — seuls les points au-delà du
//     seuil (10 par défaut) comptent, multipliés par le coefficient, sans
//     alourdir le dénominateur. Une note sous le seuil ne pénalise jamais ;
//   - note éliminatoire (matière obligatoire, facultatif) : une note
//     strictement inférieure fait échouer le semestre, quelle que soit la
//     moyenne.
//
//   moyenne = (Σ note × coef [obligatoires] + Σ max(0, note − seuil) × coef
//              [facultatives]) / Σ coef [obligatoires], plafonnée à 20.
//
// La moyenne n'est calculée qu'une fois TOUTES les matières obligatoires du
// semestre notées : sinon elle serait faussée par les matières manquantes.
// Module pur (sans base de données), partagé serveur/client.
// ---------------------------------------------------------------------------

export type GradedSubject = {
  name: string;
  mandatory: boolean;
  coefficient: number;
  bonusThreshold: number;
  eliminationThreshold: number | null;
  value: number | null; // note de la matière sur 20, null = pas encore saisie
};

export type SemesterComputation =
  | {
      status: "complete";
      average: number; // arrondie au centième
      bonusPoints: number; // points ajoutés au total par les matières facultatives
      totalCoefficients: number; // Σ coefficients des matières obligatoires
      eliminatedBy: string[]; // matières sous leur note éliminatoire (vide sinon)
    }
  | { status: "incomplete"; missing: string[] } // matières obligatoires sans note
  | { status: "no_mandatory" }; // aucune matière obligatoire : rien à calculer

export const DEFAULT_BONUS_THRESHOLD = 10;

export type MentionValue = "ECHEC" | "PASSABLE" | "ASSEZ_BIEN" | "BIEN" | "TRES_BIEN";

// Barème standard : la mention découle mécaniquement de la moyenne
export function mentionFromAverage(average: number): MentionValue {
  if (average < 10) return "ECHEC";
  if (average < 12) return "PASSABLE";
  if (average < 14) return "ASSEZ_BIEN";
  if (average < 16) return "BIEN";
  return "TRES_BIEN";
}

// Mention d'un semestre : ÉCHEC dès qu'une note éliminatoire est atteinte
export function semesterMention(average: number, eliminated: boolean): MentionValue {
  return eliminated ? "ECHEC" : mentionFromAverage(average);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Note d'une matière à partir du contrôle continu et de l'examen, la part du
// CC étant exprimée en % (ex 40 → CC × 0,4 + examen × 0,6)
export function combineCcExam(cc: number, exam: number, ccWeight: number): number {
  return round2((cc * ccWeight + exam * (100 - ccWeight)) / 100);
}

export function computeSemesterAverage(subjects: GradedSubject[]): SemesterComputation {
  const mandatory = subjects.filter((s) => s.mandatory);
  if (mandatory.length === 0) return { status: "no_mandatory" };

  const missing = mandatory.filter((s) => s.value === null).map((s) => s.name);
  if (missing.length > 0) return { status: "incomplete", missing };

  let points = 0;
  let totalCoefficients = 0;
  const eliminatedBy: string[] = [];
  for (const s of mandatory) {
    points += s.value! * s.coefficient;
    totalCoefficients += s.coefficient;
    if (s.eliminationThreshold !== null && s.value! < s.eliminationThreshold) {
      eliminatedBy.push(s.name);
    }
  }

  let bonusPoints = 0;
  for (const s of subjects) {
    if (s.mandatory || s.value === null) continue;
    bonusPoints += Math.max(0, s.value - s.bonusThreshold) * s.coefficient;
  }

  const average = Math.min(20, (points + bonusPoints) / totalCoefficients);
  return {
    status: "complete",
    average: round2(average),
    bonusPoints: round2(bonusPoints),
    totalCoefficients: round2(totalCoefficients),
    eliminatedBy,
  };
}

// Validation commune des paramètres saisis dans Admin > Matières
export function validateGradingSettings(settings: {
  semester: string | null;
  coefficient: number;
  bonusThreshold: number;
  ccWeight: number;
  eliminationThreshold: number | null;
}): string | null {
  if (settings.semester !== null && !["S1", "S2"].includes(settings.semester)) {
    return "Semestre invalide.";
  }
  if (!Number.isFinite(settings.coefficient) || settings.coefficient <= 0 || settings.coefficient > 100) {
    return "Le coefficient doit être un nombre strictement positif (100 au plus).";
  }
  if (
    !Number.isFinite(settings.bonusThreshold) ||
    settings.bonusThreshold < 0 ||
    settings.bonusThreshold > 20
  ) {
    return "Le seuil du bonus doit être compris entre 0 et 20.";
  }
  if (!Number.isFinite(settings.ccWeight) || settings.ccWeight < 0 || settings.ccWeight > 100) {
    return "La part du contrôle continu doit être comprise entre 0 et 100 %.";
  }
  if (
    settings.eliminationThreshold !== null &&
    (!Number.isFinite(settings.eliminationThreshold) ||
      settings.eliminationThreshold <= 0 ||
      settings.eliminationThreshold > 20)
  ) {
    return "La note éliminatoire doit être comprise entre 0 (exclu) et 20.";
  }
  return null;
}
