"use client";

import { useActionState } from "react";
import { createUser, type CreateUserState } from "./actions";

const ROLE_OPTIONS = [
  { value: "ETUDIANT", label: "Étudiant" },
  { value: "AGENT_PEDAGOGIQUE", label: "Agent pédagogique" },
  { value: "AGENT_ADMINISTRATION", label: "Agent d'administration" },
  { value: "SUPERADMIN", label: "Super administrateur" },
];

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50";

const initialState: CreateUserState = {};

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUser, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="fullName">
          Nom complet
        </label>
        <input id="fullName" name="fullName" type="text" required className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="new-email">
          Email
        </label>
        <input id="new-email" name="email" type="email" required className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="role">
          Rôle
        </label>
        <select id="role" name="role" required defaultValue="ETUDIANT" className={inputClass}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="new-password">
          Mot de passe initial
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Au moins 8 caractères. À communiquer à l&apos;utilisateur.
        </p>
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
        {pending ? "Création en cours..." : "Créer le compte"}
      </button>
    </form>
  );
}
