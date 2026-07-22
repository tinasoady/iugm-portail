"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="currentPassword">
          Mot de passe actuel *
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Pour votre première connexion, c&apos;est le mot de passe imprimé sur votre reçu
          d&apos;inscription.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="newPassword">
          Nouveau mot de passe *
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Au moins 8 caractères, différent de votre matricule seul.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="confirm">
          Confirmer le nouveau mot de passe *
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
      >
        {pending ? "Enregistrement..." : "Changer mon mot de passe"}
      </button>
    </form>
  );
}
