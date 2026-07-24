"use client";

import type { ReactNode } from "react";

// Carte statistique en dégradé, façon tableau de bord moderne
export function StatCard({
  label,
  value,
  sublabel,
  gradient,
  icon,
  compact = false,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  gradient: string; // ex: "from-violet-500 to-purple-600"
  icon: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-linear-to-br ${gradient} text-white shadow-lg transition-transform duration-200 hover:scale-[1.02] hover:shadow-xl ${compact ? "p-3" : "p-5"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-semibold uppercase tracking-wider text-white/85 ${compact ? "text-[10px]" : "text-xs"}`}>{label}</p>
        <span className={`shrink-0 rounded-full bg-white/20 ${compact ? "p-1.5 [&>svg]:h-4 [&>svg]:w-4" : "p-2"}`}>{icon}</span>
      </div>
      <p className={`mt-2 font-bold ${compact ? "text-2xl" : "text-3xl"}`}>{value}</p>
      {sublabel && <p className={`mt-0.5 text-white/80 ${compact ? "text-[11px]" : "text-sm"}`}>{sublabel}</p>}
      {/* Cercle décoratif */}
      <div className={`pointer-events-none absolute -right-6 -bottom-8 rounded-full bg-white/10 ${compact ? "h-20 w-20" : "h-28 w-28"}`} />
    </div>
  );
}
