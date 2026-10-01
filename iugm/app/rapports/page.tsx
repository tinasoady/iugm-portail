import { redirect } from "next/navigation";
import { FaDownload, FaPrint } from "react-icons/fa";

import { getSession } from "@/lib/auth";
import { hasTaskPermission, getUserFormation } from "@/lib/permissions";
import { getSelectedAcademicYear } from "@/lib/academic-year";
import { getSelectedLevel } from "@/lib/level";
import { getFinancialReport, parseReportParams } from "@/lib/reports";
import { FORMATIONS } from "@/lib/formations";
import { LIST_PAGE_SIZE, hasMore, moreHref, parseListLimit } from "@/lib/pagination";
import { AppShell } from "@/app/ui/app-shell";
import { StatCard } from "@/app/ui/stat-card";
import { ShowMore } from "@/app/ui/show-more";
import { IconUsers, IconCash, IconClipboard, IconFolder } from "@/app/ui/icons";

const amountFormatter = new Intl.NumberFormat("fr-FR");
const ar = (value: number) => `${amountFormatter.format(value)} Ar`;

const DUE_STATUS_BADGE = {
  UNPAID:
    "rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  PARTIAL:
    "rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300",
} as const;
const DUE_STATUS_LABEL = { UNPAID: "Non payé", PARTIAL: "2e tranche due" } as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; limit?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) redirect("/");
  if (!(await hasTaskPermission(session.sub, session.role, "ecolage"))) redirect("/");

  const sp = await searchParams;
  const limit = parseListLimit(sp.limit);

  // Année et niveau : sélecteurs globaux de l'en-tête (comme le reste du site)
  const [selectedYear, selectedLevel, scopeFormation] = await Promise.all([
    getSelectedAcademicYear(),
    getSelectedLevel(),
    getUserFormation(session.sub, session.role),
  ]);
  const { formation } = parseReportParams({ f: sp.f }, FORMATIONS.map((f) => f.label));
  const effectiveFormation = scopeFormation ?? formation;

  const report = await getFinancialReport({
    academicYear: selectedYear,
    level: selectedLevel,
    formation,
    scopeFormation,
  });
  const visibleDue = report.dueStudents.slice(0, limit);

  const query = new URLSearchParams();
  if (selectedYear) query.set("year", selectedYear);
  if (selectedLevel) query.set("level", selectedLevel);
  if (effectiveFormation) query.set("f", effectiveFormation);
  const qs = query.toString() ? `?${query.toString()}` : "";

  const scope = [
    selectedYear ? `année ${selectedYear}` : "toutes années",
    selectedLevel ? `niveau ${selectedLevel}` : "tous niveaux",
    effectiveFormation ? `filière ${effectiveFormation}` : "toutes filières",
  ].join(" · ");

  const t = report.totals;

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="États récapitulatifs"
      active="/rapports"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{scope}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            L&apos;année et le niveau suivent les sélecteurs de l&apos;en-tête.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!scopeFormation && (
            <form method="get" className="flex items-center gap-2">
              <label htmlFor="f" className="sr-only">
                Filière
              </label>
              <select
                id="f"
                name="f"
                defaultValue={formation ?? ""}
                className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
              >
                <option value="">Toutes filières</option>
                {FORMATIONS.map((f) => (
                  <option key={f.label} value={f.label}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Appliquer
              </button>
            </form>
          )}
          <a
            href={`/rapports/imprimer${qs}`}
            className="flex items-center gap-1.5 rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <FaPrint size={12} aria-hidden="true" /> Version imprimable
          </a>
          <a
            href={`/api/reports/financial${qs}`}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            <FaDownload size={12} aria-hidden="true" /> Exporter (Excel)
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard
          label="Effectif"
          value={t.headcount}
          sublabel={`${t.enrolled} inscrit(s) · ${t.foreign} étranger(s)`}
          color="bg-indigo-600"
          icon={<IconUsers />}
        />
        <StatCard
          label="Encaissé"
          value={ar(t.collected)}
          sublabel="versements enregistrés"
          color="bg-emerald-600"
          icon={<IconCash />}
        />
        <StatCard
          label="Attendu"
          value={ar(t.expected)}
          sublabel="frais de formation annuels"
          color="bg-sky-600"
          icon={<IconClipboard />}
        />
        <StatCard
          label="Reste dû"
          value={ar(t.outstanding)}
          sublabel={`${t.unpaid} non payé(s) · ${t.partiallyPaid} partiel(s)`}
          color="bg-rose-600"
          icon={<IconFolder />}
        />
      </div>

      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Par filière et par niveau
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Mêmes règles que la Gestion d&apos;écolage : seuls comptent les versements de l&apos;année
          de rattachement du dossier ; le reste dû est le tarif annuel du niveau moins le déjà versé.
        </p>
        {report.rows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Aucun dossier pour cette sélection.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Effectifs et écolage par filière et niveau</caption>
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Filière</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Niveau</th>
                  <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Effectif</th>
                  <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Payé</th>
                  <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Partiel</th>
                  <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Non payé</th>
                  <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Versé</th>
                  <th scope="col" className="py-2.5 text-right font-semibold">Reste dû</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr
                    key={`${r.formation}|${r.level}`}
                    className="border-b border-black/5 dark:border-white/5"
                  >
                    <td className="py-2.5 pr-4 text-zinc-900 dark:text-zinc-50">{r.formation}</td>
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">{r.level}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{r.headcount}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{r.fullyPaid}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{r.partiallyPaid}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{r.unpaid}</td>
                    <td className="py-2.5 pr-4 text-right whitespace-nowrap tabular-nums">
                      {ar(r.collected)}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap tabular-nums font-medium text-rose-700 dark:text-rose-400">
                      {ar(r.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-zinc-900 dark:text-zinc-50">
                  <th scope="row" colSpan={2} className="py-2.5 pr-4 text-left">Total</th>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{t.headcount}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{t.fullyPaid}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{t.partiallyPaid}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{t.unpaid}</td>
                  <td className="py-2.5 pr-4 text-right whitespace-nowrap tabular-nums">{ar(t.collected)}</td>
                  <td className="py-2.5 text-right whitespace-nowrap tabular-nums">{ar(t.outstanding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {report.withoutLevel > 0 && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            {report.withoutLevel} dossier(s) sans niveau défini : comptés dans l&apos;effectif,
            absents de l&apos;attendu et du reste dû.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Écolage non soldé ({report.dueStudents.length})
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Classés du reste dû le plus élevé au plus faible. L&apos;export Excel contient toute la
          liste, avec les téléphones de l&apos;étudiant et de son responsable.
        </p>
        {report.dueStudents.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Tous les dossiers de cette sélection sont à jour.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Dossiers dont l&apos;écolage n&apos;est pas soldé</caption>
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Matricule</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Nom</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Filière / Niveau</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Situation</th>
                  <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Versé</th>
                  <th scope="col" className="py-2.5 text-right font-semibold">Reste dû</th>
                </tr>
              </thead>
              <tbody>
                {visibleDue.map((d) => (
                  <tr key={d.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {d.matricule}
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-900 dark:text-zinc-50">{d.fullName}</td>
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {d.formation} — {d.level}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={DUE_STATUS_BADGE[d.status]}>{DUE_STATUS_LABEL[d.status]}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-right whitespace-nowrap tabular-nums">{ar(d.paid)}</td>
                    <td className="py-2.5 text-right whitespace-nowrap tabular-nums font-medium">
                      {d.due === null ? "Niveau non défini" : ar(d.due)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ShowMore
          shown={visibleDue.length}
          total={report.dueStudents.length}
          href={moreHref("/rapports", { f: effectiveFormation ?? undefined }, "limit", limit)}
          canLoadMore={hasMore(visibleDue.length, report.dueStudents.length, limit)}
          pageSize={LIST_PAGE_SIZE}
        />
      </section>
    </AppShell>
  );
}
