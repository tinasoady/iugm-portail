"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "./actions";

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";
const primaryButtonClass =
  "rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50";

const initialState: ProfileState = {};

export function InfoForm({ fullName }: { fullName?: string | null }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="fullName">
          Nom complet *
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          minLength={2}
          maxLength={120}
          defaultValue={fullName ?? ""}
          className={inputClass}
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      )}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
