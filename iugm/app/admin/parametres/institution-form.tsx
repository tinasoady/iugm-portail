"use client";

import { useActionState } from "react";
import { saveInstitutionAction, type SettingsState } from "./actions";

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";

const initialState: SettingsState = {};

export function InstitutionForm({ settings }: { settings: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(saveInstitutionAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <div>
          <label className={labelClass} htmlFor="institutionName">Nom de l&apos;établissement *</label>
          <input
            id="institutionName"
            name="institutionName"
            type="text"
            required
            defaultValue={settings.institutionName ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="institutionAcronym">Sigle *</label>
          <input
            id="institutionAcronym"
            name="institutionAcronym"
            type="text"
            required
            defaultValue={settings.institutionAcronym ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="address">Adresse</label>
          <input id="address" name="address" type="text" defaultValue={settings.address ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="city">Ville</label>
          <input id="city" name="city" type="text" defaultValue={settings.city ?? ""} className={inputClass} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="phone">Téléphone</label>
          <input id="phone" name="phone" type="tel" defaultValue={settings.phone ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" defaultValue={settings.email ?? ""} className={inputClass} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="website">Site web</label>
          <input
            id="website"
            name="website"
            type="url"
            placeholder="https://..."
            defaultValue={settings.website ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="slogan">Devise / slogan</label>
          <input id="slogan" name="slogan" type="text" defaultValue={settings.slogan ?? ""} className={inputClass} />
        </div>
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

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
      >
        {pending ? "Enregistrement..." : "Enregistrer les informations"}
      </button>
    </form>
  );
}
