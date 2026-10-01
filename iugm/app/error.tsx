"use client";

import Link from "next/link";

// Erreur inattendue dans une page : message sobre, jamais le détail technique
// (en production Next.js ne transmet de toute façon qu'un identifiant). La
// référence permet à l'administrateur de retrouver l'erreur dans les journaux
// du serveur (voir instrumentation.ts).
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 text-center shadow-lg dark:border-white/10 dark:bg-zinc-900"
      >
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Une erreur est survenue
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          L&apos;opération n&apos;a pas pu aboutir. Vos données déjà enregistrées ne sont pas
          affectées. Réessayez, et si le problème persiste, contactez l&apos;administration.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            Référence à communiquer : <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="rounded-xl border border-black/10 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
