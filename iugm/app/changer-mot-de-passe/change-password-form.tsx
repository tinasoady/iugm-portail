"use client";

import { useActionState, useState, type ReactNode } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const inputClass =
  "w-full rounded-xl border border-black/10 bg-white px-3 py-2 pr-10 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";

const initialState: ChangePasswordState = {};

// Champ mot de passe avec bouton œil pour basculer masqué/en clair — utilisé
// trois fois sur ce formulaire (actuel, nouveau, confirmation).
function PasswordField({
  id,
  name,
  label,
  autoComplete,
  minLength,
  helper,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
  helper?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400 transition hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          {visible ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
        </button>
      </div>
      {helper && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{helper}</p>}
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <PasswordField
        id="currentPassword"
        name="currentPassword"
        label="Mot de passe actuel *"
        autoComplete="current-password"
        helper={
          <>
            Pour votre première connexion, c&apos;est le mot de passe imprimé sur votre reçu
            d&apos;inscription.
          </>
        }
      />

      <PasswordField
        id="newPassword"
        name="newPassword"
        label="Nouveau mot de passe *"
        autoComplete="new-password"
        minLength={8}
        helper="Au moins 8 caractères, différent de votre matricule seul."
      />

      <PasswordField
        id="confirm"
        name="confirm"
        label="Confirmer le nouveau mot de passe *"
        autoComplete="new-password"
        minLength={8}
      />

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
