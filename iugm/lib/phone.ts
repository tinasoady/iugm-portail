// Numéros de téléphone mobile malgaches : 10 chiffres, commençant par l'un
// des préfixes opérateurs courants (032 Orange, 033 Airtel, 034/038 Telma,
// 037 Orange/Airtel selon la zone).
const MALAGASY_PHONE_PREFIXES = ["32", "33", "34", "37", "38"] as const;

// Source de la regex (sans ancres ^/$) : réutilisée telle quelle comme
// attribut HTML `pattern` (voir wizard.tsx / edit-form.tsx) et, ancrée, pour
// la validation serveur ci-dessous — une seule définition de la règle.
export const MALAGASY_PHONE_PATTERN_SOURCE = `0(${MALAGASY_PHONE_PREFIXES.join("|")})[0-9]{7}`;

const MALAGASY_PHONE_RE = new RegExp(`^${MALAGASY_PHONE_PATTERN_SOURCE}$`);

// Retire espaces, points et tirets avant validation/stockage : à la saisie,
// un agent tape souvent "032 12 345 67" plutôt que "0321234567" — on ne
// conserve qu'un format unique en base.
export function normalizePhone(value: string): string {
  return value.replace(/[\s.-]/g, "");
}

export function isValidMalagasyPhone(value: string): boolean {
  return MALAGASY_PHONE_RE.test(normalizePhone(value));
}
