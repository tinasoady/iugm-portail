"use client";

import { useActionState } from "react";
import {
  cancelImportedPaymentAction,
  type CancelImportedPaymentState,
} from "@/app/etudiants/actions";

const initialState: CancelImportedPaymentState = {};

// Corrige l'hypothèse « écolage déjà payé » posée automatiquement à l'import
// d'un dossier existant (voir IMPORTED_PAYMENT_RECEIPT_LABEL dans
// lib/students.ts), quand elle se révèle fausse pour cet étudiant en particulier.
export function CancelImportedPaymentButton({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useActionState(cancelImportedPaymentAction, initialState);

  return (
    <div className="mt-2">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            !window.confirm(
              "Annuler ce versement présumé ? Le dossier repassera en attente de vérification du paiement, avec le vrai reçu à saisir.",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="studentId" value={studentId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
        >
          {pending ? "..." : "Ce n'est pas payé : corriger"}
        </button>
      </form>
      {state.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && (
        <p className="mt-1 text-xs text-green-600 dark:text-green-400">{state.success}</p>
      )}
    </div>
  );
}
