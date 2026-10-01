import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { defaultEnrollmentYear, getStudentAverageForYear } from "@/lib/students";
import { hasTaskPermission, getUserFormation } from "@/lib/permissions";
import { AppShell } from "@/app/ui/app-shell";
import { ReenrollForm } from "./reenroll-form";
import { ShowMore } from "@/app/ui/show-more";
import { LIST_PAGE_SIZE, hasMore, moreHref, parseListLimit } from "@/lib/pagination";

export default async function ReinscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; limit?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) redirect("/");
  if (!(await hasTaskPermission(session.sub, session.role, "reinscription"))) {
    redirect("/agent-admin");
  }

  const { q, limit: limitParam } = await searchParams;
  const query = q?.trim();
  const limit = parseListLimit(limitParam);
  // Secrétaire de formation : réinscriptions limitées à sa formation
  const userFormation = await getUserFormation(session.sub, session.role);

  // Anciens étudiants éligibles : inscription finalisée (compte + année terminée)
  const where: Prisma.StudentWhereInput = {
      AND: [
        { status: "INSCRIT" },
        ...(userFormation
          ? [{ OR: [{ mention: userFormation }, { program: userFormation }] }]
          : []),
        ...(query
          ? [
              {
                OR: [
                  { fullName: { contains: query, mode: "insensitive" as const } },
                  { matricule: { contains: query, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
      ],
  };
  // Paginé côté base : la moyenne de chaque étudiant affiché coûte une requête
  // (voir plus bas), on ne la calcule donc que pour la tranche visible.
  const [students, totalStudents] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { fullName: "asc" },
      take: limit,
      include: {
        account: { select: { email: true } },
        enrollmentHistory: { orderBy: { archivedAt: "desc" }, select: { academicYear: true } },
      },
    }),
    prisma.student.count({ where }),
  ]);

  const defaultYear = defaultEnrollmentYear();
  const startYear = Number(defaultYear.split("-")[0]);
  const years = [defaultYear, `${startYear + 1}-${startYear + 2}`];
  const canForce = session.role === "SUPERADMIN";

  // Moyenne générale (S1+S2) de l'année en cours de chaque étudiant, pour
  // afficher l'éligibilité au passage avant même que l'agent ne tente de
  // réinscrire (voir ReenrollForm) — voir getStudentAverageForYear.
  const averages = new Map(
    await Promise.all(
      students.map(
        async (s) =>
          [s.id, s.academicYear ? await getStudentAverageForYear(s.id, s.academicYear) : null] as const,
      ),
    ),
  );

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
            Étudiants éligibles ({totalStudents})
          </h2>
          <form method="get" className="flex w-full items-center gap-2 sm:w-auto">
            <input
              name="q"
              type="search"
              defaultValue={q ?? ""}
              placeholder="Nom ou matricule..."
              className="w-full min-w-0 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 sm:w-56 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
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

        {totalStudents === 0 ? (
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
                  <th className="py-2.5 pr-4 font-semibold">Moyenne générale</th>
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
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      {averages.get(s.id) != null ? (
                        <span
                          className={
                            averages.get(s.id)! >= 10
                              ? "font-semibold text-emerald-700 dark:text-emerald-400"
                              : "font-semibold text-rose-700 dark:text-rose-400"
                          }
                        >
                          {averages.get(s.id)!.toFixed(2)}/20
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          S1/S2 incomplets
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
                        currentMention={s.mention ?? s.program}
                        average={averages.get(s.id) ?? null}
                        canForce={canForce}
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
        <ShowMore
          shown={students.length}
          total={totalStudents}
          href={moreHref("/agent-admin/reinscription", { q: query }, "limit", limit)}
          canLoadMore={hasMore(students.length, totalStudents, limit)}
          pageSize={LIST_PAGE_SIZE}
        />
      </section>
    </AppShell>
  );
}
