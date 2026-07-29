import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hasTaskPermission } from "@/lib/permissions";
import { AppShell } from "@/app/ui/app-shell";
import { TariffRow, AddTariffForm } from "@/app/admin/parametres/tariff-forms";

// Service finance : mêmes tarifs, mêmes actions serveur que la page
// Paramètres (voir requireTariffAccess dans admin/parametres/actions.ts) —
// exposés ici pour que l'agent d'administration chargé de l'écolage puisse
// fixer les frais de scolarité sans passer par les Paramètres (superadmin).
export default async function TarifsEcolagePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) redirect("/");
  if (!(await hasTaskPermission(session.sub, session.role, "ecolage"))) redirect("/agent-admin");

  const tariffs = await prisma.tariff.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Tarifs — Service finance"
      active="/agent-admin/ecolage/tarifs"
    >
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Tarifs ({tariffs.length})
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Droits d&apos;inscription, frais de scolarité par filière... Montants en ariary. Un
          tarif associé à une filière sert de montant annuel d&apos;écolage pour cette filière :
          les agents n&apos;ont plus qu&apos;à choisir « 1ère tranche » (moitié) ou « Totalité »
          lors de l&apos;enregistrement d&apos;un versement, et le solde restant s&apos;affiche
          automatiquement sur le profil de l&apos;étudiant.
        </p>

        <div className="space-y-3">
          {tariffs.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Aucun tarif configuré pour le moment.
            </p>
          )}
          {tariffs.map((t) => (
            <TariffRow
              key={t.id}
              id={t.id}
              label={t.label}
              amount={t.amount}
              formation={t.formation}
            />
          ))}
        </div>

        <div className="mt-6 border-t border-black/5 pt-4 dark:border-white/10">
          <h3 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Ajouter un tarif
          </h3>
          <AddTariffForm />
        </div>
      </section>
    </AppShell>
  );
}
