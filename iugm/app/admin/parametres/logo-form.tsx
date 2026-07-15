"use client";

import { useActionState } from "react";
import { uploadLogoAction, removeLogoAction, type SettingsState } from "./actions";

const initialState: SettingsState = {};

export function LogoForm({ currentLogo }: { currentLogo?: string }) {
  const [uploadState, uploadFormAction, uploadPending] = useActionState(
    uploadLogoAction,
    initialState,
  );
  const [removeState, removeFormAction, removePending] = useActionState(
    removeLogoAction,
    initialState,
  );
  const state = uploadState.error || uploadState.success ? uploadState : removeState;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {currentLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image inutile ici
          <img
            src={currentLogo}
            alt="Logo actuel de l'établissement"
            className="h-16 w-16 rounded-xl border border-black/10 bg-white object-contain p-1 dark:border-white/10"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white">
            IU
          </div>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {currentLogo
            ? "Logo actuel — il apparaît dans la barre latérale, sur la page de connexion et le reçu."
            : "Aucun logo personnalisé : le monogramme par défaut est utilisé."}
        </p>
      </div>

      <form action={uploadFormAction} className="space-y-3">
        <input
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          required
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-300"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={uploadPending}
            className="rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
          >
            {uploadPending ? "Envoi..." : "Mettre à jour le logo"}
          </button>
          {currentLogo && (
            <button
              type="submit"
              formAction={removeFormAction}
              formNoValidate
              disabled={removePending}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Retirer le logo
            </button>
          )}
        </div>
      </form>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        PNG, JPEG, WebP ou SVG — 1 Mo maximum.
      </p>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      )}
    </div>
  );
}
