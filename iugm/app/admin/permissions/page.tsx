import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/app/ui/app-shell";
import { PermissionActions } from "./permission-row";

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
    },
  });

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Permissions des utilisateurs"
      active="/admin/permissions"
    >
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Utilisateurs ({users.length})
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Changez le rôle d&apos;un utilisateur, désactivez un compte (connexion refusée) ou
          réinitialisez un mot de passe (temporaire, à changer à la prochaine connexion — le
          matricule pour un étudiant). Toutes les modifications sont journalisées.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                <th className="py-2.5 pr-4 font-semibold">Utilisateur</th>
                <th className="py-2.5 pr-4 font-semibold">Rôle actuel</th>
                <th className="py-2.5 pr-4 font-semibold">Statut</th>
                <th className="py-2.5 font-semibold">Gestion</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={`border-b border-black/5 align-top last:border-0 dark:border-white/5 ${user.active ? "" : "opacity-60"}`}
                >
                  <td className="py-3 pr-4">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                      {user.fullName ?? user.email}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={ROLE_BADGE_CLASSES[user.role]}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="space-y-1">
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
                        <span className="block w-fit rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          Doit changer son mdp
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <PermissionActions
                      userId={user.id}
                      role={user.role}
                      active={user.active}
                      isSelf={user.id === session.sub}
                      email={user.email}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
