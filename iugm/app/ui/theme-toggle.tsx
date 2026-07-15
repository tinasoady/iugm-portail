"use client";

import { IconSun, IconMoon } from "./icons";

// Bascule clair/sombre : ajoute/retire la classe .dark sur <html>
// et mémorise le choix dans localStorage("theme").
// L'icône affichée est pilotée par CSS (dark:) : aucun état React,
// donc aucun risque de décalage d'hydratation.
export function ThemeToggle({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Basculer entre mode clair et mode sombre"
      title="Mode clair / sombre"
      onClick={() => {
        const isDark = document.documentElement.classList.toggle("dark");
        try {
          localStorage.setItem("theme", isDark ? "dark" : "light");
        } catch {
          // stockage indisponible (navigation privée) : le thème reste appliqué pour la session
        }
      }}
      className={`rounded-full p-2 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 ${className}`}
    >
      <span className="dark:hidden">
        <IconMoon />
      </span>
      <span className="hidden dark:inline">
        <IconSun />
      </span>
    </button>
  );
}
