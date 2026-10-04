"use client";

import { useActionState, useState } from "react";

import {
  resendInvitationAction,
  cancelInvitationAction,
  type PermissionState,
} from "./actions";

const initialState: PermissionState = {};

// Compte du personnel créé par invitation mais pas encore activé : renvoyer le
// lien (éventuellement à une autre adresse, en cas de faute de frappe) ou annuler.
export function InvitationPanel({
  userId,
  username,
  maskedEmail,
  expiresLabel,
  expired,
}: {
  userId: string;
  username: string;
  maskedEmail: string;
  expiresLabel: string;
  expired: boolean;
}) {
  const [resendState, resendAction, resendPending] = useActionState(resendInvitationAction, initialState);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelInvitationAction, initialState);
  const [email, setEmail] = useState("");
  const state = [resendState, cancelState].find((s) => s.error || s.success) ?? {};

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Invitation envoyée à {maskedEmail} —{" "}
        {expired ? (
          <span className="font-medium text-red-600 dark:text-red-400">lien expiré</span>
        ) : (
          <>valable jusqu&apos;au {expiresLabel}</>
        )}
        .
      </p>

      <form action={resendAction} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="userId" value={userId} />
        <label htmlFor={`resend-${userId}`} className="sr-only">
          Adresse e-mail pour le renvoi (laisser vide pour la même adresse)
        </label>
        <input
          id={`resend-${userId}`}
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Autre adresse (facultatif)"
          autoComplete="off"
          className="w-52 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={resendPending}
          className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {resendPending ? "..." : "Renvoyer l'invitation"}
        </button>
      </form>

      <form
        action={cancelAction}
        onSubmit={(e) => {
          if (!window.confirm(`Annuler l'invitation et supprimer le compte ${username} ?`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <button
          type="submit"
          disabled={cancelPending}
          className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          {cancelPending ? "..." : "Annuler l'invitation"}
        </button>
      </form>

      <div aria-live="polite">
        {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
        {state.success && (
          <p role="status" className="text-xs text-green-600 dark:text-green-400">{state.success}</p>
        )}
      </div>
    </div>
  );
}
