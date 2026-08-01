"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { importPreselectionFile } from "@/lib/preselection";

export type ActionState = { success?: string; error?: string };

async function requireSuperadmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") return null;
  return session;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo
const CATEGORIES = new Set(["PRESELECTION", "EXISTING"]);

export async function importPreselectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const academicYear = String(formData.get("academicYear") ?? "").trim();
  if (!/^\d{4}-\d{4}$/.test(academicYear)) {
    return { error: "Année universitaire invalide." };
  }

  const category = String(formData.get("category") ?? "");
  if (!CATEGORIES.has(category)) {
    return { error: "Type de données invalide." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisissez un fichier Excel (.xlsx)." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "Fichier trop volumineux (10 Mo maximum)." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importPreselectionFile(
      buffer,
      academicYear,
      session.sub,
      category as "PRESELECTION" | "EXISTING",
    );
    revalidatePath("/admin/base-donnees");
    revalidatePath("/agent-admin");
    const categoryLabel = category === "EXISTING" ? "Dossiers existants" : "Présélection";
    const studentsNote =
      category === "EXISTING"
        ? ` ${result.studentsCreated ?? 0} dossier(s) créé(s) directement (visibles dans « Dossiers étudiants »)${
            result.studentsMatched ? `, ${result.studentsMatched} déjà existant(s) relié(s) sans doublon` : ""
          }.`
        : "";
    const summary = `${categoryLabel} — import terminé pour ${academicYear} : ${result.created} fiche(s) enregistrée(s).${studentsNote}`;
    if (result.errors.length > 0) {
      return {
        error: `${summary} ${result.errors.length} ligne(s) ignorée(s) : ${result.errors.slice(0, 3).join(" ")}`,
      };
    }
    return { success: summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'import du fichier." };
  }
}
