import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getLevelFinancialInfos } from "@/lib/finance";
import { AppShell } from "@/app/ui/app-shell";
import { InstitutionForm } from "./institution-form";
import { LogoForm } from "./logo-form";
import { FinancialInfoForm } from "./financial-info-forms";
import { TestEmailForm } from "./test-email-form";
import { getMailStatus } from "@/lib/mailer";
import { getTrustedAppOrigin } from "@/lib/url";

export default async function ParametresPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPERADMIN") redirect("/");

  const [settings, financialInfos, origin] = await Promise.all([
    getSettings(),
    getLevelFinancialInfos(),
    getTrustedAppOrigin().catch(() => null),
  ]);
  const mail = getMailStatus();

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Paramètres de l'établissement"
      active="/admin/parametres"
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Logo */}
        <section className="h-fit rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Logo de l&apos;établissement
          </h2>
          <LogoForm currentLogo={settings.logo} />
        </section>

        {/* Informations */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Informations de l&apos;établissement
          </h2>
          <InstitutionForm settings={settings} />
        </section>
      </div>

      {/* E-mails : état de la configuration + essai d'envoi */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Envoi d&apos;e-mails
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Sert au « mot de passe oublié » et aux notifications aux étudiants. Les réglages se font
          dans les variables d&apos;environnement du serveur (voir docs/DEPLOIEMENT.md), jamais ici :
          un mot de passe SMTP ne doit pas transiter par l&apos;application.
        </p>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <p
              className={
                mail.mode === "none"
                  ? "inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300"
                  : mail.mode === "log"
                    ? "inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              }
            >
              {mail.mode === "none"
                ? "Non configuré"
                : mail.mode === "log"
                  ? "Mode journal (aucun envoi réel)"
                  : "Configuré"}
            </p>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-zinc-500 dark:text-zinc-400">Serveur</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">
                {mail.host ? `${mail.host}:${mail.port} (${mail.secure ? "TLS direct" : "STARTTLS"})` : "—"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Expéditeur</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{mail.from ?? "—"}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Identifiants</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">
                {mail.hasCredentials ? "renseignés" : "non renseignés"}
              </dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Liens des e-mails</dt>
              <dd className="break-all text-zinc-900 dark:text-zinc-50">
                {origin ?? "aucun lien (définissez APP_URL)"}
              </dd>
            </dl>

            {mail.missing.length > 0 && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                Variable(s) manquante(s) : <strong>{mail.missing.join(", ")}</strong>
              </p>
            )}
            {mail.warnings.map((warning) => (
              <p
                key={warning}
                className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              >
                {warning}
              </p>
            ))}
          </div>

          <TestEmailForm defaultTo={session.email} disabled={mail.mode === "none"} />
        </div>
      </section>

      {/* Renseignements financiers */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Renseignements financiers
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Montants par niveau (L1 à M2), en ariary : droit d&apos;inscription, assurance, polo,
          frais de formation annuel et premier versement. Le polo n&apos;est en principe dû que
          par un nouvel étudiant (optionnel pour un ancien étudiant). Le paiement à
          l&apos;inscription d&apos;un dossier n&apos;est validé que s&apos;il couvre au moins le
          droit d&apos;inscription + l&apos;assurance + le polo + le premier versement du niveau.
        </p>

        <div className="space-y-3">
          {financialInfos.map((info) => (
            <FinancialInfoForm key={info.level} info={info} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}
