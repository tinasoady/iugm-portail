import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { listSubjects } from "@/lib/subjects";
import { LEVELS } from "@/lib/level-shared";
import { AppShell } from "@/app/ui/app-shell";
import { CreateSubjectForm, DeleteSubjectButton, MandatoryToggle } from "./subject-forms";

export default async function AdminMatieresPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPERADMIN") redirect("/");

  const subjects = await listSubjects();

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
          Le catalogue n&apos;est alimenté que par le superadmin : pour chaque matière, indiquez
          le nom, la filière, le niveau et si elle est obligatoire ou facultative.
        </p>
        <CreateSubjectForm levels={LEVELS} />
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
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {[...byLevel.entries()].map(([level, list]) => (
                    <div
                      key={level}
                      className="rounded-xl border border-black/5 p-3 dark:border-white/10"
                    >
                      <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 dark:text-zinc-400">
                        {level}
                      </p>
                      <ul className="space-y-1.5">
                        {list.map((s) => (
                          <li
                            key={s.id}
                            className="flex items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                          >
                            <span className="flex items-center gap-2">
                              {s.name}
                              <MandatoryToggle id={s.id} mandatory={s.mandatory} />
                            </span>
                            <DeleteSubjectButton id={s.id} name={s.name} />
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
