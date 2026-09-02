"use client";

import { useActionState, useState } from "react";
import { FaExclamationTriangle, FaTrash } from "react-icons/fa";
import { deleteBatchStudentsAction, type DeleteBatchStudentsState } from "./actions";

const initialState: DeleteBatchStudentsState = {};

// Supprime aussi les dossiers étudiants déjà créés à partir du lot (à la
// différence de DeleteBatchButton, qui les préserve toujours). Plus dangereux
// : la confirmation demande de taper l'année universitaire exacte, pas un
// simple window.confirm — le bouton ne s'affiche que s'il y a réellement des
// dossiers liés (usedCount > 0).
export function DeleteBatchStudentsButton({
  academicYear,
  category,
  categoryLabel,
  usedCount,
}: {
  academicYear: string;
  category: string;
  categoryLabel: string;
  usedCount: number;
}) {
  const [state, formAction, pending] = useActionState(deleteBatchStudentsAction, initialState);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  if (usedCount === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Supprimer aussi les dossiers étudiants créés depuis ce lot"
        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        <FaTrash className="inline" />
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs dark:border-red-900 dark:bg-red-950/40">
      <p className="mb-2 flex items-start gap-1.5 font-semibold text-red-700 dark:text-red-400">
        <FaExclamationTriangle className="mt-0.5 shrink-0" size={13} />
        Supprimera définitivement {usedCount} dossier(s) étudiant(s) de « {categoryLabel} » (
        {academicYear}), ainsi que leur compte de connexion.
      </p>
      <p className="mb-2 text-red-600 dark:text-red-400">
        Pour confirmer, tapez l&apos;année universitaire exacte : <strong>{academicYear}</strong>
      </p>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (confirmText !== academicYear) e.preventDefault();
        }}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="academicYear" value={academicYear} />
        <input type="hidden" name="category" value={category} />
        <input
          type="text"
          name="confirmText"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={academicYear}
          autoFocus
          className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-red-800 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={pending || confirmText !== academicYear}
          className="rounded-lg bg-red-600 px-2.5 py-1 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "..." : "Confirmer la suppression"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmText("");
          }}
          className="rounded-lg border border-black/10 px-2.5 py-1 font-semibold text-zinc-600 transition hover:bg-black/5 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5"
        >
          Annuler
        </button>
      </form>
      {state.error && <p className="mt-2 text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && <p className="mt-2 text-green-600 dark:text-green-400">{state.success}</p>}
    </div>
  );
}
