"use client";

import { useActionState } from "react";
import { updateConductAction, type ConductState } from "../actions";

const initialState: ConductState = {};

export function ConductForm({
  studentId,
  conduct,
}: {
  studentId: string;
  conduct?: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateConductAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <textarea
        name="conduct"
        rows={4}
        maxLength={2000}
        defaultValue={conduct ?? ""}
        placeholder="Appréciation de la conduite de l'étudiant (assiduité, discipline, comportement...)"
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
      />
      {state.error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
      >
        {pending ? "Enregistrement..." : "Enregistrer l'appréciation"}
      </button>
    </form>
  );
}
