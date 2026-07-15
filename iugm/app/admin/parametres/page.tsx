import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { AppShell } from "@/app/ui/app-shell";
import { InstitutionForm } from "./institution-form";
import { LogoForm } from "./logo-form";
import { TariffRow, AddTariffForm } from "./tariff-forms";

const amountFormatter = new Intl.NumberFormat("fr-FR");

export default async function ParametresPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPERADMIN") redirect("/");

  const [settings, tariffs] = await Promise.all([
    getSettings(),
    prisma.tariff.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

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

      {/* Tarifs */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Tarifs ({tariffs.length})
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Droits d&apos;inscription, frais de scolarité par niveau ou type de formation... Montants
          en ariary. Modifiez une ligne puis « Enregistrer », ou supprimez-la.
        </p>

        <div className="space-y-3">
          {tariffs.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Aucun tarif configuré pour le moment.
            </p>
          )}
          {tariffs.map((t) => (
            <TariffRow key={t.id} id={t.id} label={t.label} amount={t.amount} />
          ))}
        </div>

        <div className="mt-6 border-t border-black/5 pt-4 dark:border-white/10">
          <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Ajouter un tarif
          </h3>
          <AddTariffForm />
        </div>

        {tariffs.length > 0 && (
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Total configuré :{" "}
            {amountFormatter.format(tariffs.reduce((sum, t) => sum + t.amount, 0))} Ar sur{" "}
            {tariffs.length} tarif(s).
          </p>
        )}
      </section>
    </AppShell>
  );
}
