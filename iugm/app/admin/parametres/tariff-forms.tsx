"use client";

import { useActionState } from "react";
import { FaTrash } from "react-icons/fa";
import {
  addTariffAction,
  updateTariffAction,
  deleteTariffAction,
  type SettingsState,
} from "./actions";
import { FORMATIONS } from "@/lib/formations";

const fieldClass =
  "rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";

const initialState: SettingsState = {};

// Sélecteur de filière partagé par les deux formulaires ci-dessous : "Aucune"
// laisse le tarif purement informatif (ex. droit de dossier), une filière
// choisie en fait le tarif annuel d'écolage utilisé par recordEcolagePayment.
function FormationSelect({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <select name="formation" defaultValue={defaultValue ?? ""} className={fieldClass}>
      <option value="">Aucune (tarif informatif)</option>
      {FORMATIONS.map((f) => (
        <option key={f.code} value={f.label}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

// Ligne de tarif éditable : modifier le libellé/montant/filière ou supprimer
export function TariffRow({
  id,
  label,
  amount,
  formation,
}: {
  id: string;
  label: string;
  amount: number;
  formation?: string | null;
}) {
  const [updateState, updateFormAction, updatePending] = useActionState(
    updateTariffAction,
    initialState,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteTariffAction,
    initialState,
  );
  const state = updateState.error || updateState.success ? updateState : deleteState;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <form action={updateFormAction} className="flex flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input
            name="label"
            type="text"
            required
            defaultValue={label}
            className={`min-w-48 flex-1 ${fieldClass}`}
          />
          <div className="flex items-center gap-1">
            <input
              name="amount"
              type="number"
              required
              min={0}
              step={1}
              defaultValue={amount}
              className={`w-32 text-right ${fieldClass}`}
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Ar</span>
          </div>
          <FormationSelect defaultValue={formation} />
          <button
            type="submit"
            disabled={updatePending}
            className="rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
          >
            {updatePending ? "..." : "Enregistrer"}
          </button>
        </form>
        <form
          action={deleteFormAction}
          onSubmit={(e) => {
            if (!window.confirm(`Supprimer le tarif « ${label} » ?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={deletePending}
            title="Supprimer ce tarif"
            className="flex items-center justify-center rounded-lg border border-red-200 px-2.5 py-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            {deletePending ? (
              <span className="text-xs font-semibold">...</span>
            ) : (
              <FaTrash size={13} />
            )}
          </button>
        </form>
      </div>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600 dark:text-green-400">{state.success}</p>}
    </div>
  );
}

export function AddTariffForm() {
  const [state, formAction, pending] = useActionState(addTariffAction, initialState);

  return (
    <div className="space-y-1">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          name="label"
          type="text"
          required
          placeholder="Libellé (ex : Droit d'inscription L1)"
          className={`min-w-48 flex-1 ${fieldClass}`}
        />
        <div className="flex items-center gap-1">
          <input
            name="amount"
            type="number"
            required
            min={0}
            step={1}
            placeholder="Montant"
            className={`w-32 text-right ${fieldClass}`}
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Ar</span>
        </div>
        <FormationSelect />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
        >
          {pending ? "..." : "+ Ajouter"}
        </button>
      </form>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600 dark:text-green-400">{state.success}</p>}
    </div>
  );
}
