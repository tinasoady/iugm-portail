"use client";

import { useActionState } from "react";
import { FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";

import { requestPasswordResetAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <form className="space-y-4" action={formAction}>
      <div>
        <label
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
          htmlFor="email"
        >
          Identifiant de connexion (email)
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
        />
      </div>

      <div aria-live="polite">
        {state.error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            <FaExclamationTriangle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            <FaCheckCircle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
            {state.success}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Envoi..." : "Envoyer le lien"}
      </button>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Étudiant : le lien est envoyé à l&apos;adresse e-mail personnelle de votre dossier. Sans
        adresse enregistrée, adressez-vous à l&apos;administration.
      </p>
    </form>
  );
}
