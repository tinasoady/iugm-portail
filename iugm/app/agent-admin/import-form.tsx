"use client";

import { useActionState } from "react";
import { importCsvAction, type ActionState } from "./actions";

const initialState: ActionState = {};

export function ImportCsvForm() {
  const [state, formAction, pending] = useActionState(importCsvAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input
        name="file"
        type="file"
        accept=".csv,text/csv"
        required
        className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-900 dark:file:text-zinc-300"
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
        {pending ? "Import en cours..." : "Importer le CSV"}
      </button>
    </form>
  );
}
