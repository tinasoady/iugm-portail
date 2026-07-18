import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/app/ui/app-shell";

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "Connexion réussie",
  LOGIN_FAILED: "Connexion échouée",
  USER_CREATED: "Compte créé",
  LOGOUT: "Déconnexion",
  STUDENT_REGISTERED: "Étudiant enregistré",
  RECEIPT_VERIFIED: "Reçu bancaire vérifié",
  ADMIN_INSCRIPTION_VALIDATED: "Inscr. administrative validée",
  PEDAGO_INSCRIPTION_VALIDATED: "Inscr. pédagogique validée",
  CSV_EXPORTED: "Export CSV",
  CSV_IMPORTED: "Import CSV",
  RESULT_ASSIGNED: "Résultat assigné",
  INSCRIPTION_RECEIPT_PRINTED: "Reçu d'inscription imprimé",
  STUDENT_DELETED: "Dossier supprimé",
  STUDENT_UPDATED: "Dossier modifié",
  SETTINGS_UPDATED: "Paramètres modifiés",
  PASSWORD_CHANGED: "Mot de passe changé",
  PERMISSION_UPDATED: "Permission modifiée",
  PASSWORD_RESET: "Mot de passe réinitialisé",
  STUDENT_REENROLLED: "Étudiant réinscrit",
  USER_DELETED: "Compte supprimé",
  PROFILE_UPDATED: "Profil mis à jour",
};

const PAGE_SIZE = 50;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
});

function pageHref(params: { q?: string; action?: string }, page: number): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.action) search.set("action", params.action);
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return `/admin/journal${qs ? `?${qs}` : ""}`;
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPERADMIN") redirect("/");

  const params = await searchParams;
  const q = params.q?.trim();
  const action = ACTION_LABELS[params.action ?? ""] ? params.action : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const where = {
    ...(action ? { action } : {}),
    ...(q
      ? {
          OR: [
            { details: { contains: q, mode: "insensitive" as const } },
            { actor: { email: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Journaux d'activité"
      active="/admin/journal"
    >
      {/* Filtres */}
      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Email de l'auteur, détails..."
            className="w-64 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <select
            name="action"
            defaultValue={action ?? ""}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
          >
            <option value="">Toutes les actions</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500"
          >
            Filtrer
          </button>
          {(q || action) && (
            <Link
              href="/admin/journal"
              className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Réinitialiser
            </Link>
          )}
        </form>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {total} action(s) enregistrée(s) — page {page} / {totalPages}
        </p>
      </section>

      {/* Journal */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Aucune action ne correspond à ces critères.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                  <th className="py-2.5 pr-4 font-semibold">Date</th>
                  <th className="py-2.5 pr-4 font-semibold">Action</th>
                  <th className="py-2.5 pr-4 font-semibold">Auteur</th>
                  <th className="py-2.5 font-semibold">Détails</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      {dateFormatter.format(log.createdAt)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={
                          log.action === "LOGIN_FAILED"
                            ? "rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }
                      >
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {log.actor?.email ?? "—"}
                    </td>
                    <td className="py-2.5 text-zinc-600 dark:text-zinc-400">{log.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/10">
            {page > 1 ? (
              <Link
                href={pageHref({ q, action }, page - 1)}
                className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                ← Plus récentes
              </Link>
            ) : (
              <span />
            )}
            {page < totalPages ? (
              <Link
                href={pageHref({ q, action }, page + 1)}
                className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Plus anciennes →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
