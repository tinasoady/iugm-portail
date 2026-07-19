import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { searchStudents, listInscrits, getFilterOptions } from "@/lib/students";
import { getUserFormation } from "@/lib/permissions";
import { AppShell } from "@/app/ui/app-shell";
import { StatCard } from "@/app/ui/stat-card";
import { IconClipboard, IconCap, IconChart, IconFolder } from "@/app/ui/icons";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASSES,
  MENTION_LABELS,
  MENTION_BADGE_CLASSES,
} from "@/app/ui/student-status";
import { ValidatePedagoButton } from "./validate-button";
import { AssignResultForm } from "./assign-result-form";

const selectClass =
  "rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50";

// Année universitaire par défaut : bascule au 1er septembre
function currentAcademicYear(): string {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

export default async function AgentPedagogiquePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    qi?: string;
    program?: string;
    department?: string;
    mention?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) redirect("/");

  const { q, qi, program, department, mention } = await searchParams;

  // Secrétaire de formation : tout est limité à sa formation, côté serveur
  const userFormation = await getUserFormation(session.sub, session.role);
  const [allStudents, inscrits, filterOptions, statusCounts, resultCount] = await Promise.all([
    searchStudents(q, userFormation),
    listInscrits({ q: qi, program, department, mention }, userFormation),
    getFilterOptions(),
    prisma.student.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.academicResult.count(),
  ]);
  const countOf = (status: string) =>
    statusCounts.find((s) => s.status === status)?._count._all ?? 0;

  // Dossiers validés par l'agent d'administration, en attente de validation pédagogique
  const pending = allStudents.filter((s) => s.status === "ADMIN_VALIDEE");
  // Dossiers encore en amont du workflow (consultation)
  const upstream = allStudents.filter((s) =>
    ["ENREGISTRE", "PAIEMENT_VERIFIE"].includes(s.status),
  );
  const defaultYear = currentAcademicYear();

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Pédagogie — Agent pédagogique"
      active="/agent-pedagogique"
    >
        {/* Cartes statistiques */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="À valider"
            value={pending.length}
            sublabel="inscriptions administratives validées"
            gradient="from-amber-400 to-orange-500"
            icon={<IconClipboard />}
          />
          <StatCard
            label="Inscrits"
            value={countOf("INSCRIT")}
            sublabel="étudiants avec compte actif"
            gradient="from-emerald-500 to-teal-600"
            icon={<IconCap />}
          />
          <StatCard
            label="Résultats assignés"
            value={resultCount}
            sublabel="moyennes enregistrées"
            gradient="from-sky-500 to-blue-600"
            icon={<IconChart />}
          />
          <StatCard
            label="Dossiers en cours"
            value={countOf("ENREGISTRE") + countOf("PAIEMENT_VERIFIE")}
            sublabel="en amont du workflow"
            gradient="from-violet-500 to-purple-600"
            icon={<IconFolder />}
          />
        </div>

        {/* 1. Dossiers à valider */}
        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Inscriptions à valider ({pending.length})
          </h2>
          <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
            Dossiers dont l&apos;inscription administrative est déjà validée. La validation
            pédagogique crée automatiquement le compte étudiant (email pro + mot de passe).
          </p>

          {pending.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Aucun dossier en attente de validation pédagogique.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                    <th className="py-2 pr-4 font-medium">Matricule</th>
                    <th className="py-2 pr-4 font-medium">Nom</th>
                    <th className="py-2 pr-4 font-medium">Filière / Niveau</th>
                    <th className="py-2 pr-4 font-medium">Reçu bancaire</th>
                    <th className="py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((s) => (
                    <tr key={s.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                      <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {s.matricule}
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-900 dark:text-zinc-50">{s.fullName}</td>
                      <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                        {[s.program, s.level ?? s.track].filter(Boolean).join(" — ") || "—"}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {s.receiptNumber ?? "—"}
                      </td>
                      <td className="py-2.5">
                        <ValidatePedagoButton studentId={s.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 2. Étudiants inscrits : reçus, résultats, listes filtrées */}
        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Étudiants inscrits ({inscrits.length})
          </h2>
          <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
            Impression du reçu d&apos;inscription, assignation des résultats académiques (la
            mention est calculée automatiquement) et listes par mention, filière ou département.
          </p>

          <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
            <input
              name="qi"
              type="search"
              defaultValue={qi ?? ""}
              placeholder="Nom ou matricule..."
              className={`w-44 ${selectClass}`}
            />
            <select name="program" defaultValue={program ?? ""} className={selectClass}>
              <option value="">Toutes filières</option>
              {filterOptions.programs.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select name="department" defaultValue={department ?? ""} className={selectClass}>
              <option value="">Tous départements</option>
              {filterOptions.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select name="mention" defaultValue={mention ?? ""} className={selectClass}>
              <option value="">Toutes mentions</option>
              {Object.entries(MENTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Filtrer
            </button>
          </form>

          {inscrits.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Aucun étudiant inscrit ne correspond à ces critères.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                    <th className="py-2 pr-4 font-medium">Matricule</th>
                    <th className="py-2 pr-4 font-medium">Nom</th>
                    <th className="py-2 pr-4 font-medium">Filière / Niveau / Dépt</th>
                    <th className="py-2 pr-4 font-medium">Résultats</th>
                    <th className="py-2 pr-4 font-medium">Assigner un résultat</th>
                    <th className="py-2 font-medium">Reçu</th>
                  </tr>
                </thead>
                <tbody>
                  {inscrits.map((s) => (
                    <tr key={s.id} className="border-b border-black/5 last:border-0 align-top dark:border-white/5">
                      <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {s.matricule}
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-900 dark:text-zinc-50">{s.fullName}</td>
                      <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                        {[s.program, s.level ?? s.track].filter(Boolean).join(" — ") || "—"}
                        {s.department ? ` (${s.department})` : ""}
                      </td>
                      <td className="py-2.5 pr-4">
                        {s.results.length === 0 ? (
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">Aucun</span>
                        ) : (
                          <ul className="space-y-1">
                            {s.results.map((r) => (
                              <li key={r.id} className="whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
                                {r.academicYear} {r.semester} : {r.average}/20{" "}
                                <span className={MENTION_BADGE_CLASSES[r.mention]}>
                                  {MENTION_LABELS[r.mention] ?? r.mention}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <AssignResultForm studentId={s.id} defaultYear={defaultYear} />
                      </td>
                      <td className="py-2.5">
                        <a
                          href={`/agent-pedagogique/recu/${s.id}`}
                          className="whitespace-nowrap rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                          🖨 Reçu
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 3. Dossiers en cours (consultation) */}
        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Dossiers en cours ({upstream.length})
            </h2>
            <form method="get" className="flex items-center gap-2">
              <input
                name="q"
                type="search"
                defaultValue={q ?? ""}
                placeholder="Nom, matricule, filière..."
                className={`w-56 ${selectClass}`}
              />
              <button
                type="submit"
                className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Rechercher
              </button>
            </form>
          </div>

          {upstream.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {q ? `Aucun dossier en cours ne correspond à « ${q} ».` : "Aucun dossier en cours."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                    <th className="py-2 pr-4 font-medium">Matricule</th>
                    <th className="py-2 pr-4 font-medium">Nom</th>
                    <th className="py-2 pr-4 font-medium">Filière / Niveau</th>
                    <th className="py-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {upstream.map((s) => (
                    <tr key={s.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                      <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {s.matricule}
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-900 dark:text-zinc-50">{s.fullName}</td>
                      <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                        {[s.program, s.level ?? s.track].filter(Boolean).join(" — ") || "—"}
                      </td>
                      <td className="py-2.5">
                        <span className={STATUS_BADGE_CLASSES[s.status]}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </span>
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
