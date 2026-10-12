"use client";

import { useActionState } from "react";
import { assignGradesAction, type AssignGradesState } from "./actions";
import { computeSemesterAverage, semesterMention } from "@/lib/grading";
import { MENTION_BADGE_CLASSES, MENTION_LABELS } from "@/app/ui/student-status";

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
  coefficient: number;
  bonusThreshold: number;
  ccWeight: number; // part du contrôle continu en % (0 = note unique)
  eliminationThreshold: number | null;
  value: number | null; // note de la matière (calculée si CC + examen)
  ccValue: number | null;
  examValue: number | null;
};

// Saisie groupée des notes d'un étudiant, matière par matière, pour l'année
// et le semestre déjà sélectionnés (voir la barre de filtre GET au-dessus,
// dans page.tsx) — un champ laissé vide n'écrase pas une note existante.
// Sous le tableau : la moyenne du semestre, calculée à partir des notes
// enregistrées selon les paramètres des matières (lib/grading.ts).
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
        Aucune matière n&apos;est enregistrée au catalogue pour la filière, le niveau et le
        semestre de cet étudiant. Elle s&apos;ajoute depuis Matières (catalogue), par le
        superadmin ou un agent autorisé.
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
              <th scope="col" className="py-2 pr-4 font-medium">Matière</th>
              <th scope="col" className="py-2 pr-4 font-medium">Caractère</th>
              <th scope="col" className="py-2 pr-4 font-medium">Coef.</th>
              <th scope="col" className="py-2 font-medium">Note /20</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">{s.name}</td>
                <td className="py-2 pr-4">
                  <span className={s.mandatory ? MANDATORY_BADGE : OPTIONAL_BADGE}>
                    {s.mandatory ? "Obligatoire" : `Bonus au-delà de ${s.bonusThreshold}`}
                  </span>
                  {s.mandatory && s.eliminationThreshold !== null && (
                    <span className="mt-1 block text-[11px] text-rose-600 dark:text-rose-400">
                      Éliminatoire sous {s.eliminationThreshold}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{s.coefficient}</td>
                <td className="py-2">
                  {s.ccWeight > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <label className="flex items-center gap-1">
                        CC ({s.ccWeight} %)
                        <input
                          aria-label={`Contrôle continu de ${s.name} (sur 20)`}
                          name={`cc_${s.id}`}
                          type="number"
                          min={0}
                          max={20}
                          step="0.01"
                          defaultValue={s.ccValue ?? ""}
                          placeholder="—"
                          className={`w-20 ${fieldClass}`}
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        Examen ({100 - s.ccWeight} %)
                        <input
                          aria-label={`Examen de ${s.name} (sur 20)`}
                          name={`exam_${s.id}`}
                          type="number"
                          min={0}
                          max={20}
                          step="0.01"
                          defaultValue={s.examValue ?? ""}
                          placeholder="—"
                          className={`w-20 ${fieldClass}`}
                        />
                      </label>
                      {s.value !== null && (
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                          = {s.value}/20
                        </span>
                      )}
                    </div>
                  ) : (
                    <input
                      aria-label={`Note de ${s.name} (sur 20)`}
                      name={`note_${s.id}`}
                      type="number"
                      min={0}
                      max={20}
                      step="0.01"
                      defaultValue={s.value ?? ""}
                      placeholder="—"
                      className={`w-24 ${fieldClass}`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SemesterAverage semester={semester} subjects={subjects} />

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

// Moyenne du semestre telle qu'elle est enregistrée (mêmes règles que
// recomputeSemesterResult côté serveur), ou ce qui manque pour la calculer
function SemesterAverage({
  semester,
  subjects,
}: {
  semester: string;
  subjects: SubjectForGrading[];
}) {
  const computation = computeSemesterAverage(subjects);
  const boxClass =
    "rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/10";

  if (computation.status === "no_mandatory") {
    return (
      <p className={`${boxClass} text-zinc-500 dark:text-zinc-400`}>
        Aucune matière obligatoire pour ce semestre : la moyenne ne peut pas être calculée.
      </p>
    );
  }
  if (computation.status === "incomplete") {
    return (
      <p className={`${boxClass} text-zinc-600 dark:text-zinc-400`}>
        Moyenne {semester} calculée automatiquement une fois toutes les matières obligatoires
        notées. Manquantes : {computation.missing.join(", ")}.
      </p>
    );
  }
  const eliminated = computation.eliminatedBy.length > 0;
  const mention = semesterMention(computation.average, eliminated);
  return (
    <p className={`${boxClass} flex flex-wrap items-center gap-2 text-zinc-900 dark:text-zinc-50`}>
      <span>
        Moyenne {semester} : <strong>{computation.average.toFixed(2)}/20</strong>
      </span>
      <span className={MENTION_BADGE_CLASSES[mention]}>{MENTION_LABELS[mention] ?? mention}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        Σ coef. {computation.totalCoefficients}
        {computation.bonusPoints > 0 ? ` — bonus +${computation.bonusPoints} pts` : ""}
      </span>
      {eliminated && (
        <span className="w-full text-xs text-rose-600 dark:text-rose-400">
          Semestre non validé : note éliminatoire en {computation.eliminatedBy.join(", ")}.
        </span>
      )}
    </p>
  );
}
