"use client";

import { useActionState } from "react";
import { updateTasksAction, deleteUserAction, type PermissionState } from "./actions";

const initialState: PermissionState = {};

// Attribution des tâches d'un agent : deux agents du même rôle peuvent avoir
// des permissions différentes (secrétaire, chef de scolarité, resp. finance...)
export function TaskPermissionsForm({
  userId,
  jobTitle,
  permissions,
  tasks,
}: {
  userId: string;
  jobTitle?: string | null;
  permissions: string[];
  tasks: Array<{ key: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState(updateTasksAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="jobTitle"
        type="text"
        defaultValue={jobTitle ?? ""}
        placeholder="Fonction (ex : Secrétaire, Chef de scolarité, Resp. finance...)"
        className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
      />
      <div className="space-y-1">
        {tasks.map((t) => (
          <label
            key={t.key}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-black/5 px-2.5 py-1.5 text-xs text-zinc-700 transition has-checked:border-indigo-400 has-checked:bg-indigo-50/60 dark:border-white/10 dark:text-zinc-300 dark:has-checked:border-indigo-600 dark:has-checked:bg-indigo-950/40"
          >
            <input
              type="checkbox"
              name={`task_${t.key}`}
              defaultChecked={permissions.includes(t.key)}
              className="mt-0.5 h-3.5 w-3.5 accent-indigo-600"
            />
            {t.label}
          </label>
        ))}
      </div>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600 dark:text-green-400">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-linear-to-r from-indigo-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
      >
        {pending ? "..." : "Enregistrer les tâches"}
      </button>
    </form>
  );
}

export function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  const [state, formAction, pending] = useActionState(deleteUserAction, initialState);

  return (
    <div>
      <form
        action={formAction}
        onSubmit={(e) => {
          if (
            !window.confirm(
              `Supprimer définitivement le compte ${email} ?\nCette action est irréversible.`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          {pending ? "..." : "🗑 Supprimer le compte"}
        </button>
      </form>
      {state.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
