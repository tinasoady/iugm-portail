"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";

import { StripUrlQuery } from "@/app/ui/strip-url-query";
import { confirmRecoveryEmailAction, type ConfirmState } from "./actions";

const initialState: ConfirmState = {};

export function ConfirmForm({ token, maskedEmail }: { token: string; maskedEmail: string }) {
  const [state, formAction, pending] = useActionState(confirmRecoveryEmailAction, initialState);

  if (state.success) {
    return (
      <div className="space-y-4 text-center">
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl bg-green-50 px-3 py-2 text-left text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
        >
          <FaCheckCircle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
          {state.success}
        </p>
        <Link
          href="/login"
          className="inline-block rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500"
        >
          Aller à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <StripUrlQuery />
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Vous allez confirmer <strong className="text-zinc-900 dark:text-zinc-50">{maskedEmail}</strong>{" "}
        comme adresse de récupération de votre compte du portail. Elle recevra le lien « mot de passe
        oublié ».
      </p>

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
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {pending ? "Confirmation..." : "Confirmer cette adresse"}
      </button>
    </form>
  );
}
