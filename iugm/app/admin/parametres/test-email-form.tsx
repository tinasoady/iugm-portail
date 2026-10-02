"use client";

import { useActionState } from "react";
import { FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";

import { sendTestEmailAction, type TestEmailState } from "./actions";

const initialState: TestEmailState = {};

export function TestEmailForm({ defaultTo, disabled }: { defaultTo: string; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(sendTestEmailAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="test-email-to"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
        >
          Envoyer un e-mail de test à
        </label>
        <input
          id="test-email-to"
          name="to"
          type="email"
          required
          defaultValue={defaultTo.includes("@") ? defaultTo : ""}
          autoComplete="email"
          className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
        />
      </div>

      <div aria-live="polite" className="space-y-2">
        {state.error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            <p className="flex items-start gap-2">
              <FaExclamationTriangle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
              <span>{state.error}</span>
            </p>
            {state.hint && <p className="mt-1.5 pl-6 font-medium">{state.hint}</p>}
          </div>
        )}
        {state.success && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
          >
            <FaCheckCircle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
            {state.success}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "Envoi..." : "Envoyer le test"}
      </button>
    </form>
  );
}
