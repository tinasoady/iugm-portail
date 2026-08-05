"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { saveSettings, getSettings, INSTITUTION_KEYS } from "@/lib/settings";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";
import { FINANCIAL_INFO_DEFAULTS, type FinancialInfoFields } from "@/lib/finance";
import { LEVELS } from "@/lib/level-shared";

export type SettingsState = { success?: string; error?: string };

// Identité de l'établissement, logo : réservés au superadmin
async function requireSuperadmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") return null;
  return session;
}

// Les paramètres apparaissent sur toutes les pages (sidebar, login, reçu)
function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function saveInstitutionAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const entries: Record<string, string> = {};
  for (const key of INSTITUTION_KEYS) {
    entries[key] = String(formData.get(key) ?? "").trim();
  }
  if (!entries.institutionName || !entries.institutionAcronym) {
    return { error: "Le nom et le sigle de l'établissement sont obligatoires." };
  }

  await saveSettings(entries);
  await logAction("SETTINGS_UPDATED", "Informations de l'établissement mises à jour", session.sub);
  revalidateAll();
  return { success: "Informations de l'établissement enregistrées." };
}

const LOGO_MAX_BYTES = 1024 * 1024; // 1 Mo
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function uploadLogoAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisissez un fichier image." };
  }
  if (!LOGO_TYPES.includes(file.type)) {
    return { error: "Format non supporté (PNG, JPEG, WebP ou SVG uniquement)." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { error: "Image trop lourde (1 Mo maximum)." };
  }

  const previousLogo = (await getSettings()).logo;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { url } = await saveUploadedFile(buffer, file.type, "settings");
  await saveSettings({ logo: url });
  await deleteUploadedFile(previousLogo); // évite d'accumuler les anciens logos remplacés
  await logAction("SETTINGS_UPDATED", "Logo de l'établissement mis à jour", session.sub);
  revalidateAll();
  return { success: "Logo enregistré." };
}

export async function removeLogoAction(): Promise<SettingsState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const previousLogo = (await getSettings()).logo;
  await saveSettings({ logo: "" });
  await deleteUploadedFile(previousLogo);
  await logAction("SETTINGS_UPDATED", "Logo de l'établissement supprimé", session.sub);
  revalidateAll();
  return { success: "Logo supprimé (retour au logo par défaut)." };
}

// ---------------------------------------------------------------------------
// Renseignements financiers par niveau
// ---------------------------------------------------------------------------

function parseAmount(formData: FormData, key = "amount"): number | null {
  const amount = Number(String(formData.get(key) ?? "").replace(/\s/g, ""));
  if (!Number.isInteger(amount) || amount < 0) return null;
  return amount;
}

const FINANCIAL_INFO_FIELDS = Object.keys(FINANCIAL_INFO_DEFAULTS) as Array<
  keyof FinancialInfoFields
>;

export async function updateLevelFinancialInfoAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const level = String(formData.get("level") ?? "");
  if (!LEVELS.includes(level as (typeof LEVELS)[number])) {
    return { error: "Niveau invalide." };
  }

  const data: Partial<FinancialInfoFields> = {};
  for (const field of FINANCIAL_INFO_FIELDS) {
    const amount = parseAmount(formData, field);
    if (amount === null) return { error: `Montant invalide pour « ${field} ».` };
    data[field] = amount;
  }

  await prisma.levelFinancialInfo.upsert({
    where: { level },
    update: data,
    create: { level, ...(data as FinancialInfoFields) },
  });
  await logAction("SETTINGS_UPDATED", `Renseignements financiers mis à jour pour ${level}`, session.sub);
  revalidatePath("/admin/parametres");
  return { success: `Renseignements financiers de ${level} enregistrés.` };
}
