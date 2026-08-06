import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getInscriptionTrend } from "@/lib/dashboard";
import { getSelectedAcademicYear } from "@/lib/academic-year";
import { getSelectedLevel } from "@/lib/level";
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

const AVATAR_COLORS = [
  "bg-indigo-600",
  "bg-sky-600",
  "bg-emerald-600",
  "bg-amber-500",
  "bg-rose-600",
];

function avatarColor(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

const ROLES = ["SUPERADMIN", "AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "ETUDIANT"] as const;
type RoleValue = (typeof ROLES)[number];
const VALID_ROLES = new Set<string>(ROLES);

// Construit "/admin?role=X&months=Y#users" en conservant la période du
// graphique déjà sélectionnée — cliquer une carte "accès rapide" ne doit pas
// réinitialiser un réglage sans rapport.
function roleFilterHref(role: RoleValue, monthsBack: number): string {
  const q = new URLSearchParams({ role, months: String(monthsBack) });
  return `/admin?${q.toString()}#users`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string; role?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPERADMIN") redirect("/");

  const params = await searchParams;
  const monthsBack = Math.min(12, Math.max(3, Number(params.months) || 6));
  const roleFilter: RoleValue | null =
    params.role && VALID_ROLES.has(params.role) ? (params.role as RoleValue) : null;
  const [selectedYear, selectedLevel] = await Promise.all([
    getSelectedAcademicYear(),
    getSelectedLevel(),
  ]);

  const [users, roleCounts, trend] = await Promise.all([
    prisma.user.findMany({
      where: roleFilter ? { role: roleFilter } : undefined,
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    getInscriptionTrend({ monthsBack, academicYear: selectedYear, level: selectedLevel }),
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
      {/* Cartes statistiques — cliquables : accès rapide à la liste filtrée
          par rôle, juste en-dessous (section "Utilisateurs") */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Super administrateur"
          value={countOf("SUPERADMIN")}
          sublabel="utilisateurs"
          color="bg-indigo-600"
          icon={<IconShield />}
          compact
          href={roleFilterHref("SUPERADMIN", monthsBack)}
          active={roleFilter === "SUPERADMIN"}
        />
        <StatCard
          label="Agents administration"
          value={countOf("AGENT_ADMINISTRATION")}
          sublabel="utilisateurs"
          color="bg-sky-600"
          icon={<IconFolder />}
          compact
          href={roleFilterHref("AGENT_ADMINISTRATION", monthsBack)}
          active={roleFilter === "AGENT_ADMINISTRATION"}
        />
        <StatCard
          label="Agents pédagogiques"
          value={countOf("AGENT_PEDAGOGIQUE")}
          sublabel="utilisateurs"
          color="bg-emerald-600"
          icon={<IconCap />}
          compact
          href={roleFilterHref("AGENT_PEDAGOGIQUE", monthsBack)}
          active={roleFilter === "AGENT_PEDAGOGIQUE"}
        />
        <StatCard
          label="Étudiants"
          value={countOf("ETUDIANT")}
          sublabel="utilisateurs"
          color="bg-amber-500"
          icon={<IconUsers />}
          compact
          href={roleFilterHref("ETUDIANT", monthsBack)}
          active={roleFilter === "ETUDIANT"}
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
              {selectedYear
                ? `Année universitaire ${selectedYear} (septembre à août)`
                : `Sur les ${monthsBack} derniers mois`}
              {selectedLevel ? ` — niveau ${selectedLevel}` : ""}{" "}
              — dossiers enregistrés, reçus bancaires vérifiés, inscriptions finalisées.
            </p>
          </div>
          {/* La période fixe (sept.-août) de l'année sélectionnée rend ce
              contrôle sans effet : masqué plutôt que laissé inerte */}
          {!selectedYear && <MonthRangeSelector />}
        </div>
        <LineChart
          height={190}
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
        <section
          id="users"
          className="scroll-mt-4 rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {roleFilter ? `${ROLE_LABELS[roleFilter]} (${users.length})` : `Utilisateurs (${users.length})`}
            </h2>
            {roleFilter && (
              <a
                href={`/admin?months=${monthsBack}#users`}
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Voir tous les utilisateurs
              </a>
            )}
          </div>
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
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${avatarColor(user.email)} text-xs font-bold text-white`}
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
