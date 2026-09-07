"use client";

import { useActionState } from "react";
import { assignGradesAction, type AssignGradesState } from "./actions";

const initialState: AssignGradesState = {};

const fieldClass =
  "rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50";

const MANDATORY_BADGE =
  "rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
const OPTIONAL_BADGE =
  "rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";

export type SubjectForGrading = {
  id: string;
  name: string;
  mandatory: boolean;
  value: number | null;
};

// Saisie groupée des notes d'un étudiant, matière par matière, pour l'année
// et le semestre déjà sélectionnés (voir la barre de filtre GET au-dessus,
// dans page.tsx) — un champ laissé vide n'écrase pas une note existante.
export function NotesForm({
  studentId,
  academicYear,
  semester,
  subjects,
}: {
  studentId: string;
  academicYear: string;
  semester: string;
  subjects: SubjectForGrading[];
}) {
  const [state, formAction, pending] = useActionState(assignGradesAction, initialState);

  if (subjects.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Aucune matière n&apos;est encore enregistrée au catalogue pour la filière et le niveau de
        cet étudiant. Demandez au superadmin de l&apos;ajouter depuis Admin &gt; Matières.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="academicYear" value={academicYear} />
      <input type="hidden" name="semester" value={semester} />

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">Matière</th>
              <th className="py-2 pr-4 font-medium">Caractère</th>
              <th className="py-2 font-medium">Note /20</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{s.name}</td>
                <td className="py-2 pr-4">
                  <span className={s.mandatory ? MANDATORY_BADGE : OPTIONAL_BADGE}>
                    {s.mandatory ? "Obligatoire" : "Facultative"}
                  </span>
                </td>
                <td className="py-2">
                  <input
                    name={`note_${s.id}`}
                    type="number"
                    min={0}
                    max={20}
                    step="0.01"
                    defaultValue={s.value ?? ""}
                    placeholder="—"
                    className={`w-24 ${fieldClass}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "Enregistrement..." : "Enregistrer les notes"}
      </button>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && <p className="text-xs text-green-600 dark:text-green-400">{state.success}</p>}
    </form>
  );
}
