import { redirect } from "next/navigation";
import { FaLock } from "react-icons/fa";

import { getSession } from "@/lib/auth";
import { getUserFormation, hasTaskPermission } from "@/lib/permissions";
import { listSubjects } from "@/lib/subjects";
import { LEVELS } from "@/lib/level-shared";
import { AppShell } from "@/app/ui/app-shell";
import { CreateSubjectForm, DeleteSubjectButton, SubjectSettingsForm } from "./subject-forms";

export default async function AdminMatieresPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Superadmin, ou agent pédagogique ayant la tâche "matieres" — limité à
  // sa formation s'il en a une (voir app/admin/matieres/actions.ts)
  if (!["SUPERADMIN", "AGENT_PEDAGOGIQUE"].includes(session.role)) redirect("/");
  if (!(await hasTaskPermission(session.sub, session.role, "matieres"))) redirect("/");
  const userFormation = await getUserFormation(session.sub, session.role);

  const subjects = await listSubjects({ formation: userFormation });

  // Groupées par filière puis niveau pour une lecture rapide du catalogue
  const grouped = new Map<string, Map<string, typeof subjects>>();
  for (const s of subjects) {
    if (!grouped.has(s.formation)) grouped.set(s.formation, new Map());
    const byLevel = grouped.get(s.formation)!;
    if (!byLevel.has(s.level)) byLevel.set(s.level, []);
    byLevel.get(s.level)!.push(s);
  }

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Matières — Catalogue pédagogique"
      active="/admin/matieres"
    >
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Ajouter une matière
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Pour chaque matière, indiquez le nom, le niveau, la filière, le semestre et la façon
          dont sa note est calculée et compte dans la moyenne (coefficient, obligatoire ou
          facultative, part du contrôle continu, note éliminatoire).
        </p>
        {userFormation && (
          <p className="mb-4 flex w-fit items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            <FaLock size={12} /> Formation : {userFormation}
          </p>
        )}
        <CreateSubjectForm levels={LEVELS} lockedFormation={userFormation} />
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Calcul automatique des résultats
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          <li>
            La moyenne d&apos;un semestre est calculée dès que l&apos;agent pédagogique a saisi les
            notes de <strong>toutes les matières obligatoires</strong> de ce semestre ; la mention
            en découle (Passable à partir de 10, Assez bien 12, Bien 14, Très bien 16).
          </li>
          <li>
            <strong>Note de la matière</strong> : note unique, ou, si une part de contrôle continu
            est fixée (ex. 40 %), CC × 40 % + examen × 60 % — l&apos;agent saisit alors les deux
            notes.
          </li>
          <li>
            <strong>Matière obligatoire</strong> : note × coefficient, coefficient compté au
            dénominateur.
          </li>
          <li>
            <strong>Matière facultative (bonus)</strong> : seuls les points au-delà du seuil
            (10 par défaut) comptent, multipliés par le coefficient, sans alourdir le
            dénominateur. Une note sous le seuil ne fait jamais baisser la moyenne.
          </li>
          <li className="font-mono">
            moyenne = (Σ note × coef + Σ bonus × coef) ÷ Σ coef des obligatoires (20 au plus)
          </li>
          <li>
            <strong>Note éliminatoire</strong> (facultatif, matières obligatoires) : une note
            strictement inférieure fait échouer le semestre, quelle que soit la moyenne, et
            bloque l&apos;admission et le passage au niveau supérieur.
          </li>
          <li>
            Modifier les paramètres d&apos;une matière recalcule les moyennes déjà obtenues avec
            ses notes.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Catalogue ({subjects.length})
        </h2>

        {grouped.size === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Aucune matière enregistrée pour le moment.
          </p>
        ) : (
          <div className="space-y-6">
            {[...grouped.entries()].map(([formation, byLevel]) => (
              <div key={formation}>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {formation}
                </h3>
                <div className="grid gap-4 xl:grid-cols-2">
                  {[...byLevel.entries()].map(([level, list]) => (
                    <div
                      key={level}
                      className="rounded-xl border border-black/5 p-3 dark:border-white/10"
                    >
                      <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 dark:text-zinc-400">
                        {level}
                      </p>
                      <ul className="divide-y divide-black/5 dark:divide-white/10">
                        {list.map((s) => (
                          <li
                            key={s.id}
                            className="space-y-1.5 py-2 text-sm text-zinc-700 first:pt-0 last:pb-0 dark:text-zinc-300"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{s.name}</span>
                              <DeleteSubjectButton id={s.id} name={s.name} />
                            </div>
                            <SubjectSettingsForm
                              id={s.id}
                              name={s.name}
                              semester={s.semester}
                              coefficient={s.coefficient}
                              mandatory={s.mandatory}
                              bonusThreshold={s.bonusThreshold}
                              ccWeight={s.ccWeight}
                              eliminationThreshold={s.eliminationThreshold}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
