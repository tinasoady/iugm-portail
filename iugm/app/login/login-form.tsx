"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form className="space-y-4" action={formAction}>
      <div>
        <label
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
          htmlFor="email"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:bg-zinc-950 dark:text-zinc-50 ${
            state.error
              ? "border-red-400 dark:border-red-700"
              : "border-black/10 dark:border-white/10"
          }`}
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
          htmlFor="password"
        >
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:bg-zinc-950 dark:text-zinc-50 ${
            state.error
              ? "border-red-400 dark:border-red-700"
              : "border-black/10 dark:border-white/10"
          }`}
        />
      </div>

      {/* Erreur affichée sous les champs, sur la même page */}
      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          ⚠ {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
      >
        {pending ? "Connexion..." : "Se connecter"}
      </button>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Aucun compte d&apos;inscription ici : les logins sont attribués par l&apos;université.
      </p>
    </form>
  );
}
