import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 text-center shadow-lg dark:border-white/10 dark:bg-zinc-900">
        <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">404</p>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Page introuvable
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Cette page n&apos;existe pas, ou vous n&apos;avez pas le droit d&apos;y accéder.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
