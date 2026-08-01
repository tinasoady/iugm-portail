"use client";

import { useRef } from "react";
import Link from "next/link";

import { logout } from "@/app/auth-actions";
import { IconBell, IconLogout } from "./icons";

function initials(email: string): string {
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return chars.toUpperCase();
}

// Menu compte : avatar + email en haut à droite, qui déplie au clic un petit
// panneau vertical (email, notifications, déconnexion) — <details>/<summary>
// natifs plutôt qu'un useState + gestion du clic extérieur, pour un menu
// aussi simple à maintenir qu'à utiliser.
export function AccountMenu({
  email,
  role,
  roleLabel,
  photo,
  unread,
}: {
  email: string;
  role: string;
  roleLabel: string;
  photo?: string | null;
  unread: number;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  return (
    <details ref={detailsRef} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1 pr-2 transition hover:bg-zinc-100 dark:hover:bg-zinc-800 [&::-webkit-details-marker]:hidden">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image inutile ici
          <img
            src={photo}
            alt="Photo de profil"
            className="h-9 w-9 rounded-full border border-black/10 object-cover dark:border-white/10"
          />
        ) : (
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
            {initials(email)}
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 ring-2 ring-white dark:ring-zinc-950" />
            )}
          </div>
        )}
      </summary>

      {/* Ferme le menu au clic en dehors (recouvre tout l'écran, sous le panneau) */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => {
          if (detailsRef.current) detailsRef.current.open = false;
        }}
        className="fixed inset-0 z-30 hidden cursor-default group-open:block"
      />

      <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-zinc-900">
        <div className="border-b border-black/5 px-4 py-2.5 dark:border-white/5">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{email}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{roleLabel}</p>
        </div>

        {role === "ETUDIANT" ? (
          <Link
            href="/mes-communiques"
            className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <span className="flex items-center gap-2">
              <IconBell />
              Communiqués
            </span>
            {unread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        ) : (
          <span className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-400 dark:text-zinc-500">
            <IconBell />
            Notifications
          </span>
        )}

        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <IconLogout />
            Se déconnecter
          </button>
        </form>
      </div>
    </details>
  );
}
