import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getAllFilteredStudents } from "@/lib/students";
import { getUserFormation } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { STATUS_LABELS } from "@/app/ui/student-status";
import { PrintButton } from "@/app/ui/print-button";
import { GROUP_OPTIONS, resolveGroup, groupStudents } from "../group-students";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

type Params = {
  q?: string;
  year?: string;
  filiere?: string;
  niveau?: string;
  sort?: string;
  dir?: string;
  group?: string;
};

// Vue imprimable de la liste étudiants : reprend les mêmes filtres/tri que
// /etudiants, mais SANS pagination — une impression doit couvrir tout
// l'ensemble correspondant aux critères, pas seulement la page à l'écran.
export default async function ImprimerListePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) {
    redirect("/");
  }

  const params = await searchParams;
  const userFormation = await getUserFormation(session.sub, session.role);
  const [students, settings] = await Promise.all([
    getAllFilteredStudents(params, userFormation),
    getSettings(),
  ]);

  const group = resolveGroup(params.group);
  const groups = groupStudents(students, group);

  const activeFilters: string[] = [];
  if (params.q) activeFilters.push(`recherche « ${params.q} »`);
  if (params.year) activeFilters.push(`année ${params.year}`);
  if (userFormation) activeFilters.push(`formation ${userFormation}`);
  else if (params.filiere) activeFilters.push(`filière ${params.filiere}`);
  if (params.niveau) activeFilters.push(`niveau ${params.niveau}`);

  return (
    <div className="min-h-screen bg-zinc-50 p-8 print:bg-white print:p-0 dark:bg-black">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <Link
            href="/etudiants"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ← Retour à la liste
          </Link>
          <PrintButton label="🖨 Imprimer" />
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <header className="mb-6 border-b border-black/10 pb-4 text-center">
            {settings.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- fichier local, next/image inutile ici
              <img
                src={settings.logo}
                alt={`Logo ${settings.institutionAcronym}`}
                className="mx-auto mb-2 h-14 w-14 object-contain"
              />
            )}
            <h1 className="text-xl font-bold tracking-wide text-zinc-900">
              {settings.institutionAcronym} — {(settings.city ?? "").toUpperCase()}
            </h1>
            <p className="text-sm text-zinc-600">{settings.institutionName}</p>
            <p className="mt-3 text-lg font-semibold text-zinc-900 uppercase">
              Liste des étudiants
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Classée par {GROUP_OPTIONS[group].toLowerCase()}
              {activeFilters.length > 0 ? ` — ${activeFilters.join(", ")}` : ""} — {students.length}{" "}
              étudiant(s) — généré le {dateFormatter.format(new Date())}
            </p>
          </header>

          {groups.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">
              Aucun étudiant ne correspond à ces critères.
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map(([key, list]) => (
                <div key={key} className="break-inside-avoid">
                  <h2 className="mb-2 border-b border-black/10 pb-1 text-sm font-semibold text-zinc-900">
                    {GROUP_OPTIONS[group]} : {key} ({list.length})
                  </h2>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-black/20 text-zinc-500">
                        <th className="py-1.5 pr-3 font-semibold">Matricule</th>
                        <th className="py-1.5 pr-3 font-semibold">Nom</th>
                        <th className="py-1.5 pr-3 font-semibold">Filière / Niveau</th>
                        <th className="py-1.5 pr-3 font-semibold">Statut</th>
                        <th className="py-1.5 font-semibold">Inscrit le</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((s) => (
                        <tr key={s.id} className="border-b border-black/5 last:border-0">
                          <td className="py-1.5 pr-3 font-mono whitespace-nowrap text-zinc-700">
                            {s.matricule}
                          </td>
                          <td className="py-1.5 pr-3 font-medium text-zinc-900">{s.fullName}</td>
                          <td className="py-1.5 pr-3 text-zinc-600">
                            {[s.mention ?? s.program, s.level ?? s.track].filter(Boolean).join(" / ") ||
                              "—"}
                          </td>
                          <td className="py-1.5 pr-3 text-zinc-600">
                            {STATUS_LABELS[s.status] ?? s.status}
                          </td>
                          <td className="py-1.5 text-zinc-600">
                            {dateFormatter.format(s.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
