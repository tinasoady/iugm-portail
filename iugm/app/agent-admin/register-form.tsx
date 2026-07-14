"use client";

import { useActionState } from "react";
import { registerStudentAction, type ActionState } from "./actions";

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50";

const initialState: ActionState = {};

export function RegisterStudentForm() {
  const [state, formAction, pending] = useActionState(registerStudentAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="fullName">
          Nom complet *
        </label>
        <input id="fullName" name="fullName" type="text" required className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="program">
            Filière *
          </label>
          <input id="program" name="program" type="text" required placeholder="Informatique" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="level">
            Niveau *
          </label>
          <input id="level" name="level" type="text" required placeholder="L1" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
            htmlFor="department"
          >
            Département
          </label>
          <input
            id="department"
            name="department"
            type="text"
            placeholder="Sciences et Technologies"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="birthDate">
            Date de naissance
          </label>
          <input id="birthDate" name="birthDate" type="date" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="phone">
            Téléphone
          </label>
          <input id="phone" name="phone" type="tel" className={inputClass} />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
            htmlFor="personalEmail"
          >
            Email personnel
          </label>
          <input id="personalEmail" name="personalEmail" type="email" className={inputClass} />
        </div>
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
      >
        {pending ? "Enregistrement..." : "Enregistrer l'étudiant"}
      </button>
    </form>
  );
}
