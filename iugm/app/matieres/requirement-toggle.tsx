"use client";

import { useActionState } from "react";
import { setSubjectMandatoryAction, type SubjectRequirementState } from "./actions";

const initialState: SubjectRequirementState = {};

const selectClass =
  "rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50";

// Bascule obligatoire/facultatif pour une matière : décision du secrétaire
// de formation ou de l'agent pédagogique, jamais du superadmin.
export function RequirementToggle({ id, mandatory }: { id: string; mandatory: boolean }) {
  const [state, formAction, pending] = useActionState(setSubjectMandatoryAction, initialState);

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={formAction}
        onChange={(e) => (e.currentTarget as HTMLFormElement).requestSubmit()}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="id" value={id} />
        <select name="mandatory" defaultValue={String(mandatory)} disabled={pending} className={selectClass}>
          <option value="true">Obligatoire</option>
          <option value="false">Facultative</option>
        </select>
      </form>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600 dark:text-green-400">{state.success}</p>}
    </div>
  );
}
