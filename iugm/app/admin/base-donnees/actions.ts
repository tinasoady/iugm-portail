"use server";

import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";

import { getSession } from "@/lib/auth";
import {
  importPreselectionFile,
  deletePreselectionBatch,
  deleteStudentsFromBatch,
} from "@/lib/preselection";

export type ActionState = { success?: string; warning?: string; error?: string };

async function requireSuperadmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") return null;
  return session;
}

// Limite applicative réelle (celle affichée à l'utilisateur) : le fichier
// arrive déjà sur Vercel Blob à ce stade (voir import-form.tsx), donc ce
// n'est plus la limite de ~4,5 Mo du corps de requête Vercel qui s'applique
// ici, seulement celle-ci. Doit rester <= maximumSizeInBytes dans
// app/api/admin/import-upload/route.ts.
const MAX_BYTES = 25 * 1024 * 1024; // 25 Mo

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

  const blobUrl = String(formData.get("blobUrl") ?? "").trim();
  if (!blobUrl.includes(".public.blob.vercel-storage.com/")) {
    return { error: "Choisissez un fichier Excel (.xlsx)." };
  }

  try {
    const blobResponse = await fetch(blobUrl);
    if (!blobResponse.ok) {
      return { error: "Le fichier envoyé est introuvable, réessayez l'import." };
    }
    const contentLength = Number(blobResponse.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BYTES) {
      return { error: "Fichier trop volumineux (25 Mo maximum)." };
    }
    const buffer = Buffer.from(await blobResponse.arrayBuffer());
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
  } finally {
    // Fichier temporaire uniquement le temps de l'import (succès ou échec) —
    // inutile de le garder sur Vercel Blob une fois lu ici.
    await del(blobUrl).catch(() => {});
  }
}

export type DeleteBatchState = { success?: string; error?: string };

// Supprime les fiches non utilisées d'un lot (année + catégorie + filière) —
// jamais les fiches déjà reliées à un dossier étudiant, voir
// deletePreselectionBatch. Sert à nettoyer des fiches définitivement
// bloquées (ex. import corrompu par un fichier source mal formaté) sans
// devoir tout réimporter.
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

  // Champs cachés vides = lot sans filière/niveau renseigné (voir
  // formation: null / level: null dans PreselectionCandidate) — pas une
  // valeur "toutes filières" / "tous niveaux".
  const formation = String(formData.get("formation") ?? "").trim() || null;
  const level = String(formData.get("level") ?? "").trim() || null;

  try {
    const count = await deletePreselectionBatch(
      academicYear,
      category as "PRESELECTION" | "EXISTING",
      formation,
      level,
      session.sub,
    );
    revalidatePath("/admin/base-donnees");
    if (count === 0) return { success: "Aucune fiche non utilisée à supprimer pour ce lot." };
    return { success: `${count} fiche(s) non utilisée(s) supprimée(s).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la suppression." };
  }
}

export type DeleteBatchStudentsState = { success?: string; error?: string };

// Supprime aussi les dossiers étudiants déjà créés à partir du lot (et leur
// compte de connexion) — contrairement à deletePreselectionBatchAction
// ci-dessus, qui les préserve toujours. Action volontairement séparée et plus
// dangereuse : confirmation renforcée côté serveur (l'année tapée doit
// correspondre exactement), pas seulement un window.confirm côté client.
export async function deleteBatchStudentsAction(
  _prev: DeleteBatchStudentsState,
  formData: FormData,
): Promise<DeleteBatchStudentsState> {
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

  const formation = String(formData.get("formation") ?? "").trim() || null;
  const level = String(formData.get("level") ?? "").trim() || null;

  const confirmText = String(formData.get("confirmText") ?? "").trim();
  if (confirmText !== academicYear) {
    return { error: "Confirmation incorrecte : l'année tapée ne correspond pas." };
  }

  try {
    const count = await deleteStudentsFromBatch(
      academicYear,
      category as "PRESELECTION" | "EXISTING",
      formation,
      level,
      session.sub,
    );
    revalidatePath("/admin/base-donnees");
    revalidatePath("/etudiants");
    revalidatePath("/agent-admin");
    if (count === 0) return { success: "Aucun dossier étudiant lié à ce lot." };
    return { success: `${count} dossier(s) étudiant(s) supprimé(s), compte(s) de connexion inclus.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la suppression." };
  }
}
