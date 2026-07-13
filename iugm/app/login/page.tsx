import React from "react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Connexion
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Accès réservé aux personnels autorisés.
          </p>
        </div>

        <form
          className="space-y-4"
          action="/api/auth/login"
          method="post"
        >
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
              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50"
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
              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Se connecter
          </button>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Aucun compte d’inscription ici : les logins sont attribués par l’université.
          </p>
        </form>

        <div className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          <p className="text-zinc-500 dark:text-zinc-400 bg-blend-color-dodge">
            @IUGM-MAHAJANGA
          </p>
        </div>
      </div>
    </div>
  );
}

