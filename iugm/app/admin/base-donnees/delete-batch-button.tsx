"use client";

import { useActionState } from "react";
import { FaTrash } from "react-icons/fa";
import { deletePreselectionBatchAction, type DeleteBatchState } from "./actions";

const initialState: DeleteBatchState = {};

// Supprime les fiches non utilisées d'un lot importé. Les fiches déjà
// reliées à un dossier étudiant sont conservées quoi qu'il arrive (voir
// deletePreselectionBatch) — le bouton n'apparaît même pas s'il n'y a rien
// de supprimable (unusedCount === 0), pour ne jamais laisser croire qu'il
// pourrait toucher des dossiers étudiants existants.
export function DeleteBatchButton({
  academicYear,
  category,
  categoryLabel,
  unusedCount,
}: {
  academicYear: string;
  category: string;
  categoryLabel: string;
  unusedCount: number;
}) {
  const [state, formAction, pending] = useActionState(deletePreselectionBatchAction, initialState);

  if (unusedCount === 0) return null;

  return (
    <div>
      <form
        action={formAction}
        onSubmit={(e) => {
          const ok = window.confirm(
            `Supprimer les ${unusedCount} fiche(s) non utilisée(s) de « ${categoryLabel} » pour ${academicYear} ?\n` +
              "Les fiches déjà reliées à un dossier étudiant sont conservées.",
          );
          if (!ok) e.preventDefault();
        }}
      >
        <input type="hidden" name="academicYear" value={academicYear} />
        <input type="hidden" name="category" value={category} />
        <button
          type="submit"
          disabled={pending}
          title="Supprimer les fiches non utilisées de ce lot"
          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          {pending ? "..." : <FaTrash className="inline" />}
        </button>
      </form>
      {state.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && <p className="mt-1 text-xs text-green-600 dark:text-green-400">{state.success}</p>}
    </div>
  );
}
