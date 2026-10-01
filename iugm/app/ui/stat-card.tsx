import type { ReactNode } from "react";
import Link from "next/link";

// Carte statistique, façon tableau de bord dense : fond neutre, bordure
// fine, puce d'icône colorée — pas de tuile pleine couleur ni d'animation
// au survol (aucun effet « électrique »). `href` optionnel : la carte
// devient un lien (ex. accès rapide vers la liste filtrée d'un rôle sur le
// tableau de bord superadmin) sans rien changer pour les usages purement
// informatifs qui ne le passent pas.
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
  color: string; // ex: "bg-violet-600" — couleur de la puce d'icône
  icon: ReactNode;
  compact?: boolean;
  href?: string;
  active?: boolean;
}) {
  // Mobile-first : toujours compact sur petit écran (2 cartes/ligne dès un
  // téléphone) ; `compact` force ce format resserré même à partir de `sm`,
  // sinon la carte reprend sa taille confortable à partir de `sm`.
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p
          className={`font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 ${compact ? "text-[10px]" : "text-[10px] sm:text-xs"}`}
        >
          {label}
        </p>
        <span
          className={`shrink-0 rounded-lg text-white ${color} ${compact ? "p-1.5 [&>svg]:h-3.5 [&>svg]:w-3.5" : "p-1.5 [&>svg]:h-3.5 [&>svg]:w-3.5 sm:p-2 sm:[&>svg]:h-4 sm:[&>svg]:w-4"}`}
        >
          {icon}
        </span>
      </div>
      <p
        className={`mt-1.5 font-bold tabular-nums text-zinc-900 sm:mt-2 dark:text-zinc-50 ${compact ? "text-xl sm:text-2xl" : "text-xl sm:text-3xl"}`}
      >
        {value}
      </p>
      {sublabel && (
        <p className={`mt-0.5 text-zinc-500 dark:text-zinc-400 ${compact ? "text-[11px]" : "text-[11px] sm:text-sm"}`}>
          {sublabel}
        </p>
      )}
    </>
  );

  const className = `relative block rounded-xl border bg-white transition-colors dark:bg-zinc-900 ${
    active
      ? "border-zinc-300 ring-1 ring-zinc-300 dark:border-zinc-600 dark:ring-zinc-600"
      : "border-black/5 dark:border-white/10"
  } ${href ? "hover:border-zinc-300 dark:hover:border-zinc-700" : ""} ${compact ? "p-3" : "p-3 sm:p-5"}`;

  if (href) {
    return (
      <Link
        href={href}
        className={`${className} focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400`}
      >
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
