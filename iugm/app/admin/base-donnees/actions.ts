"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { importPreselectionFile, deletePreselectionBatch } from "@/lib/preselection";

export type ActionState = { success?: string; warning?: string; error?: string };

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
    // Des lignes ignorées ne sont pas un échec de l'import (985 fiches
    // enregistrées avec 17 vrais dossiers créés reste un succès) — un
    // avertissement séparé, distinct du résumé, évite qu'un import
    // globalement réussi ait l'air d'une erreur totale (voir aussi le bouton
    // de nettoyage sur cette page pour les fiches définitivement bloquées).
    if (result.errors.length > 0) {
      return {
        success: summary,
        warning: `${result.errors.length} ligne(s) n'ont pas pu être reliées à un dossier : ${result.errors
          .slice(0, 3)
          .join(" ")}${result.errors.length > 3 ? ` (+${result.errors.length - 3} autre(s))` : ""}`,
      };
    }
    return { success: summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'import du fichier." };
  }
}

export type DeleteBatchState = { success?: string; error?: string };

// Supprime les fiches non utilisées d'un lot (année + catégorie) — jamais les
// fiches déjà reliées à un dossier étudiant, voir deletePreselectionBatch.
// Sert à nettoyer des fiches définitivement bloquées (ex. import corrompu par
// un fichier source mal formaté) sans devoir tout réimporter.
export async function deletePreselectionBatchAction(
  _prev: DeleteBatchState,
  formData: FormData,
): Promise<DeleteBatchState> {
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

  try {
    const count = await deletePreselectionBatch(
      academicYear,
      category as "PRESELECTION" | "EXISTING",
      session.sub,
    );
    revalidatePath("/admin/base-donnees");
    if (count === 0) return { success: "Aucune fiche non utilisée à supprimer pour ce lot." };
    return { success: `${count} fiche(s) non utilisée(s) supprimée(s).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la suppression." };
  }
}
