import Link from "next/link";

// Pied de liste « N sur M affichés » + bouton « Voir plus ». Rien n'est rendu
// quand toute la liste tient dans la première tranche. `scroll={false}` garde
// la position de lecture au rechargement.
export function ShowMore({
  shown,
  total,
  href,
  canLoadMore,
  pageSize,
}: {
  shown: number;
  total: number;
  href: string;
  canLoadMore: boolean;
  pageSize: number;
}) {
  if (total <= pageSize) return null;

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <p className="text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
        {shown} sur {total} affichés
      </p>
      {canLoadMore && (
        <Link
          href={href}
          scroll={false}
          className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Voir plus
        </Link>
      )}
    </div>
  );
}
