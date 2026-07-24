"use client";

import { useActionState } from "react";
import { recordEcolagePaymentAction, validateAdminAction, type ActionState } from "./actions";

const initialState: ActionState = {};

const smallButtonClass =
  "rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50";

// Actions contextuelles selon l'étape du dossier dans le workflow
export function DossierActions({
  studentId,
  status,
  accountEmail,
}: {
  studentId: string;
  status: string;
  accountEmail?: string | null;
}) {
  const [paymentState, paymentFormAction, paymentPending] = useActionState(
    recordEcolagePaymentAction,
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
          {/* Deux boutons, un même formulaire : le montant (moitié ou totalité
              du tarif de la filière) est calculé côté serveur, pas saisi ici. */}
          <button
            type="submit"
            name="type"
            value="TRANCHE_S1"
            disabled={paymentPending}
            title="1ère tranche : moitié du tarif annuel de la filière"
            className={smallButtonClass}
          >
            {paymentPending ? "..." : "1ère tranche"}
          </button>
          <button
            type="submit"
            name="type"
            value="TOTALITE"
            disabled={paymentPending}
            title="Paiement de la totalité de l'année en une fois"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Totalité
          </button>
        </form>
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
