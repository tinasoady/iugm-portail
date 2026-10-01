import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { hasTaskPermission, getUserFormation } from "@/lib/permissions";
import { getFinancialReport, parseReportParams } from "@/lib/reports";
import { FORMATIONS } from "@/lib/formations";
import { getSettings } from "@/lib/settings";
import { PrintButton } from "@/app/ui/print-button";

const amountFormatter = new Intl.NumberFormat("fr-FR");
const ar = (value: number) => `${amountFormatter.format(value)} Ar`;
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const DUE_STATUS_LABEL = { UNPAID: "Non payé", PARTIAL: "2e tranche due" } as const;

// Vue imprimable de l'état récapitulatif : couvre TOUTE la sélection (pas de
// « Voir plus »), avec les paramètres explicites de l'URL plutôt que les
// cookies, pour qu'un lien imprimé ou partagé donne toujours le même état.
export default async function PrintReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; level?: string; f?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) redirect("/");
  if (!(await hasTaskPermission(session.sub, session.role, "ecolage"))) redirect("/");

  const params = parseReportParams(await searchParams, FORMATIONS.map((f) => f.label));
  const scopeFormation = await getUserFormation(session.sub, session.role);
  const effectiveFormation = scopeFormation ?? params.formation;
  const [report, settings] = await Promise.all([
    getFinancialReport({ ...params, scopeFormation }),
    getSettings(),
  ]);
  const t = report.totals;
  const scope = [
    params.academicYear ? `année ${params.academicYear}` : "toutes années",
    params.level ? `niveau ${params.level}` : "tous niveaux",
    effectiveFormation ? `filière ${effectiveFormation}` : "toutes filières",
  ].join(" — ");

  return (
    <div className="min-h-screen bg-zinc-50 p-4 sm:p-8 print:bg-white print:p-0 dark:bg-black">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <Link href="/rapports" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
            ← Retour aux états
          </Link>
          <PrintButton />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4 text-zinc-900 shadow-sm sm:p-8 print:rounded-none print:border-0 print:shadow-none">
          <header className="mb-6 border-b border-black/10 pb-4 text-center">
            {settings.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image inutile ici
              <img
                src={settings.logo}
                alt={`Logo ${settings.institutionAcronym}`}
                className="mx-auto mb-2 h-14 w-14 object-contain"
              />
            )}
            <h1 className="text-xl font-bold tracking-wide">
              {settings.institutionAcronym} — {(settings.city ?? "").toUpperCase()}
            </h1>
            <p className="text-sm text-zinc-600">{settings.institutionName}</p>
            <p className="mt-3 text-lg font-semibold uppercase">
              État récapitulatif des effectifs et de l&apos;écolage
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {scope} — généré le {dateFormatter.format(new Date())}
            </p>
          </header>

          <section className="mb-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Effectif", String(t.headcount)],
              ["Encaissé", ar(t.collected)],
              ["Attendu", ar(t.expected)],
              ["Reste dû", ar(t.outstanding)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-black/10 p-3">
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </section>

          <h2 className="mb-2 text-sm font-semibold">Par filière et par niveau</h2>
          <table className="mb-8 w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/20 text-zinc-500">
                <th className="py-1.5 pr-3 font-semibold">Filière</th>
                <th className="py-1.5 pr-3 font-semibold">Niveau</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Effectif</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Payé</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Partiel</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Non payé</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Versé</th>
                <th className="py-1.5 text-right font-semibold">Reste dû</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={`${r.formation}|${r.level}`} className="border-b border-black/5">
                  <td className="py-1.5 pr-3">{r.formation}</td>
                  <td className="py-1.5 pr-3">{r.level}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.headcount}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.fullyPaid}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.partiallyPaid}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.unpaid}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">{ar(r.collected)}</td>
                  <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{ar(r.outstanding)}</td>
                </tr>
              ))}
              <tr className="border-t border-black/30 font-semibold">
                <td className="py-1.5 pr-3" colSpan={2}>
                  Total
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{t.headcount}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{t.fullyPaid}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{t.partiallyPaid}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{t.unpaid}</td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">{ar(t.collected)}</td>
                <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{ar(t.outstanding)}</td>
              </tr>
            </tbody>
          </table>

          <h2 className="mb-2 text-sm font-semibold">Écolage non soldé ({report.dueStudents.length})</h2>
          {report.dueStudents.length === 0 ? (
            <p className="text-xs text-zinc-500">Tous les dossiers de cette sélection sont à jour.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/20 text-zinc-500">
                  <th className="py-1.5 pr-3 font-semibold">Matricule</th>
                  <th className="py-1.5 pr-3 font-semibold">Nom</th>
                  <th className="py-1.5 pr-3 font-semibold">Filière / Niveau</th>
                  <th className="py-1.5 pr-3 font-semibold">Situation</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">Versé</th>
                  <th className="py-1.5 text-right font-semibold">Reste dû</th>
                </tr>
              </thead>
              <tbody>
                {report.dueStudents.map((d) => (
                  <tr key={d.id} className="break-inside-avoid border-b border-black/5">
                    <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{d.matricule}</td>
                    <td className="py-1.5 pr-3 font-medium">{d.fullName}</td>
                    <td className="py-1.5 pr-3 text-zinc-600">
                      {d.formation} / {d.level}
                    </td>
                    <td className="py-1.5 pr-3">{DUE_STATUS_LABEL[d.status]}</td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap tabular-nums">{ar(d.paid)}</td>
                    <td className="py-1.5 text-right whitespace-nowrap tabular-nums">
                      {d.due === null ? "Niveau non défini" : ar(d.due)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
