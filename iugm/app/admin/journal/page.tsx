import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/app/ui/app-shell";
import { ACTION_LABELS, ALERT_ACTIONS, actionLabel, isKnownAction } from "@/lib/audit-labels";

type AuditLogWithActor = Prisma.AuditLogGetPayload<{
  include: { actor: { select: { email: true } } };
}>;

const PAGE_SIZE = 50;

// "2026-09-30" → minuit UTC de ce jour ; toute autre valeur est ignorée
function parseDay(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
});

type JournalFilters = { q?: string; action?: string; from?: string; to?: string };

function pageHref(params: JournalFilters, page: number): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.action) search.set("action", params.action);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return `/admin/journal${qs ? `?${qs}` : ""}`;
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; page?: string; from?: string; to?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPERADMIN") redirect("/");

  const params = await searchParams;
  const q = params.q?.trim();
  const action = isKnownAction(params.action) ? params.action : undefined;
  // Période : dates AAAA-MM-JJ (jour de fin inclus)
  const from = parseDay(params.from);
  const to = parseDay(params.to);
  const page = Math.max(1, Number(params.page) || 1);

  const where = {
    ...(action ? { action } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: new Date(to.getTime() + 24 * 60 * 60 * 1000) } : {}),
          },
        }
      : {}),
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
          <input aria-label="Rechercher"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Email de l'auteur, détails..."
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 sm:w-64 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <select aria-label="Filtrer par action"
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
          <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            Du
            <input
              name="from"
              type="date"
              defaultValue={params.from ?? ""}
              className="rounded-xl border border-black/10 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            au
            <input
              name="to"
              type="date"
              defaultValue={params.to ?? ""}
              className="rounded-xl border border-black/10 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Filtrer
          </button>
          {(q || action || from || to) && (
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
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Date</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Action</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Auteur</th>
                  <th scope="col" className="py-2.5 font-semibold">Détails</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: AuditLogWithActor) => (
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
                          ALERT_ACTIONS.has(log.action)
                            ? "rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }
                      >
                        {actionLabel(log.action)}
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
                href={pageHref({ q, action, from: params.from, to: params.to }, page - 1)}
                className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                ← Plus récentes
              </Link>
            ) : (
              <span />
            )}
            {page < totalPages ? (
              <Link
                href={pageHref({ q, action, from: params.from, to: params.to }, page + 1)}
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
