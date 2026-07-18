"use client";

import { useActionState } from "react";
import {
  updateProfileAction,
  uploadPhotoAction,
  removePhotoAction,
  type ProfileState,
} from "./actions";

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";
const primaryButtonClass =
  "rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50";

const initialState: ProfileState = {};

export function PhotoForm({
  currentPhoto,
  initials,
}: {
  currentPhoto?: string | null;
  initials: string;
}) {
  const [uploadState, uploadFormAction, uploadPending] = useActionState(
    uploadPhotoAction,
    initialState,
  );
  const [removeState, removeFormAction, removePending] = useActionState(
    removePhotoAction,
    initialState,
  );
  const state = uploadState.error || uploadState.success ? uploadState : removeState;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {currentPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image inutile ici
          <img
            src={currentPhoto}
            alt="Photo de profil"
            className="h-20 w-20 rounded-full border border-black/10 object-cover dark:border-white/10"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-violet-600 text-xl font-bold text-white">
            {initials}
          </div>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {currentPhoto
            ? "Votre photo apparaît dans la barre du haut."
            : "Aucune photo : vos initiales sont affichées."}
        </p>
      </div>

      <form action={uploadFormAction} className="space-y-3">
        <input
          name="photo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-300"
        />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={uploadPending} className={primaryButtonClass}>
            {uploadPending ? "Envoi..." : "Mettre à jour la photo"}
          </button>
          {currentPhoto && (
            <button
              type="submit"
              formAction={removeFormAction}
              formNoValidate
              disabled={removePending}
              className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Retirer la photo
            </button>
          )}
        </div>
      </form>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">PNG, JPEG ou WebP — 1 Mo maximum.</p>

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

export function InfoForm({ fullName }: { fullName?: string | null }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="fullName">
          Nom complet *
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          minLength={2}
          maxLength={120}
          defaultValue={fullName ?? ""}
          className={inputClass}
        />
      </div>

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

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
