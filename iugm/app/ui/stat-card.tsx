import type { ReactNode } from "react";

// Carte statistique en dégradé, façon tableau de bord moderne
export function StatCard({
  label,
  value,
  sublabel,
  gradient,
  icon,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  gradient: string; // ex: "from-violet-500 to-purple-600"
  icon: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-linear-to-br ${gradient} p-5 text-white shadow-lg`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/85">{label}</p>
        <span className="shrink-0 rounded-full bg-white/20 p-2">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {sublabel && <p className="mt-0.5 text-sm text-white/80">{sublabel}</p>}
      {/* Cercle décoratif */}
      <div className="pointer-events-none absolute -right-6 -bottom-8 h-28 w-28 rounded-full bg-white/10" />
    </div>
  );
}
