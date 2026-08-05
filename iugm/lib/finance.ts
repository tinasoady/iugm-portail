import { prisma } from "./prisma";
import { LEVELS } from "./level-shared";

// Valeurs par défaut tant que le superadmin n'a rien configuré pour un
// niveau donné (même logique que lib/settings.ts : les défauts vivent dans
// le code, la base ne stocke que ce qui a été explicitement enregistré).
export const FINANCIAL_INFO_DEFAULTS = {
  inscriptionLocal: 50000,
  inscriptionForeign: 80000,
  insurance: 10000,
  polo: 30000,
  tuitionLocal: 700000,
  tuitionForeign: 1000000,
  firstPaymentLocal: 200000,
  firstPaymentForeign: 500000,
} as const;

export type FinancialInfoFields = { -readonly [K in keyof typeof FINANCIAL_INFO_DEFAULTS]: number };

export type LevelFinancialInfoView = FinancialInfoFields & { level: string };

// Valeur du champ Student.nationality désignant un étudiant étranger (voir
// RegisterStudentInput.nationality) — toute autre valeur (dont null/absent)
// compte comme "local".
export const FOREIGN_NATIONALITY = "Étranger";

function toView(level: string, row: FinancialInfoFields | null): LevelFinancialInfoView {
  return row ? { level, ...row } : { level, ...FINANCIAL_INFO_DEFAULTS };
}

// Renseignements financiers des 5 niveaux (L1 à M2), complétés par les
// valeurs par défaut pour les niveaux jamais configurés.
export async function getLevelFinancialInfos(): Promise<LevelFinancialInfoView[]> {
  const rows = await prisma.levelFinancialInfo.findMany();
  const byLevel = new Map(rows.map((r) => [r.level, r]));
  return LEVELS.map((level) => toView(level, byLevel.get(level) ?? null));
}

// Renseignements financiers d'UN niveau (voir getLevelFinancialInfos pour la
// liste complète) — utilisé pour calculer le montant dû par un dossier
// donné (lib/students.ts).
export async function getLevelFinancialInfoOne(level: string): Promise<LevelFinancialInfoView> {
  const row = await prisma.levelFinancialInfo.findUnique({ where: { level } });
  return toView(level, row);
}

// Frais généraux + premier versement, seuil minimum à atteindre pour que le
// paiement à l'inscription débloque le dossier (voir verifyRegistrationPayment
// dans lib/students.ts). "Frais généraux" = droit d'inscription + assurance +
// polo (le polo n'est en principe dû que par un nouvel étudiant, mais reste
// inclus ici : c'est le montant attendu à l'inscription d'un nouveau dossier).
export function registrationMinimum(info: FinancialInfoFields, foreign: boolean): number {
  return (
    (foreign ? info.inscriptionForeign : info.inscriptionLocal) +
    info.insurance +
    info.polo +
    (foreign ? info.firstPaymentForeign : info.firstPaymentLocal)
  );
}

// Frais de formation annuel (écolage) du niveau, base du calcul des tranches
// et du solde restant dû (Gestion d'écolage).
export function annualTuition(info: FinancialInfoFields, foreign: boolean): number {
  return foreign ? info.tuitionForeign : info.tuitionLocal;
}
