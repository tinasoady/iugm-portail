import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { listStudents, getAcademicYears } from "@/lib/students";
import { AppShell } from "@/app/ui/app-shell";
import { STATUS_LABELS, STATUS_BADGE_CLASSES, MENTION_LABELS } from "@/app/ui/student-status";
import { DeleteStudentButton } from "./delete-button";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

type Params = { q?: string; year?: string; sort?: string; dir?: string; group?: string };

// Modes de classement des blocs
const GROUP_OPTIONS: Record<string, string> = {
  annee: "Année universitaire",
  filiere: "Filière",
  domaine: "Domaine",
  mention: "Mention",
};

// Lien d'en-tête de colonne : re-cliquer inverse le sens du tri
function sortHref(params: Params, key: string): string {
  const dir = params.sort === key && params.dir !== "desc" ? "desc" : "asc";
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.year) search.set("year", params.year);
  if (params.group) search.set("group", params.group);
  search.set("sort", key);
  search.set("dir", dir);
  return `/etudiants?${search.toString()}`;
}

function sortArrow(params: Params, key: string): string {
  if (params.sort !== key) return "";
  return params.dir === "desc" ? " ↓" : " ↑";
}

export default async function EtudiantsPage({
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
  const [students, years] = await Promise.all([listStudents(params), getAcademicYears()]);

  // La suppression est réservée à l'agent d'administration (et au superadmin)
  const canDelete = ["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role);

  // Classement des blocs selon le critère choisi (année par défaut)
  const group = GROUP_OPTIONS[params.group ?? ""] ? (params.group as string) : "annee";
  const UNSET = "Non renseigné(e)";
  const keyOf = (s: (typeof students)[number]): string => {
    switch (group) {
      case "filiere":
        return s.mention ?? s.program ?? UNSET;
      case "domaine":
        return s.domain ?? s.department ?? UNSET;
      case "mention":
        // Mention du résultat le plus récent
        return s.results[0] ? (MENTION_LABELS[s.results[0].mention] ?? s.results[0].mention) : "Sans résultat";
      default:
        return s.academicYear ?? UNSET;
    }
  };

  const map = new Map<string, typeof students>();
  for (const s of students) {
    const key = keyOf(s);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  const keys = [...map.keys()].sort((a, b) => {
    // Les blocs "non renseigné" / "sans résultat" passent en dernier
    const aLast = a === UNSET || a === "Sans résultat";
    const bLast = b === UNSET || b === "Sans résultat";
    if (aLast !== bLast) return aLast ? 1 : -1;
    // Années : la plus récente d'abord ; autres critères : ordre alphabétique
    return group === "annee" ? b.localeCompare(a) : a.localeCompare(b);
  });
  const groups: Array<[string, typeof students]> = keys.map((k) => [k, map.get(k)!]);

  const headerLinkClass =
    "font-semibold text-zinc-400 hover:text-indigo-600 dark:text-zinc-500 dark:hover:text-indigo-400";

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Liste des étudiants"
      active="/etudiants"
    >
      {/* Barre de recherche et de filtres */}
      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            type="search"
            defaultValue={params.q ?? ""}
            placeholder="Nom, matricule, CIN, mention, parcours..."
            className="w-64 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <select
            name="year"
            defaultValue={params.year ?? ""}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
          >
            <option value="">Toutes les années universitaires</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            Classer par
            <select
              name="group"
              defaultValue={group}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
            >
              {Object.entries(GROUP_OPTIONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500"
          >
            Rechercher
          </button>
          {(params.q || params.year || params.group) && (
            <Link
              href="/etudiants"
              className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Réinitialiser
            </Link>
          )}
        </form>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {students.length} étudiant(s) — cliquez sur un en-tête de colonne pour trier.
        </p>
      </section>

      {groups.length === 0 && (
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Aucun étudiant ne correspond à ces critères.
          </p>
        </section>
      )}

      {/* Un bloc par année universitaire */}
      {groups.map(([year, list]) => (
        <section
          key={year}
          className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900"
        >
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {GROUP_OPTIONS[group]} : {year}
            </h2>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {list.length} étudiant(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider dark:border-white/10">
                  <th className="py-2.5 pr-4">
                    <a href={sortHref(params, "matricule")} className={headerLinkClass}>
                      Matricule{sortArrow(params, "matricule")}
                    </a>
                  </th>
                  <th className="py-2.5 pr-4">
                    <a href={sortHref(params, "nom")} className={headerLinkClass}>
                      Nom{sortArrow(params, "nom")}
                    </a>
                  </th>
                  <th className="py-2.5 pr-4 font-semibold text-zinc-400 dark:text-zinc-500">
                    Mention / Parcours
                  </th>
                  <th className="py-2.5 pr-4">
                    <a href={sortHref(params, "statut")} className={headerLinkClass}>
                      Statut{sortArrow(params, "statut")}
                    </a>
                  </th>
                  <th className="py-2.5 pr-4">
                    <a href={sortHref(params, "date")} className={headerLinkClass}>
                      Inscrit le{sortArrow(params, "date")}
                    </a>
                  </th>
                  <th className="py-2.5 pr-4 font-semibold text-zinc-400 dark:text-zinc-500">
                    Compte
                  </th>
                  {canDelete && (
                    <th className="py-2.5 font-semibold text-zinc-400 dark:text-zinc-500">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {s.matricule}
                    </td>
                    <td className="py-2.5 pr-4">
                      <a
                        href={`/etudiants/${s.id}`}
                        className="font-medium text-zinc-900 underline-offset-2 hover:text-indigo-600 hover:underline dark:text-zinc-50 dark:hover:text-indigo-400"
                        title="Voir le profil complet"
                      >
                        {s.fullName}
                      </a>
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {[s.mention ?? s.program, s.track ?? s.level].filter(Boolean).join(" — ") ||
                        "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={STATUS_BADGE_CLASSES[s.status]}>
                        {STATUS_LABELS[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {dateFormatter.format(s.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-zinc-600 dark:text-zinc-400">
                      {s.account?.email ?? "—"}
                    </td>
                    {canDelete && (
                      <td className="py-2.5">
                        <DeleteStudentButton
                          studentId={s.id}
                          matricule={s.matricule}
                          fullName={s.fullName}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </AppShell>
  );
}
