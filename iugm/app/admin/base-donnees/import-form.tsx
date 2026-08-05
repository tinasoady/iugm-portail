"use client";

import { useActionState, useState } from "react";
import { importPreselectionAction, type ActionState } from "./actions";

const initialState: ActionState = {};

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";
const pillClass =
  "cursor-pointer rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-zinc-700 transition select-none has-checked:border-indigo-600 has-checked:bg-indigo-600 has-checked:text-white dark:border-white/10 dark:text-zinc-300 dark:has-checked:border-indigo-500 dark:has-checked:bg-indigo-600 dark:has-checked:text-white";

type Category = "PRESELECTION" | "EXISTING";

const CATEGORY_HELP: Record<Category, string> = {
  PRESELECTION:
    "Fichier reçu de l'Université de Mahajanga (résultats de présélection des nouveaux L1), sans modification préalable. Reste en attente : c'est l'agent qui crée le dossier via « Inscrire un étudiant » en recherchant le nom.",
  EXISTING:
    "Fichier interne recensant des étudiants déjà sur place à l'université (tout niveau : L1 à M2) mais pas encore saisis dans ce portail. Chaque ligne crée directement un dossier « Enregistré », visible tout de suite dans « Dossiers étudiants » (l'agent complète ensuite les infos manquantes, vérifie l'écolage, valide et crée le compte, comme d'habitude).",
};

export function ImportPreselectionForm({
  years,
  defaultYear,
}: {
  years: string[];
  defaultYear: string;
}) {
  const [state, formAction, pending] = useActionState(importPreselectionAction, initialState);
  const [category, setCategory] = useState<Category>("PRESELECTION");

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <p className={labelClass}>Type de données *</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <label className={pillClass}>
            <input
              type="radio"
              name="category"
              value="PRESELECTION"
              required
              defaultChecked
              onChange={() => setCategory("PRESELECTION")}
              className="sr-only"
            />
            Présélection (nouveaux L1)
          </label>
          <label className={pillClass}>
            <input
              type="radio"
              name="category"
              value="EXISTING"
              onChange={() => setCategory("EXISTING")}
              className="sr-only"
            />
            Dossiers existants (autres niveaux)
          </label>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="academicYear">
          Année universitaire concernée *
        </label>
        <select
          id="academicYear"
          name="academicYear"
          required
          defaultValue={defaultYear}
          className={inputClass}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Un nouvel import pour cette année et ce type de données remplace le lot précédent (les
          fiches déjà utilisées pour une inscription sont conservées).
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="file">
          Fichier (.xlsx) *
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="mt-1 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-900 dark:file:text-zinc-300"
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {CATEGORY_HELP[category]} Colonnes reconnues automatiquement : Nom, Prénom, Sexe,
          Date/Lieu de naissance, CIN, Bacc (numéro, série, mention, année, centre, pays),
          établissement d&apos;origine, contacts, parents, filière, niveau.
        </p>
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "Import en cours..." : "Importer le fichier"}
      </button>
    </form>
  );
}
