import { getSettings } from "@/lib/settings";
import { ThemeToggle } from "@/app/ui/theme-toggle";
import { LoginForm } from "./login-form";

// Page publique sans cookies()/getSession() : Next.js la traiterait sinon
// comme statique et tenterait de lire les paramètres en base pendant le
// build (échec si la DB n'est pas joignable à ce moment-là, ex. en CI).
export const dynamic = "force-dynamic";

// Motifs de fermeture de session (voir SessionFailure dans lib/auth.ts) ; toute
// autre valeur d'URL est ignorée : on n'affiche jamais un texte venu de l'adresse.
const SESSION_CLOSED_MESSAGES: Record<string, string> = {
  replaced:
    "Votre compte vient de se connecter sur un autre appareil : cette session a été fermée (un compte n'est connecté qu'à un endroit à la fois). Si ce n'était pas vous, changez votre mot de passe.",
  disabled: "Ce compte a été désactivé ou supprimé. Contactez l'administration.",
  revoked: "Votre mot de passe a été modifié : reconnectez-vous.",
  expired: "Votre session a expiré : reconnectez-vous.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reinitialise?: string; raison?: string; active?: string }>;
}) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      {/* Bascule clair/sombre (le fond de la page reste sombre, la carte s'adapte) */}
      <div className="absolute top-4 right-4 rounded-full bg-white/10">
        <ThemeToggle className="text-zinc-300 hover:bg-white/10 hover:text-white dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white" />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 shadow-2xl dark:bg-zinc-900">
        <div className="mb-6 flex flex-col items-center text-center">
          {settings.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image inutile ici
            <img
              src={settings.logo}
              alt={`Logo ${settings.institutionAcronym}`}
              className="mb-3 h-14 w-14 rounded-xl bg-white object-contain p-1 shadow-lg"
            />
          ) : (
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-base font-bold text-white shadow-lg">
              IU
            </div>
          )}
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Connexion</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {settings.institutionName}
          </p>
        </div>

        {params.raison && Object.hasOwn(SESSION_CLOSED_MESSAGES, params.raison) && (
          <p
            role="status"
            className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          >
            {SESSION_CLOSED_MESSAGES[params.raison]}
          </p>
        )}

        {params.active === "1" && (
          <p
            role="status"
            className="mb-4 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
          >
            Compte activé. Connectez-vous avec votre nom d&apos;utilisateur et le mot de passe que vous venez de choisir.
          </p>
        )}

        {params.reinitialise === "1" && (
          <p
            role="status"
            className="mb-4 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
          >
            Mot de passe modifié. Vous pouvez vous connecter.
          </p>
        )}

        <LoginForm />

        <div className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          @{settings.institutionAcronym}-{(settings.city ?? "").toUpperCase()}
        </div>
      </div>
    </div>
  );
}
