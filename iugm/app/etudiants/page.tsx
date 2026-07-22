import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { listStudents, getAcademicYears, getStudentFilterValues } from "@/lib/students";
import { hasTaskPermission, getUserFormation } from "@/lib/permissions";
import { AppShell } from "@/app/ui/app-shell";
import { STATUS_LABELS, STATUS_BADGE_CLASSES } from "@/app/ui/student-status";
import { DeleteStudentButton, EditStudentLink } from "./delete-button";
import { GROUP_OPTIONS, resolveGroup, groupStudents } from "./group-students";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

type Params = {
  q?: string;
  year?: string;
  filiere?: string;
  niveau?: string;
  sort?: string;
  dir?: string;
  group?: string;
  page?: string;
};

// Requête (hors page) à transmettre telle quelle à l'export et à l'impression
function filterQueryString(params: Params): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.year) search.set("year", params.year);
  if (params.filiere) search.set("filiere", params.filiere);
  if (params.niveau) search.set("niveau", params.niveau);
  if (params.group) search.set("group", params.group);
  if (params.sort) search.set("sort", params.sort);
  if (params.dir) search.set("dir", params.dir);
  return search.toString();
}

// Lien d'en-tête de colonne : re-cliquer inverse le sens du tri (repart en page 1)
function sortHref(params: Params, key: string): string {
  const dir = params.sort === key && params.dir !== "desc" ? "desc" : "asc";
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.year) search.set("year", params.year);
  if (params.filiere) search.set("filiere", params.filiere);
  if (params.niveau) search.set("niveau", params.niveau);
  if (params.group) search.set("group", params.group);
  search.set("sort", key);
  search.set("dir", dir);
  return `/etudiants?${search.toString()}`;
}

function sortArrow(params: Params, key: string): string {
  if (params.sort !== key) return "";
  return params.dir === "desc" ? " ↓" : " ↑";
}

// Lien de pagination : conserve tous les filtres/tri actifs
function pageHref(params: Params, page: number): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.year) search.set("year", params.year);
  if (params.filiere) search.set("filiere", params.filiere);
  if (params.niveau) search.set("niveau", params.niveau);
  if (params.group) search.set("group", params.group);
  if (params.sort) search.set("sort", params.sort);
  if (params.dir) search.set("dir", params.dir);
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return `/etudiants${qs ? `?${qs}` : ""}`;
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
  // Secrétaire de formation : la liste est limitée à sa formation, côté serveur
  const userFormation = await getUserFormation(session.sub, session.role);
  const [{ students, total, page, totalPages }, years, filterValues] = await Promise.all([
    listStudents({ ...params, page: Number(params.page) || 1 }, userFormation),
    getAcademicYears(),
    getStudentFilterValues(),
  ]);

  // Suppression et modification sont réservées au superadmin et aux agents
  // d'administration ayant la tâche correspondante dans leurs permissions
  const [canDelete, canEdit] = await Promise.all([
    hasTaskPermission(session.sub, session.role, "suppression_etudiant"),
    hasTaskPermission(session.sub, session.role, "modification_dossier"),
  ]);
  const canManageActions = canDelete || canEdit;

  // Classement des blocs selon le critère choisi (année par défaut)
  const group = resolveGroup(params.group);
  const groups = groupStudents(students, group);
  const exportQuery = filterQueryString(params);

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
          {userFormation ? (
            <span
              className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
              title="Votre accès est limité à cette formation"
            >
              🔒 Formation : {userFormation}
            </span>
          ) : (
            <select
              name="filiere"
              defaultValue={params.filiere ?? ""}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
            >
              <option value="">Toutes les filières</option>
              {filterValues.filieres.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
          <select
            name="niveau"
            defaultValue={params.niveau ?? ""}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
          >
            <option value="">Tous les niveaux</option>
            {filterValues.niveaux.map((n) => (
              <option key={n} value={n}>
                {n}
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
          {(params.q || params.year || params.filiere || params.niveau || params.group) && (
            <Link
              href="/etudiants"
              className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Réinitialiser
            </Link>
          )}
        </form>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {total} étudiant(s) au total — page {page} / {totalPages} — cliquez sur un en-tête de
            colonne pour trier.
          </p>
          <div className="flex items-center gap-2">
            <a
              href={`/etudiants/imprimer${exportQuery ? `?${exportQuery}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              🖨 Imprimer la liste
            </a>
            <a
              href={`/api/students/export-filtered${exportQuery ? `?${exportQuery}` : ""}`}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              ⬇ Exporter (CSV)
            </a>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
          Impression et export portent sur l&apos;ensemble des étudiants correspondant aux
          critères ci-dessus (pas seulement la page affichée).
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
                    Filière / Niveau
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
                  {canManageActions && (
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
                      {[s.mention ?? s.program, s.level ?? s.track].filter(Boolean).join(" / ") ||
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
                    {canManageActions && (
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          {canEdit && <EditStudentLink studentId={s.id} />}
                          {canDelete && (
                            <DeleteStudentButton
                              studentId={s.id}
                              matricule={s.matricule}
                              fullName={s.fullName}
                            />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/* Pagination : 50 dossiers par page, tous filtres/tri conservés */}
      {totalPages > 1 && (
        <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            {page > 1 ? (
              <Link
                href={pageHref(params, page - 1)}
                className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                ← Page précédente
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Page {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={pageHref(params, page + 1)}
                className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Page suivante →
              </Link>
            ) : (
              <span />
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}
