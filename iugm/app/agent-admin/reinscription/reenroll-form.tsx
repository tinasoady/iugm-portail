"use client";

import { useActionState } from "react";
import { reenrollAction, type ReenrollState } from "./actions";

const fieldClass =
  "rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";

const initialState: ReenrollState = {};

const LEVELS = ["L1", "L2", "L3", "M1", "M2"];

// Niveau suivant proposé par défaut (L1 -> L2, L3 -> M1...)
function nextLevel(current?: string | null): string {
  const i = LEVELS.indexOf(current ?? "");
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : (current ?? "L1");
}

export function ReenrollForm({
  studentId,
  fullName,
  currentLevel,
  years,
  defaultYear,
}: {
  studentId: string;
  fullName: string;
  currentLevel?: string | null;
  years: string[];
  defaultYear: string;
}) {
  const [state, formAction, pending] = useActionState(reenrollAction, initialState);

  if (state.success) {
    return (
      <p className="rounded-lg bg-green-50 px-2.5 py-1.5 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
        ✅ {state.success}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <form
        action={formAction}
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          const data = new FormData(e.currentTarget);
          const ok = window.confirm(
            `Réinscrire ${fullName} pour ${data.get("academicYear")} ?\n` +
              "Son dossier repartira à l'étape « Enregistré » (écolage à payer).",
          );
          if (!ok) e.preventDefault();
        }}
      >
        <input type="hidden" name="studentId" value={studentId} />
        <select name="academicYear" required defaultValue={defaultYear} className={fieldClass}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select name="level" required defaultValue={nextLevel(currentLevel)} className={fieldClass}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
        >
          {pending ? "..." : "Réinscrire"}
        </button>
      </form>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
