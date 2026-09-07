"use client";

import { useActionState } from "react";
import { FaTrash } from "react-icons/fa";
import { createSubjectAction, deleteSubjectAction, type SubjectState } from "./actions";

const initialState: SubjectState = {};

const fieldClass =
  "rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50";

// Ajoute une matière au catalogue : nom, filière, niveau. Réservé au
// superadmin — le caractère obligatoire/facultatif se règle ailleurs
// (page Matières, accessible au secrétaire et à l'agent pédagogique).
export function CreateSubjectForm({
  formations,
  levels,
}: {
  formations: string[];
  levels: readonly string[];
}) {
  const [state, formAction, pending] = useActionState(createSubjectAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Matière</label>
        <input
          name="name"
          type="text"
          required
          placeholder="ex : Comptabilité générale"
          className={`w-56 ${fieldClass}`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Filière</label>
        <select name="formation" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            Choisir...
          </option>
          {formations.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Niveau</label>
        <select name="level" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            Choisir...
          </option>
          {levels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "..." : "Ajouter"}
      </button>
      {state.error && (
        <p className="w-full text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="w-full text-xs text-green-600 dark:text-green-400">{state.success}</p>
      )}
    </form>
  );
}

export function DeleteSubjectButton({ id, name }: { id: string; name: string }) {
  const [state, formAction, pending] = useActionState(deleteSubjectAction, initialState);

  return (
    <div>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (!window.confirm(`Supprimer la matière « ${name} » du catalogue ?`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          title="Supprimer"
          className="rounded-lg border border-red-200 p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          <FaTrash size={11} />
        </button>
      </form>
      {state.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
