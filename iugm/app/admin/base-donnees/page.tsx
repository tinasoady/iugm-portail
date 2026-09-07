import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { defaultEnrollmentYear } from "@/lib/students";
import { getPreselectionBatchSummary } from "@/lib/preselection";
import { AppShell } from "@/app/ui/app-shell";
import { ImportPreselectionForm } from "./import-form";
import { BatchesTable } from "./batches-table";

const CATEGORY_LABELS: Record<string, string> = {
  PRESELECTION: "Présélection (nouveaux L1)",
  EXISTING: "Dossiers existants (autres niveaux)",
};

export default async function BaseDonneesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPERADMIN") redirect("/");

  const defaultYear = defaultEnrollmentYear();
  const startYear = Number(defaultYear.split("-")[0]);
  const years = [
    `${startYear - 1}-${startYear}`,
    defaultYear,
    `${startYear + 1}-${startYear + 2}`,
  ];

  const batches = await getPreselectionBatchSummary();

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Base de données"
      active="/admin/base-donnees"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section className="h-fit rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Importer des fiches
          </h2>
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            Deux types de fichiers peuvent être importés, avec un traitement différent :
          </p>
          <ul className="mb-2 list-disc space-y-1 pl-4 text-xs text-zinc-500 dark:text-zinc-400">
            <li>
              <strong className="text-zinc-700 dark:text-zinc-300">Présélection (nouveaux L1)</strong> :
              les fiches restent en attente et apparaissent dans la recherche de la page
              Inscription — l&apos;agent tape le nom, le dossier se pré-remplit, il ne reste
              qu&apos;à vérifier les pièces et valider.
            </li>
            <li>
              <strong className="text-zinc-700 dark:text-zinc-300">Dossiers existants (autres niveaux)</strong> :
              chaque fiche crée directement un dossier « Enregistré », visible tout de suite dans
              « Dossiers étudiants », avec l&apos;écolage de l&apos;année présumé déjà réglé (pas
              de reçu bancaire à vérifier) — l&apos;agent n&apos;a plus qu&apos;à compléter les
              infos manquantes, valider et créer le compte de connexion, et peut corriger
              l&apos;écolage au cas par cas si besoin.
            </li>
          </ul>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Dans les deux cas, plus besoin de tout ressaisir à la main : ça évite de faire attendre
            les étudiants.
          </p>
          <ImportPreselectionForm years={years} defaultYear={defaultYear} />
        </section>

        <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Lots importés
          </h2>
          {batches.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Aucune fiche importée pour le moment.
            </p>
          ) : (
            <BatchesTable batches={batches} categoryLabels={CATEGORY_LABELS} />
          )}
        </section>
      </div>
    </AppShell>
  );
}
