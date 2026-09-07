import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { hasTaskPermission, getUserFormation } from "@/lib/permissions";
import { listSubjects } from "@/lib/subjects";
import { AppShell } from "@/app/ui/app-shell";
import { RequirementToggle } from "./requirement-toggle";

export default async function MatieresPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) {
    redirect("/");
  }
  if (!(await hasTaskPermission(session.sub, session.role, "matieres"))) {
    redirect("/");
  }

  const userFormation = await getUserFormation(session.sub, session.role);
  const subjects = await listSubjects(userFormation ? { formation: userFormation } : {});

  // Groupées par filière puis niveau
  const grouped = new Map<string, Map<string, typeof subjects>>();
  for (const s of subjects) {
    if (!grouped.has(s.formation)) grouped.set(s.formation, new Map());
    const byLevel = grouped.get(s.formation)!;
    if (!byLevel.has(s.level)) byLevel.set(s.level, []);
    byLevel.get(s.level)!.push(s);
  }

  return (
    <AppShell email={session.email} role={session.role} title="Matières" active="/matieres">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Obligatoire ou facultative ({subjects.length})
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Le catalogue des matières (nom, filière, niveau) est alimenté par le superadmin. Ici,
          déclarez chaque matière obligatoire ou facultative pour la filière et le niveau
          concernés — cette information conditionne uniquement l&apos;organisation pédagogique, pas
          la possibilité d&apos;y assigner une note.
        </p>

        {grouped.size === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {userFormation
              ? `Aucune matière enregistrée pour la filière ${userFormation}. Demandez au superadmin de l'ajouter au catalogue.`
              : "Aucune matière enregistrée dans le catalogue."}
          </p>
        ) : (
          <div className="space-y-6">
            {[...grouped.entries()].map(([formation, byLevel]) => (
              <div key={formation}>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {formation}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-black/10 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                        <th className="py-2 pr-4 font-medium">Niveau</th>
                        <th className="py-2 pr-4 font-medium">Matière</th>
                        <th className="py-2 font-medium">Caractère</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...byLevel.entries()].flatMap(([level, list]) =>
                        list.map((s, i) => (
                          <tr
                            key={s.id}
                            className="border-b border-black/5 last:border-0 dark:border-white/5"
                          >
                            <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                              {i === 0 ? level : ""}
                            </td>
                            <td className="py-2.5 pr-4 text-zinc-900 dark:text-zinc-50">
                              {s.name}
                            </td>
                            <td className="py-2.5">
                              <RequirementToggle id={s.id} mandatory={s.mandatory} />
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
