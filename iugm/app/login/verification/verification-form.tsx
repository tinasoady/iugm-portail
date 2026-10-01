"use client";

import { useActionState } from "react";
import { FaExclamationTriangle } from "react-icons/fa";

import { verifyTwoFactorAction, type LoginState } from "../actions";

const initialState: LoginState = {};

export function VerificationForm() {
  const [state, formAction, pending] = useActionState(verifyTwoFactorAction, initialState);

  return (
    <form className="space-y-4" action={formAction}>
      <div>
        <label
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
          htmlFor="code"
        >
          Code de vérification
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          required
          aria-describedby="code-help"
          aria-invalid={state.error ? true : undefined}
          className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-center text-lg tracking-widest text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:bg-zinc-950 dark:text-zinc-50 ${
            state.error
              ? "border-red-400 dark:border-red-700"
              : "border-black/10 dark:border-white/10"
          }`}
        />
        <p id="code-help" className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Saisissez les 6 chiffres affichés par votre application d&apos;authentification, ou
          l&apos;un de vos codes de secours (XXXXX-XXXXX).
        </p>
      </div>

      <div aria-live="polite">
        {state.error && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            <FaExclamationTriangle className="shrink-0" size={14} aria-hidden="true" />
            {state.error}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Vérification..." : "Valider"}
      </button>
    </form>
  );
}
