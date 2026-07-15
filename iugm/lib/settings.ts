import { prisma } from "./prisma";

// Clés de paramètres reconnues (informations de l'établissement + logo)
export const INSTITUTION_KEYS = [
  "institutionName",
  "institutionAcronym",
  "address",
  "city",
  "phone",
  "email",
  "website",
  "slogan",
] as const;

export type InstitutionKey = (typeof INSTITUTION_KEYS)[number];

// Valeurs par défaut tant que le superadmin n'a rien configuré
export const SETTING_DEFAULTS: Record<string, string> = {
  institutionName: "Institut Universitaire de Gestion et de Management",
  institutionAcronym: "IUGM",
  city: "Mahajanga",
};

// Retourne tous les paramètres, complétés par les valeurs par défaut
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const settings: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (row.value) settings[row.key] = row.value;
  }
  return settings;
}

// Enregistre (upsert) un lot de paramètres ; une valeur vide supprime la clé
export async function saveSettings(entries: Record<string, string>) {
  for (const [key, value] of Object.entries(entries)) {
    if (value) {
      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    } else {
      await prisma.setting.deleteMany({ where: { key } });
    }
  }
}
