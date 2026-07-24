import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getInscriptionTrend } from "@/lib/dashboard";
import { AppShell } from "@/app/ui/app-shell";
import { StatCard } from "@/app/ui/stat-card";
import { LineChart } from "@/app/ui/line-chart";
import { IconShield, IconFolder, IconCap, IconUsers } from "@/app/ui/icons";
import { CreateUserForm } from "./create-user-form";
import { MonthRangeSelector } from "./month-range-selector";

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Super administrateur",
  AGENT_ADMINISTRATION: "Agent d'administration",
  AGENT_PEDAGOGIQUE: "Agent pédagogique",
  ETUDIANT: "Étudiant",
};

const ROLE_BADGE_CLASSES: Record<string, string> = {
  SUPERADMIN:
    "rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  AGENT_ADMINISTRATION:
    "rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  AGENT_PEDAGOGIQUE:
    "rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  ETUDIANT:
    "rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
});

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-violet-600",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-500 to-pink-600",
];

function avatarGradient(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[h];
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPERADMIN") redirect("/");

  const params = await searchParams;
  const monthsBack = Math.min(12, Math.max(3, Number(params.months) || 6));

  const [users, roleCounts, trend] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    getInscriptionTrend(monthsBack),
  ]);

  const countOf = (role: string) =>
    roleCounts.find((r) => r.role === role)?._count._all ?? 0;

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Tableau de bord — Administration"
      active="/admin"
    >
      {/* Cartes statistiques */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Super administrateur"
          value={countOf("SUPERADMIN")}
          sublabel="utilisateurs"
          gradient="from-violet-500 to-purple-600"
          icon={<IconShield />}
          compact
        />
        <StatCard
          label="Agents administration"
          value={countOf("AGENT_ADMINISTRATION")}
          sublabel="utilisateurs"
          gradient="from-sky-500 to-blue-600"
          icon={<IconFolder />}
          compact
        />
        <StatCard
          label="Agents pédagogiques"
          value={countOf("AGENT_PEDAGOGIQUE")}
          sublabel="utilisateurs"
          gradient="from-emerald-500 to-teal-600"
          icon={<IconCap />}
          compact
        />
        <StatCard
          label="Étudiants"
          value={countOf("ETUDIANT")}
          sublabel="utilisateurs"
          gradient="from-amber-400 to-orange-500"
          icon={<IconUsers />}
          compact
        />
      </div>

      {/* Évolution des inscriptions */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Évolution des inscriptions
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Sur les {monthsBack} derniers mois — dossiers enregistrés, reçus bancaires vérifiés,
              inscriptions finalisées.
            </p>
          </div>
          <MonthRangeSelector />
        </div>
        <LineChart
          labels={trend.monthLabels}
          series={[
            {
              key: "registrations",
              label: "Enregistrés",
              color: "#2a78d6",
              darkColor: "#3987e5",
              values: trend.registrations,
            },
            {
              key: "payments",
              label: "Écolage payé",
              color: "#eb6834",
              darkColor: "#d95926",
              values: trend.payments,
            },
            {
              key: "inscriptions",
              label: "Inscriptions finalisées",
              color: "#1baf7a",
              darkColor: "#199e70",
              values: trend.inscriptions,
            },
          ]}
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Création d'utilisateur */}
        <section className="h-fit rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Créer un utilisateur
          </h2>
          <CreateUserForm />
        </section>

        {/* Liste des utilisateurs */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Utilisateurs ({users.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                  <th className="py-2.5 pr-4 font-semibold">Utilisateur</th>
                  <th className="py-2.5 pr-4 font-semibold">Type</th>
                  <th className="py-2.5 font-semibold">Identifiant</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const name = user.fullName ?? user.email;
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-black/5 last:border-0 dark:border-white/5"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br ${avatarGradient(user.email)} text-xs font-bold text-white`}
                          >
                            {initialsOf(name)}
                          </div>
                          <div>
                            <p className="font-medium text-zinc-900 dark:text-zinc-50">{name}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              Créé le {dateFormatter.format(user.createdAt)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={ROLE_BADGE_CLASSES[user.role]}>
                          {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                      </td>
                      <td className="py-3 text-zinc-600 dark:text-zinc-400">{user.email}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

    </AppShell>
  );
}
