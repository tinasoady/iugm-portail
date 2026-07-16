import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getEcolageStats, listUnpaidStudents, getAcademicYears } from "@/lib/students";
import { AppShell } from "@/app/ui/app-shell";
import { StatCard } from "@/app/ui/stat-card";
import { Donut } from "@/app/ui/donut";
import { IconUsers, IconCash, IconClipboard } from "@/app/ui/icons";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

// Jauge payé / non payé : couleurs de statut validées (émeraude / ambre),
// toujours accompagnées de libellés et d'effectifs — jamais la couleur seule.
function PaymentMeter({
  paid,
  unpaid,
  height = "h-5",
}: {
  paid: number;
  unpaid: number;
  height?: string;
}) {
  const total = paid + unpaid;
  if (total === 0) {
    return <div className={`${height} w-full rounded-full bg-zinc-100 dark:bg-zinc-800`} />;
  }
  return (
    <div className={`flex ${height} w-full gap-0.5 overflow-hidden rounded-full`}>
      {paid > 0 && (
        <div
          className="rounded-l-full bg-emerald-600 dark:bg-emerald-500"
          style={{ width: `${(paid / total) * 100}%` }}
          title={`Payé : ${paid}`}
        />
      )}
      {unpaid > 0 && (
        <div
          className={`${paid === 0 ? "rounded-l-full " : ""}rounded-r-full bg-amber-600 dark:bg-amber-400`}
          style={{ width: `${(unpaid / total) * 100}%` }}
          title={`Non payé : ${unpaid}`}
        />
      )}
    </div>
  );
}

export default async function EcolagePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) redirect("/");

  const { year } = await searchParams;
  const [stats, unpaidStudents, years] = await Promise.all([
    getEcolageStats(year),
    listUnpaidStudents(year),
    getAcademicYears(),
  ]);
  const paidPct = pct(stats.paid, stats.total);
  const unpaidPct = pct(stats.unpaid, stats.total);

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Gestion d'écolage"
      active="/agent-admin/ecolage"
    >
      {/* Filtre par année universitaire */}
      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <label htmlFor="year" className="text-sm text-zinc-600 dark:text-zinc-300">
            Année universitaire
          </label>
          <select
            id="year"
            name="year"
            defaultValue={year ?? ""}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
          >
            <option value="">Toutes les années</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500"
          >
            Afficher
          </button>
        </form>
      </section>

      {/* Cartes statistiques */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Dossiers étudiants"
          value={stats.total}
          sublabel={year ? `année ${year}` : "toutes années confondues"}
          gradient="from-violet-500 to-purple-600"
          icon={<IconUsers />}
        />
        <StatCard
          label="Écolage payé"
          value={`${paidPct}%`}
          sublabel={`${stats.paid} étudiant(s) — reçu bancaire vérifié`}
          gradient="from-emerald-500 to-teal-600"
          icon={<IconCash />}
        />
        <StatCard
          label="Écolage non payé"
          value={`${unpaidPct}%`}
          sublabel={`${stats.unpaid} étudiant(s) en attente`}
          gradient="from-amber-400 to-orange-500"
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
          <div className="flex flex-col items-center gap-8 sm:flex-row sm:justify-center sm:gap-14">
            <Donut
              segments={[
                { value: stats.paid, className: "stroke-emerald-600 dark:stroke-emerald-500" },
                { value: stats.unpaid, className: "stroke-amber-500 dark:stroke-amber-400" },
              ]}
              centerValue={`${paidPct}%`}
              centerLabel="payé"
            />

            {/* Légende détaillée */}
            <div className="w-full max-w-xs space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-black/5 p-3 dark:border-white/10">
                <span className="h-4 w-4 shrink-0 rounded bg-emerald-600 dark:bg-emerald-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    ✓ Écolage payé
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {stats.paid} étudiant(s) — reçu bancaire vérifié
                  </p>
                </div>
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {paidPct}%
                </span>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-black/5 p-3 dark:border-white/10">
                <span className="h-4 w-4 shrink-0 rounded bg-amber-500 dark:bg-amber-400" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    ⏳ Écolage non payé
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {stats.unpaid} étudiant(s) en attente de paiement
                  </p>
                </div>
                <span className="text-lg font-bold text-amber-700 dark:text-amber-400">
                  {unpaidPct}%
                </span>
              </div>

              <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
                Total : {stats.total} dossier(s)
                {year ? ` — année universitaire ${year}` : " — toutes années confondues"}
              </p>
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
                  <th className="py-2.5 pr-4 font-semibold">Payé / Total</th>
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
                      {f.paid} / {f.total}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-zinc-900 dark:text-zinc-50">
                      {pct(f.paid, f.total)}%
                    </td>
                    <td className="py-2.5">
                      <PaymentMeter paid={f.paid} unpaid={f.total - f.paid} height="h-2.5" />
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
          Étudiants n&apos;ayant pas encore payé ({unpaidStudents.length})
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Pour valider un paiement, vérifiez le reçu bancaire depuis la page « Dossiers
          étudiants ».
        </p>
        {unpaidStudents.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            ✓ Tous les étudiants de cette sélection ont payé leur écolage.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                  <th className="py-2.5 pr-4 font-semibold">Matricule</th>
                  <th className="py-2.5 pr-4 font-semibold">Nom</th>
                  <th className="py-2.5 pr-4 font-semibold">Formation</th>
                  <th className="py-2.5 pr-4 font-semibold">Téléphone</th>
                  <th className="py-2.5 font-semibold">Enregistré le</th>
                </tr>
              </thead>
              <tbody>
                {unpaidStudents.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
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
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {s.phone ?? s.guardianPhone ?? "—"}
                    </td>
                    <td className="py-2.5 text-zinc-600 dark:text-zinc-400">
                      {dateFormatter.format(s.createdAt)}
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
