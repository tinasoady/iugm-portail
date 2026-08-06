"use client";

import { useActionState } from "react";
import {
  verifyRegistrationPaymentAction,
  validateAdminAction,
  type ActionState,
} from "./actions";

const initialState: ActionState = {};

const smallButtonClass =
  "rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50";

// Actions contextuelles selon l'étape du dossier dans le workflow
export function DossierActions({
  studentId,
  status,
  accountEmail,
  registrationMinimum,
}: {
  studentId: string;
  status: string;
  accountEmail?: string | null;
  // Montant minimum requis pour débloquer le dossier (droit d'inscription +
  // assurance + polo + premier versement du niveau) — affiché en aide, non
  // imposé côté client (le serveur revérifie systématiquement).
  registrationMinimum?: number | null;
}) {
  const [paymentState, paymentFormAction, paymentPending] = useActionState(
    verifyRegistrationPaymentAction,
    initialState,
  );
  const [validateState, validateFormAction, validatePending] = useActionState(
    validateAdminAction,
    initialState,
  );

  if (status === "ENREGISTRE") {
    return (
      <div className="space-y-1">
        <form action={paymentFormAction} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="studentId" value={studentId} />
          <input
            name="receiptNumber"
            type="text"
            required
            placeholder="N° du reçu"
            className="w-28 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50"
          />
          <input
            name="amount"
            type="number"
            required
            min={0}
            step={1}
            placeholder="Montant versé"
            title={
              registrationMinimum
                ? `Minimum requis : ${registrationMinimum.toLocaleString("fr-FR")} Ar`
                : undefined
            }
            className="w-28 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={paymentPending}
            title="Le dossier n'est débloqué que si le montant couvre le minimum requis pour ce niveau"
            className={smallButtonClass}
          >
            {paymentPending ? "..." : "Vérifier le paiement"}
          </button>
        </form>
        {registrationMinimum != null && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Minimum requis : {registrationMinimum.toLocaleString("fr-FR")} Ar
          </p>
        )}
        {paymentState.error && (
          <p className="text-xs text-red-600 dark:text-red-400">{paymentState.error}</p>
        )}
      </div>
    );
  }

  if (status === "PAIEMENT_VERIFIE") {
    return (
      <div className="space-y-1">
        <form action={validateFormAction}>
          <input type="hidden" name="studentId" value={studentId} />
          <button type="submit" disabled={validatePending} className={smallButtonClass}>
            {validatePending ? "..." : "Valider l'inscription"}
          </button>
        </form>
        {validateState.error && (
          <p className="text-xs text-red-600 dark:text-red-400">{validateState.error}</p>
        )}
        {/* Le paiement qui vient de débloquer ce dossier fait passer son statut
            d'ENREGISTRE à PAIEMENT_VERIFIE, donc la branche ci-dessus (avec le
            formulaire de paiement) disparaît aussitôt — le message de succès
            (dont le reste à payer, voir verifyRegistrationPaymentAction) doit
            donc s'afficher ici pour rester visible à l'agent. */}
        {paymentState.success && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{paymentState.success}</p>
        )}
      </div>
    );
  }

  if (status === "ADMIN_VALIDEE") {
    return (
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        En attente de validation pédagogique
      </span>
    );
  }

  // INSCRIT
  return (
    <span className="text-xs text-zinc-500 dark:text-zinc-400">
      Compte : {accountEmail ?? "—"}
    </span>
  );
}
