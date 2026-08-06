"use client";

import type { ReactNode } from "react";
import Link from "next/link";

// Carte statistique, façon tableau de bord moderne. `href` optionnel : la
// carte devient un lien (ex. accès rapide vers la liste filtrée d'un rôle
// sur le tableau de bord superadmin) sans rien changer pour les usages
// purement informatifs qui ne le passent pas.
export function StatCard({
  label,
  value,
  sublabel,
  color,
  icon,
  compact = false,
  href,
  active = false,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  color: string; // ex: "bg-violet-600"
  icon: ReactNode;
  compact?: boolean;
  href?: string;
  active?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`font-semibold uppercase tracking-wider text-white/85 ${compact ? "text-[10px]" : "text-xs"}`}>{label}</p>
        <span className={`shrink-0 rounded-full bg-white/20 ${compact ? "p-1.5 [&>svg]:h-4 [&>svg]:w-4" : "p-2"}`}>{icon}</span>
      </div>
      <p className={`mt-2 font-bold ${compact ? "text-2xl" : "text-3xl"}`}>{value}</p>
      {sublabel && <p className={`mt-0.5 text-white/80 ${compact ? "text-[11px]" : "text-sm"}`}>{sublabel}</p>}
      {/* Cercle décoratif */}
      <div className={`pointer-events-none absolute -right-6 -bottom-8 rounded-full bg-white/10 ${compact ? "h-20 w-20" : "h-28 w-28"}`} />
    </>
  );

  const className = `relative overflow-hidden rounded-2xl ${color} text-white shadow-lg transition-transform duration-200 hover:scale-[1.02] hover:shadow-xl ${compact ? "p-3" : "p-5"} ${active ? "ring-2 ring-white ring-offset-2 ring-offset-black/20" : ""}`;

  if (href) {
    return (
      <Link href={href} className={`block ${className} focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
