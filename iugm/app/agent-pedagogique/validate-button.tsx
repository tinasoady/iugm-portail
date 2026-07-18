"use client";

import { useActionState } from "react";
import { validatePedagoAction, type ValidateState } from "./actions";

const initialState: ValidateState = {};

// Bouton de validation pédagogique. Après succès, les identifiants générés
// (email pro + mot de passe) sont affichés une seule fois.
export function ValidatePedagoButton({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useActionState(validatePedagoAction, initialState);

  if (state.credentials) {
    return (
      <div className="rounded-xl bg-green-50 px-3 py-2 text-xs text-green-800 dark:bg-green-950 dark:text-green-300">
        {state.credentials.password === null ? (
          <>
            <p className="font-semibold">✅ Réinscription validée</p>
            <p className="mt-1 font-mono">Compte existant : {state.credentials.email}</p>
            <p className="mt-1 text-green-700 dark:text-green-400">
              L&apos;étudiant conserve son email et son mot de passe habituels.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">✅ Compte étudiant créé — à transmettre :</p>
            <p className="mt-1 font-mono">Email : {state.credentials.email}</p>
            <p className="font-mono">Mot de passe : {state.credentials.password}</p>
            <p className="mt-1 text-green-700 dark:text-green-400">
              Notez ces identifiants maintenant : le mot de passe ne sera plus affiché.
            </p>
          </>
        )}
        <a
          href={`/agent-pedagogique/recu/${studentId}`}
          className="mt-2 inline-block rounded-lg border border-green-300 px-3 py-1.5 font-semibold text-green-800 transition hover:bg-green-100 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-900"
        >
          🖨 Imprimer le reçu d&apos;inscription
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <form action={formAction}>
        <input type="hidden" name="studentId" value={studentId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
        >
          {pending ? "Validation..." : "Valider l'inscription pédagogique"}
        </button>
      </form>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
