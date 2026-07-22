"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { saveSettings, getSettings, INSTITUTION_KEYS } from "@/lib/settings";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";

export type SettingsState = { success?: string; error?: string };

// Toutes les actions de cette page sont réservées au superadmin
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
// Tarifs
// ---------------------------------------------------------------------------

function parseAmount(formData: FormData): number | null {
  const amount = Number(String(formData.get("amount") ?? "").replace(/\s/g, ""));
  if (!Number.isInteger(amount) || amount < 0) return null;
  return amount;
}

export async function addTariffAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const label = String(formData.get("label") ?? "").trim();
  const amount = parseAmount(formData);
  if (!label) return { error: "Le libellé du tarif est obligatoire." };
  if (amount === null) return { error: "Montant invalide (nombre entier en ariary)." };

  await prisma.tariff.create({ data: { label, amount } });
  await logAction("SETTINGS_UPDATED", `Tarif ajouté : ${label} — ${amount} Ar`, session.sub);
  revalidatePath("/admin/parametres");
  return { success: `Tarif « ${label} » ajouté.` };
}

export async function updateTariffAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const amount = parseAmount(formData);
  if (!id || !label) return { error: "Libellé obligatoire." };
  if (amount === null) return { error: "Montant invalide." };

  try {
    await prisma.tariff.update({ where: { id }, data: { label, amount } });
  } catch {
    return { error: "Tarif introuvable." };
  }
  await logAction("SETTINGS_UPDATED", `Tarif modifié : ${label} — ${amount} Ar`, session.sub);
  revalidatePath("/admin/parametres");
  return { success: `Tarif « ${label} » mis à jour.` };
}

export async function deleteTariffAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Tarif manquant." };

  try {
    const tariff = await prisma.tariff.delete({ where: { id } });
    await logAction("SETTINGS_UPDATED", `Tarif supprimé : ${tariff.label}`, session.sub);
  } catch {
    return { error: "Tarif introuvable." };
  }
  revalidatePath("/admin/parametres");
  return { success: "Tarif supprimé." };
}
