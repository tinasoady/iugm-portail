"use client";

import { useActionState, useState } from "react";
import { FaEye, FaEyeSlash, FaExclamationTriangle } from "react-icons/fa";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

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
        <div className="relative mt-1">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`w-full rounded-xl border bg-white px-3 py-2 pr-10 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:bg-zinc-950 dark:text-zinc-50 ${
              state.error
                ? "border-red-400 dark:border-red-700"
                : "border-black/10 dark:border-white/10"
            }`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400 transition hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            {showPassword ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
          </button>
        </div>
      </div>

      {/* Erreur affichée sous les champs, sur la même page */}
      {state.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          <FaExclamationTriangle className="shrink-0" size={14} />
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Connexion..." : "Se connecter"}
      </button>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Aucun compte d&apos;inscription ici : les logins sont attribués par l&apos;université.
      </p>
    </form>
  );
}
