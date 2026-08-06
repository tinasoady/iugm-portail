import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getEcolageStats, listStudentsWithBalanceDue } from "@/lib/students";
import { getEcolageRevenueTrend } from "@/lib/dashboard";
import { hasTaskPermission } from "@/lib/permissions";
import { getSelectedAcademicYear } from "@/lib/academic-year";
import { getSelectedLevel } from "@/lib/level";
import { AppShell } from "@/app/ui/app-shell";
import { StatCard } from "@/app/ui/stat-card";
import { Donut } from "@/app/ui/donut";
import { LineChart } from "@/app/ui/line-chart";
import { IconUsers, IconCash, IconClipboard, IconFolder } from "@/app/ui/icons";
import { FaCheck, FaTimes, FaHourglassHalf } from "react-icons/fa";
import { Tranche2Form } from "./tranche2-form";

const amountFormatter = new Intl.NumberFormat("fr-FR");

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

// Couleurs de statut réservées (voir app/ui/student-status.ts) : émeraude =
// bon (payé intégralement), ambre = attention (partiel), rose = plus urgent
// (rien payé). Toujours accompagnées de libellés/effectifs, jamais la
// couleur seule.
function PaymentMeter({
  full,
  partial,
  unpaid,
  height = "h-5",
}: {
  full: number;
  partial: number;
  unpaid: number;
  height?: string;
}) {
  const total = full + partial + unpaid;
  if (total === 0) {
    return <div className={`${height} w-full rounded-full bg-zinc-100 dark:bg-zinc-800`} />;
  }
  const segments = [
    { value: full, className: "bg-emerald-600 dark:bg-emerald-500", label: "Payé intégralement" },
    { value: partial, className: "bg-amber-500 dark:bg-amber-400", label: "Partiel (2e tranche due)" },
    { value: unpaid, className: "bg-rose-600 dark:bg-rose-500", label: "Non payé" },
  ].filter((s) => s.value > 0);
  return (
    <div className={`flex ${height} w-full gap-0.5 overflow-hidden rounded-full`}>
      {segments.map((s, i) => (
        <div
          key={s.label}
          className={`${i === 0 ? "rounded-l-full " : ""}${i === segments.length - 1 ? "rounded-r-full " : ""}${s.className}`}
          style={{ width: `${(s.value / total) * 100}%` }}
          title={`${s.label} : ${s.value}`}
        />
      ))}
    </div>
  );
}

const DUE_STATUS_BADGE: Record<"UNPAID" | "PARTIAL", string> = {
  UNPAID:
    "rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  PARTIAL:
    "rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};
const DUE_STATUS_LABEL: Record<"UNPAID" | "PARTIAL", string> = {
  UNPAID: "Non payé",
  PARTIAL: "2e tranche due",
};

export default async function EcolagePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) redirect("/");
  if (!(await hasTaskPermission(session.sub, session.role, "ecolage"))) redirect("/agent-admin");

  // Année universitaire et niveau pilotés par les sélecteurs globaux de l'en-tête
  const [year, level] = await Promise.all([getSelectedAcademicYear(), getSelectedLevel()]);
  const [stats, due, revenueTrend] = await Promise.all([
    getEcolageStats(year ?? undefined, level ?? undefined),
    listStudentsWithBalanceDue(year ?? undefined, level ?? undefined),
    getEcolageRevenueTrend({ academicYear: year, level }),
  ]);
  const fullPct = pct(stats.full, stats.total);
  const partialPct = pct(stats.partial, stats.total);
  const unpaidPct = pct(stats.unpaid, stats.total);

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Gestion d'écolage"
      active="/agent-admin/ecolage"
    >
      {/* Cartes statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Dossiers étudiants"
          value={stats.total}
          sublabel={year ? `année ${year}` : "toutes années confondues"}
          color="bg-indigo-600"
          icon={<IconUsers />}
        />
        <StatCard
          label="Payé intégralement"
          value={`${fullPct}%`}
          sublabel={`${stats.full} étudiant(s) — totalité ou 2 tranches`}
          color="bg-emerald-600"
          icon={<IconCash />}
        />
        <StatCard
          label="Paiement partiel"
          value={`${partialPct}%`}
          sublabel={`${stats.partial} étudiant(s) — 2e tranche due`}
          color="bg-amber-500"
          icon={<IconFolder />}
        />
        <StatCard
          label="Non payé"
          value={`${unpaidPct}%`}
          sublabel={`${stats.unpaid} étudiant(s) en attente`}
          color="bg-rose-600"
          icon={<IconClipboard />}
        />
      </div>

      {/* Cercle statistique + légende */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Répartition des paiements
        </h2>
        {stats.total === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Aucun dossier pour cette sélection.
          </p>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,300px)_1fr] lg:items-start">
            <div className="flex flex-col items-center gap-6">
              <Donut
                segments={[
                  { value: stats.full, className: "stroke-emerald-600 dark:stroke-emerald-500" },
                  { value: stats.partial, className: "stroke-amber-500 dark:stroke-amber-400" },
                  { value: stats.unpaid, className: "stroke-rose-600 dark:stroke-rose-500" },
                ]}
                centerValue={`${fullPct}%`}
                centerLabel="payé"
                size={140}
              />

              {/* Légende détaillée */}
              <div className="w-full space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-black/5 p-3 dark:border-white/10">
                  <span className="h-4 w-4 shrink-0 rounded bg-emerald-600 dark:bg-emerald-500" />
                  <div className="flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      <FaCheck size={11} /> Payé intégralement
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {stats.full} étudiant(s) — totalité ou 2 tranches versées
                    </p>
                  </div>
                  <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                    {fullPct}%
                  </span>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-black/5 p-3 dark:border-white/10">
                  <span className="h-4 w-4 shrink-0 rounded bg-amber-500 dark:bg-amber-400" />
                  <div className="flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      <FaHourglassHalf size={11} /> Paiement partiel
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {stats.partial} étudiant(s) — 1ère tranche versée, 2e due
                    </p>
                  </div>
                  <span className="text-lg font-bold text-amber-700 dark:text-amber-400">
                    {partialPct}%
                  </span>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-black/5 p-3 dark:border-white/10">
                  <span className="h-4 w-4 shrink-0 rounded bg-rose-600 dark:bg-rose-500" />
                  <div className="flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      <FaTimes size={11} /> Non payé
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {stats.unpaid} étudiant(s) sans aucun versement
                    </p>
                  </div>
                  <span className="text-lg font-bold text-rose-700 dark:text-rose-400">
                    {unpaidPct}%
                  </span>
                </div>

                <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Total : {stats.total} dossier(s)
                  {year ? ` — année universitaire ${year}` : " — toutes années confondues"}
                </p>
              </div>
            </div>

            {/* Évolution de l'encaissement face au budget prévu */}
            <div>
              <h3 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Évolution de l&apos;encaissement et du budget
              </h3>
              <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                Montant cumulé encaissé (Ar) au fil des mois, comparé au budget total prévu pour
                cette sélection ({amountFormatter.format(revenueTrend.budget)} Ar).
              </p>
              <LineChart
                height={220}
                labels={revenueTrend.monthLabels}
                series={[
                  {
                    key: "collected",
                    label: "Encaissé (cumulé)",
                    color: "#1baf7a",
                    darkColor: "#199e70",
                    values: revenueTrend.collected,
                  },
                  {
                    key: "budget",
                    label: "Budget prévu",
                    color: "#eb6834",
                    darkColor: "#d95926",
                    values: revenueTrend.months.map(() => revenueTrend.budget),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </section>

      {/* Répartition par formation */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Paiements par formation
        </h2>
        {stats.byFormation.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Aucune donnée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                  <th className="py-2.5 pr-4 font-semibold">Formation</th>
                  <th className="py-2.5 pr-4 font-semibold">Intégral / Partiel / Non payé</th>
                  <th className="py-2.5 pr-4 font-semibold">Taux</th>
                  <th className="w-1/3 py-2.5 font-semibold">Progression</th>
                </tr>
              </thead>
              <tbody>
                {stats.byFormation.map((f) => (
                  <tr
                    key={f.formation}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-2.5 pr-4 font-medium text-zinc-900 dark:text-zinc-50">
                      {f.formation}
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {f.full} / {f.partial} / {f.unpaid}{" "}
                      <span className="text-zinc-400 dark:text-zinc-500">(sur {f.total})</span>
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-zinc-900 dark:text-zinc-50">
                      {pct(f.full, f.total)}%
                    </td>
                    <td className="py-2.5">
                      <PaymentMeter full={f.full} partial={f.partial} unpaid={f.unpaid} height="h-2.5" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Liste de relance */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Écolage non soldé ({due.length})
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          « Non payé » : enregistrez la 1ère tranche ou la totalité depuis « Dossiers étudiants ».
          « 2e tranche due » : enregistrez-la directement ci-dessous.
        </p>
        {due.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
            <FaCheck size={12} /> Tous les dossiers de cette sélection sont à jour.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                  <th className="py-2.5 pr-4 font-semibold">Matricule</th>
                  <th className="py-2.5 pr-4 font-semibold">Nom</th>
                  <th className="py-2.5 pr-4 font-semibold">Formation</th>
                  <th className="py-2.5 pr-4 font-semibold">Statut</th>
                  <th className="py-2.5 pr-4 font-semibold">Montant dû</th>
                  <th className="py-2.5 pr-4 font-semibold">Téléphone</th>
                  <th className="py-2.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {due.map((s) => (
                  <tr key={s.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {s.matricule}
                      {s.academicYear && (
                        <span className="block text-[10px] text-zinc-400 dark:text-zinc-500">
                          {s.academicYear}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/etudiants/${s.id}`}
                        className="font-medium text-zinc-900 underline-offset-2 hover:text-indigo-600 hover:underline dark:text-zinc-50 dark:hover:text-indigo-400"
                      >
                        {s.fullName}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {s.mention ?? s.program ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={DUE_STATUS_BADGE[s.paymentStatus]}>
                        {DUE_STATUS_LABEL[s.paymentStatus]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {s.amountDue === null ? (
                        <span title="Aucun tarif configuré pour cette filière">— (tarif manquant)</span>
                      ) : (
                        `${amountFormatter.format(s.amountDue)} Ar`
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {s.phone ?? s.guardianPhone ?? "—"}
                    </td>
                    <td className="py-2.5">
                      {s.paymentStatus === "PARTIAL" ? (
                        <Tranche2Form studentId={s.id} amountDue={s.amountDue ?? 0} />
                      ) : (
                        <Link
                          href={`/agent-admin?q=${encodeURIComponent(s.matricule)}`}
                          className="rounded-lg border border-black/10 px-2.5 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-900"
                        >
                          Enregistrer un versement
                        </Link>
                      )}
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
