"use client";

import { useActionState } from "react";
import { assignResultAction, type AssignResultState } from "./actions";

const initialState: AssignResultState = {};

const fieldClass =
  "rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50";

// Assigne une moyenne pour une année/semestre ; la mention est calculée côté serveur
export function AssignResultForm({
  studentId,
  defaultYear,
}: {
  studentId: string;
  defaultYear: string;
}) {
  const [state, formAction, pending] = useActionState(assignResultAction, initialState);

  return (
    <div className="space-y-1">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="studentId" value={studentId} />
        <input
          name="academicYear"
          type="text"
          required
          defaultValue={defaultYear}
          pattern="\d{4}-\d{4}"
          title="Format : 2025-2026"
          className={`w-24 ${fieldClass}`}
        />
        <select name="semester" required defaultValue="S1" className={fieldClass}>
          <option value="S1">S1</option>
          <option value="S2">S2</option>
        </select>
        <input
          name="average"
          type="number"
          required
          min={0}
          max={20}
          step="0.01"
          placeholder="Moy. /20"
          className={`w-20 ${fieldClass}`}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
        >
          {pending ? "..." : "Enregistrer"}
        </button>
      </form>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600 dark:text-green-400">{state.success}</p>}
    </div>
  );
}
