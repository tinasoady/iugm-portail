"use client";

import { useActionState } from "react";

import {
  sendAnnouncementAction,
  deleteAnnouncementAction,
  type AnnouncementState,
} from "./actions";

import {FaTrash} from "react-icons/fa";

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";

const LEVELS = ["L1", "L2", "L3", "M1", "M2"];
const initialState: AnnouncementState = {};

export function ComposeForm({
  formations,
  lockedFormation,
}: {
  formations: string[];
  lockedFormation?: string | null;
}) {
  const [state, formAction, pending] = useActionState(sendAnnouncementAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="title">Titre *</label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={150}
          placeholder="ex : Report des examens du semestre 1"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="body">Message *</label>
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          maxLength={5000}
          placeholder="Contenu du communiqué destiné aux étudiants..."
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="formation">Filière ciblée</label>
          {lockedFormation ? (
            <p className="mt-1 rounded-xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              🔒 {lockedFormation} (votre formation)
            </p>
          ) : (
            <select id="formation" name="formation" defaultValue="" className={inputClass}>
              <option value="">Toutes les filières</option>
              {formations.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="level">Niveau ciblé</label>
          <select id="level" name="level" defaultValue="" className={inputClass}>
            <option value="">Tous les niveaux</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          ✅ {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
      >
        {pending ? "Envoi..." : "📢 Envoyer le communiqué"}
      </button>
    </form>
  );
}

export function DeleteAnnouncementButton({ id, title }: { id: string; title: string }) {
  const [state, formAction, pending] = useActionState(deleteAnnouncementAction, initialState);

  return (
    <div>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!window.confirm(`Supprimer le communiqué « ${title} » ?`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          {pending ? "..." : <FaTrash className="inline" />}
        </button>
      </form>
      {state.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
