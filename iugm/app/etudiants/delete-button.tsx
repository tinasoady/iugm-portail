"use client";

import { useActionState } from "react";
import { deleteStudentAction, type DeleteState } from "./actions";

const initialState: DeleteState = {};

// Suppression définitive d'un dossier, avec confirmation explicite
export function DeleteStudentButton({
  studentId,
  matricule,
  fullName,
}: {
  studentId: string;
  matricule: string;
  fullName: string;
}) {
  const [state, formAction, pending] = useActionState(deleteStudentAction, initialState);

  return (
    <div>
      <form
        action={formAction}
        onSubmit={(e) => {
          const ok = window.confirm(
            `Supprimer définitivement le dossier ${matricule} (${fullName}) ?\n` +
              "Ses résultats et son compte de connexion seront aussi supprimés.",
          );
          if (!ok) e.preventDefault();
        }}
      >
        <input type="hidden" name="studentId" value={studentId} />
        <button
          type="submit"
          disabled={pending}
          title="Supprimer le dossier"
          className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          {pending ? "..." : "🗑 Supprimer"}
        </button>
      </form>
      {state.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
