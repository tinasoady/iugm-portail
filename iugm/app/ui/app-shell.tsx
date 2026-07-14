import Link from "next/link";
import type { ReactNode } from "react";

import { logout } from "@/app/auth-actions";
import { IconDashboard, IconFolder, IconCap, IconBell, IconLogout } from "./icons";

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Super administrateur",
  AGENT_ADMINISTRATION: "Agent d'administration",
  AGENT_PEDAGOGIQUE: "Agent pédagogique",
  ETUDIANT: "Étudiant",
};

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  roles: string[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/admin",
    label: "Tableau de bord",
    icon: <IconDashboard />,
    roles: ["SUPERADMIN"],
  },
  {
    href: "/agent-admin",
    label: "Dossiers étudiants",
    icon: <IconFolder />,
    roles: ["SUPERADMIN", "AGENT_ADMINISTRATION"],
  },
  {
    href: "/agent-pedagogique",
    label: "Pédagogie",
    icon: <IconCap />,
    roles: ["SUPERADMIN", "AGENT_PEDAGOGIQUE"],
  },
];

function initials(email: string): string {
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/).filter(Boolean);
  const chars =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return chars.toUpperCase();
}

// Coquille commune : sidebar verticale sombre + barre supérieure + contenu
export function AppShell({
  email,
  role,
  title,
  active,
  children,
}: {
  email: string;
  role: string;
  title: string;
  active: string; // href de la page courante, pour surligner le menu
  children: ReactNode;
}) {
  const nav = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-zinc-950 md:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-lg">
            IU
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide text-white">IUGM</p>
            <p className="text-[11px] text-zinc-400">Gestion de scolarité</p>
          </div>
        </div>

        <p className="px-6 pt-2 pb-2 text-[11px] font-semibold tracking-[0.2em] text-zinc-500">
          MENUS
        </p>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const isActive = item.href === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive
                    ? "flex items-center gap-3 rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-3 py-2.5 text-sm font-semibold text-white shadow-md"
                    : "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white"
                }
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white"
            >
              <IconLogout />
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>

      {/* Contenu */}
      <div className="flex min-h-screen flex-col md:pl-64">
        {/* Barre supérieure */}
        <header className="sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-zinc-950/80">
          <div className="flex items-center justify-between gap-4 px-6 py-3">
            <h1 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {title}
            </h1>
            <div className="flex items-center gap-4">
              <span className="hidden rounded-full p-2 text-zinc-400 sm:block dark:text-zinc-500">
                <IconBell />
              </span>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                  {initials(email)}
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{email}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {ROLE_LABELS[role] ?? role}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation mobile (sidebar masquée sous md) */}
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  item.href === active
                    ? "flex shrink-0 items-center gap-2 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                    : "flex shrink-0 items-center gap-2 rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }
              >
                {item.label}
              </Link>
            ))}
            <form action={logout}>
              <button
                type="submit"
                className="flex shrink-0 items-center gap-2 rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Déconnexion
              </button>
            </form>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
