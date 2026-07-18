import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { defaultEnrollmentYear } from "@/lib/students";
import { hasTaskPermission } from "@/lib/permissions";
import { AppShell } from "@/app/ui/app-shell";
import { ReenrollForm } from "./reenroll-form";

export default async function ReinscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) redirect("/");
  if (!(await hasTaskPermission(session.sub, session.role, "reinscription"))) {
    redirect("/agent-admin");
  }

  const { q } = await searchParams;
  const query = q?.trim();

  // Anciens étudiants éligibles : inscription finalisée (compte + année terminée)
  const students = await prisma.student.findMany({
    where: {
      status: "INSCRIT",
      ...(query
        ? {
            OR: [
              { fullName: { contains: query, mode: "insensitive" } },
              { matricule: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { fullName: "asc" },
    include: {
      account: { select: { email: true } },
      enrollmentHistory: { orderBy: { archivedAt: "desc" }, select: { academicYear: true } },
    },
  });

  const defaultYear = defaultEnrollmentYear();
  const startYear = Number(defaultYear.split("-")[0]);
  const years = [defaultYear, `${startYear + 1}-${startYear + 2}`];

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Réinscription des anciens étudiants"
      active="/agent-admin/reinscription"
    >
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Étudiants éligibles ({students.length})
          </h2>
          <form method="get" className="flex items-center gap-2">
            <input
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Nom ou matricule..."
              className="w-56 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
            />
            <button
              type="submit"
              className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Rechercher
            </button>
          </form>
        </div>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          La réinscription conserve le matricule et le compte de l&apos;étudiant, archive
          l&apos;année écoulée, puis fait repartir le dossier au début du workflow : écolage à
          payer, reçu à vérifier, validations administrative et pédagogique.
        </p>

        {students.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {query
              ? `Aucun étudiant inscrit ne correspond à « ${query} ».`
              : "Aucun étudiant avec une inscription finalisée."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                  <th className="py-2.5 pr-4 font-semibold">Matricule</th>
                  <th className="py-2.5 pr-4 font-semibold">Nom</th>
                  <th className="py-2.5 pr-4 font-semibold">Année actuelle</th>
                  <th className="py-2.5 pr-4 font-semibold">Années passées</th>
                  <th className="py-2.5 font-semibold">Réinscrire pour</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-black/5 align-top last:border-0 dark:border-white/5"
                  >
                    <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {s.matricule}
                    </td>
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">{s.fullName}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {s.account?.email ?? "—"}
                      </p>
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {s.academicYear ?? "—"}
                      {(s.level ?? s.track) && (
                        <span className="block text-xs text-zinc-400 dark:text-zinc-500">
                          Niveau {s.level ?? s.track}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-zinc-500 dark:text-zinc-400">
                      {s.enrollmentHistory.length > 0
                        ? s.enrollmentHistory.map((h) => h.academicYear).join(", ")
                        : "—"}
                    </td>
                    <td className="py-2.5">
                      <ReenrollForm
                        studentId={s.id}
                        fullName={s.fullName}
                        currentLevel={s.level ?? s.track}
                        years={years}
                        defaultYear={
                          s.academicYear === defaultYear ? years[1] : defaultYear
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
