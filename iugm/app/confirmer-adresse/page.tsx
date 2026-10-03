import Link from "next/link";

import { inspectRecoveryToken } from "@/lib/recovery-email";
import { getSettings } from "@/lib/settings";
import { ThemeToggle } from "@/app/ui/theme-toggle";
import { ConfirmForm } from "./confirm-form";

export const dynamic = "force-dynamic";

// Jamais indexée : l'adresse contient un jeton
export const metadata = { robots: { index: false, follow: false } };

// Page ouverte depuis le lien d'un e-mail, parfois sans session : publique (voir
// proxy.ts). Elle ne modifie RIEN au chargement ; seul le bouton confirme.
export default async function ConfirmRecoveryEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const [settings, inspected] = await Promise.all([getSettings(), inspectRecoveryToken(token)]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="absolute top-4 right-4 rounded-full bg-white/10">
        <ThemeToggle className="text-zinc-300 hover:bg-white/10 hover:text-white dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white" />
      </div>

      <main className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 shadow-2xl dark:bg-zinc-900">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Adresse de récupération
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{settings.institutionName}</p>
        </div>

        {inspected.usable ? (
          <ConfirmForm token={token} maskedEmail={inspected.maskedEmail} />
        ) : (
          <div role="alert" className="space-y-3 text-center text-sm text-zinc-600 dark:text-zinc-400">
            <p>Ce lien est invalide ou a expiré.</p>
            <p className="text-xs">
              Si vous venez d&apos;actualiser la page, rouvrez le lien depuis votre e-mail : pour votre
              sécurité, il n&apos;est plus conservé dans l&apos;adresse du navigateur.
            </p>
            <Link
              href="/login"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Aller à la connexion
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
