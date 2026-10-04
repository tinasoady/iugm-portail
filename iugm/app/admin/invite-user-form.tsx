"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FaExclamationTriangle, FaCheckCircle } from "react-icons/fa";

import { usePreserveOnError } from "@/app/ui/use-preserve-on-error";
import { inviteUserAction, type InviteUserState } from "./actions";

const ROLE_OPTIONS = [
  { value: "AGENT_PEDAGOGIQUE", label: "Agent pédagogique" },
  { value: "AGENT_ADMINISTRATION", label: "Agent d'administration" },
  { value: "SUPERADMIN", label: "Super administrateur" },
];

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";

const initialState: InviteUserState = {};

export function InviteUserForm({ mailReady }: { mailReady: boolean }) {
  const [state, formAction, pending] = useActionState(inviteUserAction, initialState);
  const [formRef, handleSubmit] = usePreserveOnError(state.error, state);

  return (
    <form ref={formRef} onSubmit={handleSubmit} action={formAction} className="space-y-4">
      {!mailReady && (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          L&apos;envoi d&apos;e-mails n&apos;est pas configuré : impossible d&apos;inviter quelqu&apos;un.{" "}
          <Link href="/admin/parametres" className="font-semibold underline">
            Configurer l&apos;envoi
          </Link>
        </p>
      )}

      <div>
        <label className={labelClass} htmlFor="invite-fullname">
          Nom complet
        </label>
        <input id="invite-fullname" name="fullName" type="text" required className={inputClass} />
      </div>

      <div>
        <label className={labelClass} htmlFor="invite-username">
          Nom d&apos;utilisateur
        </label>
        <input
          id="invite-username"
          name="username"
          type="text"
          required
          minLength={3}
          maxLength={32}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby="invite-username-help"
          className={inputClass}
        />
        <p id="invite-username-help" className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          C&apos;est l&apos;identifiant de connexion. 3 à 32 caractères : lettres minuscules sans accent,
          chiffres, point, tiret ou tiret bas (ex. <span className="font-mono">marie.rabe</span>).
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="invite-email">
          Adresse e-mail
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          aria-describedby="invite-email-help"
          className={inputClass}
        />
        <p id="invite-email-help" className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Le lien d&apos;activation y est envoyé. La personne y choisit elle-même son mot de passe ; cette
          adresse servira aussi à le réinitialiser en cas d&apos;oubli.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="invite-role">
          Rôle
        </label>
        <select id="invite-role" name="role" required defaultValue="AGENT_PEDAGOGIQUE" className={inputClass}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
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
        disabled={pending || !mailReady}
        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "Envoi de l'invitation..." : "Envoyer l'invitation"}
      </button>
    </form>
  );
}
