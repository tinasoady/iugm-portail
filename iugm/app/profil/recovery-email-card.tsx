"use client";

import { useActionState } from "react";
import { FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";

import {
  requestRecoveryEmailAction,
  removeRecoveryEmailAction,
  type RecoveryEmailState,
} from "./recovery-email-actions";

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";

const initialState: RecoveryEmailState = {};

function Feedback({ state }: { state: RecoveryEmailState }) {
  return (
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
  );
}

export function RecoveryEmailCard({
  login,
  maskedRecovery,
  isStudent,
  suggestedEmail,
}: {
  login: string;
  maskedRecovery: string | null;
  isStudent: boolean;
  // Adresse déjà présente dans le dossier de l'étudiant : proposée, mais jamais
  // utilisée sans être vérifiée par un lien.
  suggestedEmail?: string | null;
}) {
  const [requestState, requestAction, requestPending] = useActionState(
    requestRecoveryEmailAction,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeRecoveryEmailAction,
    initialState,
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Votre identifiant de connexion est <strong>{login}</strong> : ce n&apos;est pas une adresse
        e-mail. {isStudent
          ? "Ajoutez votre adresse e-mail pour pouvoir réinitialiser vous-même votre mot de passe si vous l'oubliez ; sans elle, il faudra vous adresser à l'administration."
          : "Cette adresse reçoit le lien de réinitialisation si vous oubliez votre mot de passe."}
      </p>

      <p className="text-sm">
        Adresse actuelle :{" "}
        {maskedRecovery ? (
          <strong className="text-emerald-700 dark:text-emerald-400">{maskedRecovery} (confirmée)</strong>
        ) : (
          <strong className="text-amber-700 dark:text-amber-400">
            aucune — vous ne pourriez pas réinitialiser votre mot de passe par e-mail
          </strong>
        )}
      </p>

      <form action={requestAction} className="space-y-3">
        <div>
          <label className={labelClass} htmlFor="recovery-email">
            {maskedRecovery ? "Nouvelle adresse e-mail" : "Adresse e-mail"}
          </label>
          <input
            id="recovery-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={maskedRecovery ? "" : (suggestedEmail ?? "")}
            className={inputClass}
          />
          {!maskedRecovery && suggestedEmail && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Adresse trouvée dans votre dossier : confirmez-la en saisissant votre mot de passe, un
              message de vérification y sera envoyé.
            </p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="recovery-password">
            Votre mot de passe actuel
          </label>
          <input
            id="recovery-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </div>
        <Feedback state={requestState} />
        <button
          type="submit"
          disabled={requestPending}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {requestPending ? "Envoi..." : "Envoyer le message de confirmation"}
        </button>
      </form>

      {maskedRecovery && (
        <form
          action={removeAction}
          className="space-y-2 border-t border-black/5 pt-4 dark:border-white/10"
          onSubmit={(e) => {
            if (
              !window.confirm(
                "Retirer l'adresse e-mail ? Vous ne pourrez plus réinitialiser votre mot de passe par e-mail.",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <label className={labelClass} htmlFor="recovery-remove-password">
            Retirer l&apos;adresse e-mail
          </label>
          <input
            id="recovery-remove-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Votre mot de passe actuel"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={removePending}
            className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            {removePending ? "Retrait..." : "Retirer"}
          </button>
        </form>
      )}

      {/* Hors du bloc conditionnel ci-dessus : visible aussi après le retrait */}
      <Feedback state={removeState} />
    </div>
  );
}
