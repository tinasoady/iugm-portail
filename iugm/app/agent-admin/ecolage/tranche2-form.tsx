"use client";

import { useActionState } from "react";

import { recordEcolagePaymentAction, type ActionState } from "../actions";

const initialState: ActionState = {};

// Formulaire compact pour enregistrer la 2e tranche d'un dossier qui a déjà
// payé la 1ère — seule action manquante non couverte par /agent-admin, dont
// le tableau de dossiers ne propose l'action de paiement que sur les dossiers
// encore au statut ENREGISTRE (donc jamais pour la 2e tranche).
export function Tranche2Form({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useActionState(recordEcolagePaymentAction, initialState);

  return (
    <div className="space-y-1">
      <form action={formAction} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="type" value="TRANCHE_S2" />
        <input
          name="receiptNumber"
          type="text"
          required
          placeholder="N° du reçu"
          className="w-24 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "..." : "2e tranche"}
        </button>
      </form>
      {state.error && <p className="text-[11px] text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && (
        <p className="text-[11px] text-green-600 dark:text-green-400">{state.success}</p>
      )}
    </div>
  );
}
