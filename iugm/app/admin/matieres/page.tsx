import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { listSubjects } from "@/lib/subjects";
import { FORMATIONS } from "@/lib/formations";
import { LEVELS } from "@/lib/level-shared";
import { AppShell } from "@/app/ui/app-shell";
import { CreateSubjectForm, DeleteSubjectButton } from "./subject-forms";

const MANDATORY_BADGE =
  "rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
const OPTIONAL_BADGE =
  "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";

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
          Le catalogue (nom, filière, niveau) n&apos;est alimenté que par le superadmin. Le
          caractère obligatoire ou facultatif d&apos;une matière est ensuite décidé par le
          secrétaire de formation ou l&apos;agent pédagogique, depuis la page{" "}
          <span className="font-medium">Matières</span> de leur espace.
        </p>
        <CreateSubjectForm formations={FORMATIONS.map((f) => f.label)} levels={LEVELS} />
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
                              <span className={s.mandatory ? MANDATORY_BADGE : OPTIONAL_BADGE}>
                                {s.mandatory ? "Obligatoire" : "Facultative"}
                              </span>
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
