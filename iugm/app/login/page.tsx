import React from "react";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4">
      {/* Halos décoratifs en arrière-plan */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-violet-600/25 blur-3xl" />

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 shadow-2xl dark:bg-zinc-900">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-lg">
            IU
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Connexion</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Accès réservé aux personnels autorisés.
          </p>
        </div>

        <form className="space-y-4" action="/api/auth/login" method="post">
          <div>
            <label
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
              htmlFor="password"
            >
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-indigo-500 hover:to-violet-500"
          >
            Se connecter
          </button>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Aucun compte d&apos;inscription ici : les logins sont attribués par l&apos;université.
          </p>
        </form>

        <div className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          @IUGM-MAHAJANGA
        </div>
      </div>
    </div>
  );
}
