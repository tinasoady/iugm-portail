"use client";

import { useMemo, useState } from "react";
import { DeleteBatchButton } from "./delete-batch-button";
import { DeleteBatchStudentsButton } from "./delete-batch-students-button";

export type Batch = {
  academicYear: string;
  category: string;
  formation: string | null;
  level: string | null;
  count: number;
  unusedCount: number;
};

type Tier = "ALL" | "LICENCE" | "MASTER";

const TIER_OPTIONS: Array<{ value: Tier; label: string }> = [
  { value: "ALL", label: "Tous les niveaux" },
  { value: "LICENCE", label: "Licence (L1-L3)" },
  { value: "MASTER", label: "Master (M1-M2)" },
];

// null = niveau non renseigné sur le lot : ne relève ni de l'un ni de
// l'autre, affiché seulement sous « Tous les niveaux ».
function tierOf(level: string | null): Tier | null {
  if (level === "M1" || level === "M2") return "MASTER";
  if (level === "L1" || level === "L2" || level === "L3") return "LICENCE";
  return null;
}

export function BatchesTable({
  batches,
  categoryLabels,
}: {
  batches: Batch[];
  categoryLabels: Record<string, string>;
}) {
  const [tier, setTier] = useState<Tier>("ALL");

  const filtered = useMemo(
    () => (tier === "ALL" ? batches : batches.filter((b) => tierOf(b.level) === tier)),
    [batches, tier],
  );

  return (
    <div className="space-y-3">
      {/* Filtre licence/master : purement pour la lecture du tableau, ne
          change rien aux lots réellement en base (voir tierOf ci-dessus). */}
      <div className="flex flex-wrap gap-2">
        {TIER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTier(opt.value)}
            className={
              tier === opt.value
                ? "rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Aucun lot pour ce niveau.
        </p>
      ) : (
        // overflow-x-auto (pas overflow-hidden) : ce tableau a 8 colonnes,
        // il déborderait sur mobile/tablette sans défilement horizontal —
        // overflow-hidden le découperait silencieusement à la place.
        <div className="overflow-x-auto rounded-xl border border-black/5 dark:border-white/10">
          <table className="w-full min-w-180 text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                <th className="px-4 py-2.5 font-semibold">Type de données</th>
                <th className="px-4 py-2.5 font-semibold">Année universitaire</th>
                <th className="px-4 py-2.5 font-semibold">Filière</th>
                <th className="px-4 py-2.5 font-semibold">Niveau</th>
                <th className="px-4 py-2.5 font-semibold">Fiches en base</th>
                <th className="px-4 py-2.5 font-semibold">Non utilisées</th>
                <th className="px-4 py-2.5 font-semibold">Dossiers créés</th>
                <th className="px-4 py-2.5 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const usedCount = b.count - b.unusedCount;
                return (
                  <tr
                    key={`${b.academicYear}-${b.category}-${b.formation ?? ""}-${b.level ?? ""}`}
                    className="border-b border-black/5 last:border-0 dark:border-white/5"
                  >
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                      {categoryLabels[b.category] ?? b.category}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-50">
                      {b.academicYear}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                      {b.formation ?? (
                        <span className="italic text-zinc-400 dark:text-zinc-500">Sans filière</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                      {b.level ?? (
                        <span className="italic text-zinc-400 dark:text-zinc-500">Sans niveau</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{b.count}</td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{b.unusedCount}</td>
                    <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{usedCount}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col items-start gap-2">
                        <div className="flex gap-2">
                          <DeleteBatchButton
                            academicYear={b.academicYear}
                            category={b.category}
                            categoryLabel={categoryLabels[b.category] ?? b.category}
                            formation={b.formation}
                            level={b.level}
                            unusedCount={b.unusedCount}
                          />
                          <DeleteBatchStudentsButton
                            academicYear={b.academicYear}
                            category={b.category}
                            categoryLabel={categoryLabels[b.category] ?? b.category}
                            formation={b.formation}
                            level={b.level}
                            usedCount={usedCount}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
