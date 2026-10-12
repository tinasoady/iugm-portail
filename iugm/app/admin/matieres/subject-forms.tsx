"use client";

import { useActionState, useState } from "react";
import { FaTrash } from "react-icons/fa";
import {
  createSubjectAction,
  deleteSubjectAction,
  updateSubjectSettingsAction,
  type SubjectState,
} from "./actions";
import { formationsForLevel } from "@/lib/formations";
import { DEFAULT_BONUS_THRESHOLD } from "@/lib/grading";

const initialState: SubjectState = {};

const fieldClass =
  "rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50";
const smallFieldClass =
  "rounded-lg border border-black/10 bg-white px-2 py-0.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50";
const labelClass = "text-xs font-medium text-zinc-500 dark:text-zinc-400";

// Ajoute une matière au catalogue : nom, niveau, filière, puis ses
// paramètres de calcul (semestre, coefficient, part du contrôle continu,
// caractère obligatoire — avec note éliminatoire éventuelle — ou facultatif,
// avec seuil du bonus) — voir lib/grading.ts. Le niveau se choisit en
// premier : la liste de filières proposée en dépend (mentions de licence en
// L1-L3, spécialisations de master en M1-M2, voir lib/formations.ts).
// `lockedFormation` : agent limité à sa formation, seule filière proposée.
export function CreateSubjectForm({
  levels,
  lockedFormation,
}: {
  levels: readonly string[];
  lockedFormation: string | null;
}) {
  const [state, formAction, pending] = useActionState(createSubjectAction, initialState);
  const [level, setLevel] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const formations = formationsForLevel(level || undefined).filter(
    (f) => !lockedFormation || f.label === lockedFormation,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Matière</label>
        <input aria-label="Nom de la matière"
          name="name"
          type="text"
          required
          placeholder="ex : Comptabilité générale"
          className={`w-56 ${fieldClass}`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Niveau</label>
        <select aria-label="Niveau"
          name="level"
          required
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className={fieldClass}
        >
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
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Filière</label>
        <select aria-label="Filière" name="formation" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            Choisir...
          </option>
          {formations.map((f) => (
            <option key={f.code} value={f.label}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Semestre</label>
        <select aria-label="Semestre" name="semester" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            Choisir...
          </option>
          <option value="S1">S1</option>
          <option value="S2">S2</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Coefficient</label>
        <input aria-label="Coefficient"
          name="coefficient"
          type="number"
          required
          min={0.5}
          max={100}
          step="0.5"
          defaultValue={1}
          className={`w-20 ${fieldClass}`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass} title="0 = note unique ; sinon CC × part + examen × reste">
          Part du CC (%)
        </label>
        <input aria-label="Part du contrôle continu en pourcentage (0 = note unique)"
          name="ccWeight"
          type="number"
          required
          min={0}
          max={100}
          step="5"
          defaultValue={0}
          className={`w-20 ${fieldClass}`}
        />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className={labelClass}>Caractère</legend>
        <div className="flex items-center gap-4 py-1.5 text-sm text-zinc-900 dark:text-zinc-50">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="mandatory"
              value="true"
              checked={mandatory}
              onChange={() => setMandatory(true)}
              required
            />
            Obligatoire
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="mandatory"
              value="false"
              checked={!mandatory}
              onChange={() => setMandatory(false)}
            />
            Facultative (bonus)
          </label>
        </div>
      </fieldset>
      {mandatory && (
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Éliminatoire sous (/20)</label>
          <input aria-label="Note éliminatoire sur 20 (vide = aucune)"
            name="eliminationThreshold"
            type="number"
            min={0.25}
            max={20}
            step="0.25"
            placeholder="aucune"
            className={`w-24 ${fieldClass}`}
          />
        </div>
      )}
      {!mandatory && (
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Bonus au-delà de (/20)</label>
          <input aria-label="Seuil du bonus sur 20"
            name="bonusThreshold"
            type="number"
            required
            min={0}
            max={20}
            step="0.25"
            defaultValue={DEFAULT_BONUS_THRESHOLD}
            className={`w-24 ${fieldClass}`}
          />
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "..." : "Ajouter"}
      </button>
      {state.error && (
        <p role="alert" className="w-full text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p role="status" className="w-full text-xs text-green-600 dark:text-green-400">{state.success}</p>
      )}
    </form>
  );
}

// Paramètres de calcul d'une matière déjà au catalogue (semestre,
// coefficient, part du CC, caractère, note éliminatoire ou seuil du bonus).
// L'enregistrement recalcule les moyennes de semestre déjà obtenues avec des
// notes de cette matière.
export function SubjectSettingsForm({
  id,
  name,
  semester,
  coefficient,
  mandatory: initialMandatory,
  bonusThreshold,
  ccWeight,
  eliminationThreshold,
}: {
  id: string;
  name: string;
  semester: string | null;
  coefficient: number;
  mandatory: boolean;
  bonusThreshold: number;
  ccWeight: number;
  eliminationThreshold: number | null;
}) {
  const [state, formAction, pending] = useActionState(updateSubjectSettingsAction, initialState);
  const [mandatory, setMandatory] = useState(initialMandatory);

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="id" value={id} />
        <select
          aria-label={`Semestre de ${name}`}
          name="semester"
          defaultValue={semester ?? ""}
          disabled={pending}
          className={smallFieldClass}
        >
          {semester === null && <option value="">S1 et S2 (à préciser)</option>}
          <option value="S1">S1</option>
          <option value="S2">S2</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          coef.
          <input
            aria-label={`Coefficient de ${name}`}
            name="coefficient"
            type="number"
            required
            min={0.5}
            max={100}
            step="0.5"
            defaultValue={coefficient}
            disabled={pending}
            className={`w-14 ${smallFieldClass}`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          CC
          <input
            aria-label={`Part du contrôle continu de ${name} en pourcentage`}
            name="ccWeight"
            type="number"
            required
            min={0}
            max={100}
            step="5"
            defaultValue={ccWeight}
            disabled={pending}
            className={`w-14 ${smallFieldClass}`}
          />
          %
        </label>
        <select
          aria-label={`Obligatoire ou facultative : ${name}`}
          name="mandatory"
          value={String(mandatory)}
          onChange={(e) => setMandatory(e.target.value === "true")}
          disabled={pending}
          className={smallFieldClass}
        >
          <option value="true">Obligatoire</option>
          <option value="false">Facultative (bonus)</option>
        </select>
        {mandatory && (
          <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            éliminatoire sous
            <input
              aria-label={`Note éliminatoire de ${name} (vide = aucune)`}
              name="eliminationThreshold"
              type="number"
              min={0.25}
              max={20}
              step="0.25"
              placeholder="—"
              defaultValue={eliminationThreshold ?? ""}
              disabled={pending}
              className={`w-14 ${smallFieldClass}`}
            />
          </label>
        )}
        {!mandatory && (
          <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            au-delà de
            <input
              aria-label={`Seuil du bonus de ${name}`}
              name="bonusThreshold"
              type="number"
              required
              min={0}
              max={20}
              step="0.25"
              defaultValue={bonusThreshold}
              disabled={pending}
              className={`w-14 ${smallFieldClass}`}
            />
          </label>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-black/10 px-2 py-0.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {pending ? "..." : "Enregistrer"}
        </button>
      </form>
      {state.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && (
        <p className="mt-1 text-xs text-green-600 dark:text-green-400">{state.success}</p>
      )}
    </div>
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
