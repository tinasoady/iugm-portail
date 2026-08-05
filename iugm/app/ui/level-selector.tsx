"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLevel } from "./level-actions";
import { ALL_LEVELS_VALUE, LEVELS } from "@/lib/level-shared";

// Sélecteur global de niveau (en-tête), à côté du sélecteur d'année
// universitaire : pilote les données et statistiques affichées sur tout le
// site. Le choix est mémorisé côté serveur (cookie httpOnly) puis la page en
// cours est rafraîchie pour relire les données avec le nouveau filtre.
export function LevelSelector({ selected }: { selected: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      aria-label="Niveau consulté"
      title="Niveau consulté — filtre les données et statistiques de tout le site"
      value={selected ?? ALL_LEVELS_VALUE}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(async () => {
          await setLevel(value);
          router.refresh();
        });
      }}
      className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 outline-none transition hover:bg-zinc-50 focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      <option value={ALL_LEVELS_VALUE}>Tous les niveaux</option>
      {LEVELS.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}
