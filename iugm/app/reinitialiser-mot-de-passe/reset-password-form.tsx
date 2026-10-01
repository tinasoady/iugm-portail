"use client";

import { useActionState, useState } from "react";
import { FaEye, FaEyeSlash, FaExclamationTriangle } from "react-icons/fa";

import { resetPasswordAction, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {};

function PasswordField({
  id,
  name,
  label,
  helper,
}: {
  id: string;
  name: string;
  label: string;
  helper?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 pr-10 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 transition hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          {visible ? <FaEyeSlash size={16} aria-hidden="true" /> : <FaEye size={16} aria-hidden="true" />}
        </button>
      </div>
      {helper && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{helper}</p>}
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <form className="space-y-4" action={formAction}>
      <input type="hidden" name="token" value={token} />
      <PasswordField
        id="newPassword"
        name="newPassword"
        label="Nouveau mot de passe"
        helper="Au moins 8 caractères, avec une lettre et un chiffre."
      />
      <PasswordField id="confirm" name="confirm" label="Confirmer le mot de passe" />

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
        {pending ? "Enregistrement..." : "Enregistrer le mot de passe"}
      </button>
    </form>
  );
}
