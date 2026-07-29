"use client";

import { useActionState, useState } from "react";
import { regenerateQrAction, type QrCardState } from "./qr-actions";

const initialState: QrCardState = {};

// Carte étudiante numérique : masquée par défaut (écran de téléphone visible
// par des tiers dans une file d'attente), affichée à la demande via ce bouton.
export function QrCodeCard({ initialDataUrl }: { initialDataUrl: string }) {
  const [visible, setVisible] = useState(false);
  const [state, formAction, pending] = useActionState(regenerateQrAction, initialState);
  const dataUrl = state.dataUrl ?? initialDataUrl;

  return (
    <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Ma carte étudiante numérique
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            À présenter (scan du QR code) pour vérifier votre identité et votre inscription.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500"
        >
          {visible ? "Masquer le QR code" : "Afficher mon QR code"}
        </button>
      </div>

      {visible && (
        <div className="mt-4 flex flex-col items-center gap-3 border-t border-black/5 pt-4 dark:border-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL générée côté serveur, next/image inutile ici */}
          <img
            src={dataUrl}
            alt="QR code de ma carte étudiante"
            className="h-48 w-48 rounded-xl border border-black/10 dark:border-white/10"
          />

          <form action={formAction}>
            <button
              type="submit"
              disabled={pending}
              className="text-xs font-medium text-zinc-500 underline-offset-2 transition hover:text-indigo-600 hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-indigo-400"
            >
              {pending ? "Régénération..." : "Code partagé par erreur ? Le régénérer"}
            </button>
          </form>
          {state.error && (
            <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
          )}
          {state.dataUrl && !state.error && (
            <p className="text-xs text-green-600 dark:text-green-400">
              Nouveau code généré — l&apos;ancien QR ne fonctionne plus.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
