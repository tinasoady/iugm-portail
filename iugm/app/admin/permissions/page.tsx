import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { tasksForRole, TASKS } from "@/lib/permissions";
import { FORMATIONS } from "@/lib/formations";
import { AppShell } from "@/app/ui/app-shell";
import { PermissionActions } from "./permission-row";
import { TaskPermissionsForm, DeleteUserButton } from "./task-permissions-form";

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

export default async function PermissionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPERADMIN") redirect("/");

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      active: true,
      mustChangePassword: true,
      jobTitle: true,
      permissions: true,
      formation: true,
    },
  });

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Permissions des utilisateurs"
      active="/admin/permissions"
    >
      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Pour chaque agent, indiquez sa fonction et cochez les tâches qu&apos;il est autorisé à
          effectuer : deux agents du même rôle (secrétaire, chef de scolarité, responsable
          finance...) peuvent avoir des permissions différentes. Une tâche non cochée est refusée
          par le système, même en accès direct. Toutes les modifications sont journalisées.
        </p>
      </section>

      {users.map((user) => {
        const roleTasks = tasksForRole(user.role).map((key) => ({
          key,
          label: TASKS[key].label,
        }));
        return (
          <section
            key={user.id}
            className={`rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900 ${user.active ? "" : "opacity-70"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              {/* Identité */}
              <div className="min-w-56">
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {user.fullName ?? user.email}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={ROLE_BADGE_CLASSES[user.role]}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                  {user.jobTitle && (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {user.jobTitle}
                    </span>
                  )}
                  {user.formation && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      🔒 {user.formation}
                    </span>
                  )}
                  {user.active ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      ● Actif
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                      ● Désactivé
                    </span>
                  )}
                  {user.mustChangePassword && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      Doit changer son mdp
                    </span>
                  )}
                </div>
              </div>

              {/* Gestion du compte */}
              <div className="space-y-2">
                <PermissionActions
                  userId={user.id}
                  role={user.role}
                  active={user.active}
                  isSelf={user.id === session.sub}
                  email={user.email}
                />
                {user.id !== session.sub && (
                  <DeleteUserButton userId={user.id} email={user.email} />
                )}
              </div>
            </div>

            {/* Tâches autorisées (agents uniquement) */}
            {roleTasks.length > 0 && (
              <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/10">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Tâches autorisées ({user.permissions.length} / {roleTasks.length})
                </p>
                <TaskPermissionsForm
                  userId={user.id}
                  jobTitle={user.jobTitle}
                  formation={user.formation}
                  formations={FORMATIONS.map((f) => f.label)}
                  permissions={user.permissions}
                  tasks={roleTasks}
                />
              </div>
            )}
          </section>
        );
      })}
    </AppShell>
  );
}
