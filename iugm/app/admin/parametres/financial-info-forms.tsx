"use client";

import { useActionState } from "react";
import { updateLevelFinancialInfoAction, type SettingsState } from "./actions";
import type { LevelFinancialInfoView } from "@/lib/finance";

const fieldClass =
  "w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-right text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-xs font-medium text-zinc-500 dark:text-zinc-400";

const initialState: SettingsState = {};

function AmountField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number;
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={name}>
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1">
        <input
          id={name}
          name={name}
          type="number"
          required
          min={0}
          step={1}
          defaultValue={defaultValue}
          className={fieldClass}
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Ar</span>
      </div>
    </div>
  );
}

// Un formulaire par niveau : les 8 montants (droit d'inscription, assurance,
// polo, frais de formation, premier versement — local/étranger) enregistrés
// en un seul « Enregistrer ».
export function FinancialInfoForm({ info }: { info: LevelFinancialInfoView }) {
  const [state, formAction, pending] = useActionState(updateLevelFinancialInfoAction, initialState);

  return (
    <form
      action={formAction}
      className="rounded-xl border border-black/5 p-4 dark:border-white/10"
    >
      <input type="hidden" name="level" value={info.level} />
      <h3 className="mb-3 text-sm font-bold text-zinc-900 dark:text-zinc-50">{info.level}</h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AmountField
          name="inscriptionLocal"
          label="Droit d'inscription — local"
          defaultValue={info.inscriptionLocal}
        />
        <AmountField
          name="inscriptionForeign"
          label="Droit d'inscription — étranger"
          defaultValue={info.inscriptionForeign}
        />
        <AmountField name="insurance" label="Assurance" defaultValue={info.insurance} />
        <AmountField
          name="polo"
          label="Polo (optionnel pour un ancien étudiant)"
          defaultValue={info.polo}
        />
        <AmountField
          name="tuitionLocal"
          label="Frais de formation annuel — local"
          defaultValue={info.tuitionLocal}
        />
        <AmountField
          name="tuitionForeign"
          label="Frais de formation annuel — étranger"
          defaultValue={info.tuitionForeign}
        />
        <AmountField
          name="firstPaymentLocal"
          label="Premier versement — local"
          defaultValue={info.firstPaymentLocal}
        />
        <AmountField
          name="firstPaymentForeign"
          label="Premier versement — étranger"
          defaultValue={info.firstPaymentForeign}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "..." : "Enregistrer"}
        </button>
        {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
        {state.success && (
          <p className="text-xs text-green-600 dark:text-green-400">{state.success}</p>
        )}
      </div>
    </form>
  );
}
