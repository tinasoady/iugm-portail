import Link from "next/link";

import { getSettings } from "@/lib/settings";
import { ThemeToggle } from "@/app/ui/theme-toggle";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const settings = await getSettings();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="absolute top-4 right-4 rounded-full bg-white/10">
        <ThemeToggle className="text-zinc-300 hover:bg-white/10 hover:text-white dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white" />
      </div>

      <main className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 shadow-2xl dark:bg-zinc-900">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Mot de passe oublié
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {settings.institutionName}
          </p>
        </div>

        <ForgotPasswordForm />

        <p className="mt-6 text-center text-sm">
          <Link
            href="/login"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Retour à la connexion
          </Link>
        </p>
      </main>
    </div>
  );
}
