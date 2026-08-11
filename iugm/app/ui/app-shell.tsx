import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { Footer } from "./footer";
import { unreadAnnouncementsCount } from "@/lib/announcements";
import { getAcademicYears } from "@/lib/students";
import { getSelectedAcademicYear } from "@/lib/academic-year";
import { getSelectedLevel } from "@/lib/level";
import { AcademicYearSelector } from "./academic-year-selector";
import { LevelSelector } from "./level-selector";
import { AccountMenu } from "./account-menu";
import { IdleLogout } from "./idle-logout";
import type { TaskKey } from "@/lib/permissions";
import {
  IconDashboard,
  IconFolder,
  IconCap,
  IconBell,
  IconClipboard,
  IconUsers,
  IconGear,
  IconCash,
  IconShield,
  IconUser,
  IconMegaphone,
} from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { BsClipboardData, BsDatabase } from "react-icons/bs";

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Super administrateur",
  AGENT_ADMINISTRATION: "Agent d'administration",
  AGENT_PEDAGOGIQUE: "Agent pédagogique",
  ETUDIANT: "Étudiant",
};

type NavChild = {
  href: string;
  label: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  roles: string[];
  // Si définie, l'entrée n'apparaît que si l'agent a cette tâche dans ses permissions
  task?: TaskKey;
  // Sous-menu affiché sous cette entrée (même filtrage roles/task que le parent)
  children?: NavChild[];
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
    href: "/agent-admin/inscription",
    label: "Inscription",
    icon: <IconClipboard />,
    roles: ["SUPERADMIN", "AGENT_ADMINISTRATION"],
    task: "inscription",
  },
  {
    href: "/agent-admin/reinscription",
    label: "Réinscription",
    icon: <IconCap />,
    roles: ["SUPERADMIN", "AGENT_ADMINISTRATION"],
    task: "reinscription",
  },
  {
    href: "/agent-admin/ecolage",
    label: "Gestion d'écolage",
    icon: <IconCash />,
    roles: ["SUPERADMIN", "AGENT_ADMINISTRATION"],
    task: "ecolage",
  },
  {
    href: "/agent-pedagogique",
    label: "Pédagogie",
    icon: <IconCap />,
    roles: ["SUPERADMIN", "AGENT_PEDAGOGIQUE"],
  },
  {
    href: "/etudiants",
    label: "Liste étudiants",
    icon: <IconUsers />,
    roles: ["SUPERADMIN", "AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE"],
  },
  {
    href: "/communiquer",
    label: "Communiquer",
    icon: <IconMegaphone />,
    roles: ["SUPERADMIN", "AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE"],
    task: "communiquer",
  },
  {
    href: "/admin/base-donnees",
    label: "Base de données",
    icon: <BsDatabase />,
    roles: ["SUPERADMIN"],
  },
  {
    href: "/admin/permissions",
    label: "Permissions",
    icon: <IconShield />,
    roles: ["SUPERADMIN"],
  },
  {
    href: "/admin/journal",
    label: "Journaux d'activité",
    icon: <BsClipboardData />,
    roles: ["SUPERADMIN"],
  },
  {
    href: "/admin/parametres",
    label: "Paramètres",
    icon: <IconGear />,
    roles: ["SUPERADMIN"],
  },
  {
    href: "/mon-profil",
    label: "Mon profil",
    icon: <IconUsers />,
    roles: ["ETUDIANT"],
  },
  {
    href: "/mes-communiques",
    label: "Communiqués",
    icon: <IconBell />,
    roles: ["ETUDIANT"],
  },
  // Gestion de son propre compte (photo, informations, mot de passe) — tous les rôles
  {
    href: "/profil",
    label: "Mon compte",
    icon: <IconUser />,
    roles: ["SUPERADMIN", "AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "ETUDIANT"],
  },
];

// Coquille commune : sidebar verticale sombre + barre supérieure + contenu.
// Composant serveur asynchrone : il lit les paramètres (logo, nom) en base.
export async function AppShell({
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
  // Photo de profil pour l'avatar + permissions pour filtrer le menu des
  // agents + formation affectée (secrétaire de formation, cantonnée à sa filière)
  const account = await prisma.user.findUnique({
    where: { email },
    select: { id: true, permissions: true, photo: true, formation: true },
  });
  const permissions = account?.permissions ?? [];
  const nav = NAV_ITEMS.filter(
    (item) =>
      item.roles.includes(role) &&
      (!item.task || role === "SUPERADMIN" || permissions.includes(item.task)),
  );
  const settings = await getSettings();
  // Badge de notifications : communiqués non lus (étudiants uniquement)
  const unread =
    role === "ETUDIANT" && account ? await unreadAnnouncementsCount(account.id) : 0;

  // Sélecteur global d'année universitaire : pertinent uniquement pour les
  // rôles qui consultent des données/statistiques d'étudiants (pas pour un
  // étudiant, dont l'espace ne montre que son propre dossier).
  const showAcademicYearSelector = role !== "ETUDIANT";
  let academicYearYears: string[] = [];
  let selectedAcademicYear: string | null = null;
  let selectedLevel: string | null = null;
  if (showAcademicYearSelector) {
    const [years, selected, level] = await Promise.all([
      getAcademicYears(),
      getSelectedAcademicYear(),
      getSelectedLevel(),
    ]);
    // L'année sélectionnée par défaut (année en cours) peut ne pas encore
    // avoir de dossier en base — on l'ajoute quand même à la liste pour que
    // le <select> l'affiche correctement dès la première visite.
    academicYearYears = selected && !years.includes(selected) ? [selected, ...years] : years;
    selectedAcademicYear = selected;
    selectedLevel = level;
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      <IdleLogout />
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-zinc-950 md:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          {settings.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image inutile ici
            <img
              src={settings.logo}
              alt={`Logo ${settings.institutionAcronym}`}
              className="h-10 w-10 rounded-xl bg-white object-contain p-0.5 shadow-lg"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-lg">
              IU
            </div>
          )}
          <div>
            <p className="text-sm font-bold tracking-wide text-white">
              {settings.institutionAcronym}
            </p>
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
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={
                    isActive
                      ? "flex items-center gap-3 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-md"
                      : "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white"
                  }
                >
                  {item.icon}
                  {item.label}
                </Link>
                {item.children && (
                  <div className="mt-1 ml-6 space-y-1 border-l border-white/10 pl-3">
                    {item.children.map((child) => {
                      const isChildActive = child.href === active;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={
                            isChildActive
                              ? "block rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                              : "block rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-white/5 hover:text-white"
                          }
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Contenu */}
      <div className="flex min-h-screen flex-col md:pl-64">
        {/* Barre supérieure */}
        <header className="sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-zinc-950/80">
          <div className="flex items-center justify-between gap-4 px-6 py-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {title}
              </h1>
              {account?.formation && (
                <p className="mt-0.5 truncate text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  Filière assignée : {account.formation}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Masqués sous sm : sur un petit écran, ces deux sélecteurs
                  plus le bouton de thème et l'avatar dans la même ligne
                  laissaient trop peu de place à l'avatar (déconnexion) pour
                  qu'il reste facile à repérer. Toujours disponibles à partir
                  d'une tablette. */}
              {showAcademicYearSelector && (
                <div className="hidden items-center gap-2 sm:flex sm:gap-3">
                  <AcademicYearSelector years={academicYearYears} selected={selectedAcademicYear} />
                  <LevelSelector selected={selectedLevel} />
                </div>
              )}
              <ThemeToggle />
              <AccountMenu
                email={email}
                role={role}
                roleLabel={ROLE_LABELS[role] ?? role}
                photo={account?.photo}
                unread={unread}
              />
            </div>
          </div>

          {/* Navigation mobile (sidebar masquée sous md) */}
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
            {nav.map((item) => (
              <Fragment key={item.href}>
                <Link
                  href={item.href}
                  className={
                    item.href === active
                      ? "flex shrink-0 items-center gap-2 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                      : "flex shrink-0 items-center gap-2 rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  }
                >
                  {item.label}
                </Link>
                {item.children?.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={
                      child.href === active
                        ? "flex shrink-0 items-center gap-2 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                        : "flex shrink-0 items-center gap-2 rounded-full bg-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }
                  >
                    {child.label}
                  </Link>
                ))}
              </Fragment>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-6 py-8">{children}</main>
        <Footer institutionName={settings.institutionAcronym} />
      </div>
    </div>
  );
}
