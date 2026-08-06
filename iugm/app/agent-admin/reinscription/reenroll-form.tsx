"use client";

import { useActionState, useState } from "react";
import { FaCheckCircle } from "react-icons/fa";
import { reenrollAction, type ReenrollState } from "./actions";
import { nextLevel } from "@/lib/level-shared";
import { FORMATIONS } from "@/lib/formations";

const fieldClass =
  "rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";

const initialState: ReenrollState = {};

const DOCUMENTS: Array<[string, string]> = [
  ["docTranscript", "Copie certifiée du relevé de notes"],
  ["docBlueFolder", "Papier chemise bleu"],
];

export function ReenrollForm({
  studentId,
  fullName,
  currentLevel,
  currentMention,
  average,
  canForce,
  years,
  defaultYear,
}: {
  studentId: string;
  fullName: string;
  currentLevel?: string | null;
  currentMention?: string | null;
  average: number | null;
  canForce: boolean;
  years: string[];
  defaultYear: string;
}) {
  const [state, formAction, pending] = useActionState(reenrollAction, initialState);
  const next = nextLevel(currentLevel);
  const eligible = average !== null && average >= 10;
  const [levelChoice, setLevelChoice] = useState<"same" | "next">(
    next && eligible ? "next" : "same",
  );

  if (state.success) {
    return (
      <p className="flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
        <FaCheckCircle size={12} /> {state.success}
      </p>
    );
  }

  const showForceReason = canForce && levelChoice === "next" && !eligible;

  return (
    <div className="space-y-1.5">
      <form
        action={formAction}
        className="space-y-2"
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
        <div className="flex flex-wrap items-center gap-2">
          <select name="academicYear" required defaultValue={defaultYear} className={fieldClass}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            name="mention"
            defaultValue={currentMention ?? ""}
            title="Changement de filière (reconversion) : cas particulier"
            className={fieldClass}
          >
            {currentMention && !FORMATIONS.some((f) => f.label === currentMention) && (
              <option value={currentMention}>{currentMention}</option>
            )}
            {FORMATIONS.map((f) => (
              <option key={f.code} value={f.label}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="level"
              value={currentLevel ?? ""}
              checked={levelChoice === "same"}
              onChange={() => setLevelChoice("same")}
              className="accent-indigo-600"
            />
            Redoublant ({currentLevel ?? "—"})
          </label>
          {next && (
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="level"
                value={next}
                checked={levelChoice === "next"}
                onChange={() => setLevelChoice("next")}
                className="accent-indigo-600"
              />
              Passant ({next})
              {average !== null && (
                <span className={eligible ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  — moyenne {average.toFixed(2)}/20
                </span>
              )}
            </label>
          )}
        </div>
        {levelChoice === "next" && !eligible && !canForce && (
          <p className="text-[11px] text-rose-600 dark:text-rose-400">
            Passage impossible : moyenne générale insuffisante ou pas encore saisie. Seul un
            superadmin peut forcer le passage.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {DOCUMENTS.map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 px-2 py-1 text-[11px] transition has-checked:border-emerald-500 has-checked:bg-emerald-50 dark:border-white/10 dark:has-checked:border-emerald-600 dark:has-checked:bg-emerald-950/40"
            >
              <input type="checkbox" name={key} required className="h-3.5 w-3.5 accent-emerald-600" />
              {label}
            </label>
          ))}
        </div>

        {showForceReason && (
          <textarea
            name="forceReason"
            placeholder="Motif de la dérogation (obligatoire pour forcer le passage)"
            rows={2}
            className={`${fieldClass} w-full`}
          />
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "..." : "Réinscrire"}
        </button>
      </form>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
