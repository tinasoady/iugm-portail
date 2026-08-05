import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getLevelFinancialInfos } from "@/lib/finance";
import { AppShell } from "@/app/ui/app-shell";
import { InstitutionForm } from "./institution-form";
import { LogoForm } from "./logo-form";
import { FinancialInfoForm } from "./financial-info-forms";

export default async function ParametresPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPERADMIN") redirect("/");

  const [settings, financialInfos] = await Promise.all([getSettings(), getLevelFinancialInfos()]);

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Paramètres de l'établissement"
      active="/admin/parametres"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr]">
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
