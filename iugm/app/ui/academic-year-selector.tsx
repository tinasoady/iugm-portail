"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setAcademicYear } from "./academic-year-actions";
import { ALL_YEARS_VALUE } from "@/lib/academic-year-shared";

// Sélecteur global d'année universitaire (en-tête) : pilote les données et
// statistiques affichées sur tout le site. Le choix est mémorisé côté
// serveur (cookie httpOnly) puis la page en cours est rafraîchie pour
// relire les données avec le nouveau filtre — pas de navigation complète.
export function AcademicYearSelector({
  years,
  selected,
}: {
  years: string[];
  selected: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <select
      aria-label="Année universitaire consultée"
      title="Année universitaire consultée — filtre les données et statistiques de tout le site"
      value={selected ?? ALL_YEARS_VALUE}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(async () => {
          await setAcademicYear(value);
          router.refresh();
        });
      }}
      className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 outline-none transition hover:bg-zinc-50 focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      <option value={ALL_YEARS_VALUE}>Toutes les années</option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
