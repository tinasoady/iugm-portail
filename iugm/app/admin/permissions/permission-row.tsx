"use client";

import { useActionState } from "react";
import {
  updateRoleAction,
  toggleActiveAction,
  resetPasswordAction,
  type PermissionState,
} from "./actions";

const ROLE_OPTIONS = [
  { value: "SUPERADMIN", label: "Super administrateur" },
  { value: "AGENT_ADMINISTRATION", label: "Agent d'administration" },
  { value: "AGENT_PEDAGOGIQUE", label: "Agent pédagogique" },
  { value: "ETUDIANT", label: "Étudiant" },
];

const initialState: PermissionState = {};

export function PermissionActions({
  userId,
  role,
  active,
  isSelf,
  email,
}: {
  userId: string;
  role: string;
  active: boolean;
  isSelf: boolean;
  email: string;
}) {
  const [roleState, roleFormAction, rolePending] = useActionState(updateRoleAction, initialState);
  const [activeState, activeFormAction, activePending] = useActionState(
    toggleActiveAction,
    initialState,
  );
  const [resetState, resetFormAction, resetPending] = useActionState(
    resetPasswordAction,
    initialState,
  );
  const state = [resetState, roleState, activeState].find((s) => s.error || s.success) ?? {};

  if (isSelf) {
    return (
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Votre propre compte — non modifiable ici.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Changement de rôle */}
        <form action={roleFormAction} className="flex items-center gap-1.5">
          <input type="hidden" name="userId" value={userId} />
          <select
            name="role"
            defaultValue={role}
            className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={rolePending}
            className="rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
          >
            {rolePending ? "..." : "Appliquer"}
          </button>
        </form>

        {/* Activation / désactivation */}
        <form
          action={activeFormAction}
          onSubmit={(e) => {
            if (
              active &&
              !window.confirm(`Désactiver le compte ${email} ? Il ne pourra plus se connecter.`)
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            disabled={activePending}
            className={
              active
                ? "rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                : "rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
            }
          >
            {activePending ? "..." : active ? "Désactiver" : "Réactiver"}
          </button>
        </form>

        {/* Réinitialisation du mot de passe */}
        <form
          action={resetFormAction}
          onSubmit={(e) => {
            if (!window.confirm(`Réinitialiser le mot de passe de ${email} ?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            disabled={resetPending}
            className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {resetPending ? "..." : "Réinit. mdp"}
          </button>
        </form>
      </div>

      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && (
        <p className="text-xs text-green-600 dark:text-green-400">{state.success}</p>
      )}
      {resetState.tempPassword && (
        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Mot de passe temporaire à transmettre :{" "}
          <span className="font-mono font-bold">{resetState.tempPassword}</span> (ne sera plus
          affiché)
        </p>
      )}
    </div>
  );
}
