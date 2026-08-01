"use client";

import { useEffect, useRef, useState } from "react";

import {
  searchPreselectionAction,
  getPreselectionPrefillAction,
} from "./actions";
import type { PreselectionSearchResult } from "@/lib/preselection";
import { InscriptionWizard } from "./wizard";

// Point d'entrée de la page Inscription : l'agent cherche d'abord le
// candidat dans les fiches importées par le superadmin (présélection des
// nouveaux L1, ou dossiers déjà existants d'autres niveaux — voir
// /admin/base-donnees) ; s'il le trouve, le formulaire se pré-remplit
// et il ne reste qu'à vérifier les pièces. S'il ne le trouve pas (candidat
// hors présélection, cas particulier...), « Inscrire un étudiant » ouvre le
// même formulaire vide, exactement comme avant cette fonctionnalité.
export function InscriptionEntry({
  years,
  defaultYear,
  userFormation,
}: {
  years: string[];
  defaultYear: string;
  // Secrétaire de formation : filière à laquelle l'agent est rattaché (null
  // pour le superadmin ou un agent sans restriction) — transmise au wizard
  // pour limiter le choix de formation et éviter l'erreur.
  userFormation?: string | null;
}) {
  const [mode, setMode] = useState<"search" | "form">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PreselectionSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    id: string;
    values: Record<string, string>;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Débounce géré directement dans le gestionnaire de saisie (pas dans un
  // effet) : la recherche est un événement déclenché par la frappe, pas une
  // synchronisation avec un système externe.
  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchPreselectionAction(q);
        setResults(r);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  // Annule une recherche en attente si le composant est démonté en cours de route
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function choose(candidate: PreselectionSearchResult) {
    setLoadingId(candidate.id);
    setPrefillError(null);
    try {
      const { values, error } = await getPreselectionPrefillAction(candidate.id);
      if (error) {
        setPrefillError(error);
        return;
      }
      setSelected({ id: candidate.id, values });
      setMode("form");
    } finally {
      setLoadingId(null);
    }
  }

  if (mode === "form") {
    // Le sélecteur d'année du wizard est calculé à partir de la date du jour
    // (page.tsx) : si la fiche de présélection vient d'une année en dehors de
    // cette fenêtre (ancien import non encore purgé), on l'ajoute pour que le
    // champ pré-rempli corresponde bien à une option existante.
    const candidateYear = selected?.values.academicYear;
    const wizardYears =
      candidateYear && !years.includes(candidateYear) ? [candidateYear, ...years] : years;

    return (
      <div className="mx-auto w-full max-w-4xl">
        <button
          type="button"
          onClick={() => {
            setMode("search");
            setSelected(null);
          }}
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          ← Retour à la recherche
        </button>
        <InscriptionWizard
          key={selected?.id ?? "manual"}
          years={wizardYears}
          defaultYear={defaultYear}
          initialValues={selected?.values}
          preselectionId={selected?.id ?? null}
          userFormation={userFormation}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-zinc-900">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Rechercher un étudiant dans la base de données
        </h2>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Tapez le nom de l&apos;étudiant : s&apos;il figure dans la présélection ou parmi les
          dossiers déjà existants à l&apos;université (importés par le superadmin), son dossier se
          pré-remplit automatiquement.
        </p>

        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Nom de l'étudiant (ex : RAKOTO Jean)"
            autoFocus
            className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50"
          />

          {query.trim().length >= 2 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-950">
              {searching ? (
                <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Recherche...
                </p>
              ) : results.length === 0 ? (
                <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Aucun candidat présélectionné ne correspond à « {query.trim()} ». Utilisez «
                  Inscrire un étudiant » ci-dessous.
                </p>
              ) : (
                <ul>
                  {results.map((r) => (
                    <li key={r.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                      <button
                        type="button"
                        disabled={r.used || loadingId === r.id}
                        onClick={() => choose(r)}
                        className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-900"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                              {r.fullName}
                            </span>
                            <span
                              className={
                                r.category === "EXISTING"
                                  ? "rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                                  : "rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                              }
                            >
                              {r.category === "EXISTING" ? "Dossier existant" : "Présélection"}
                            </span>
                          </span>
                          {r.used && (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              déjà inscrit{r.usedMatricule ? ` (${r.usedMatricule})` : ""}
                            </span>
                          )}
                          {loadingId === r.id && (
                            <span className="text-[11px] text-zinc-400">Chargement...</span>
                          )}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {[r.cin && `CIN ${r.cin}`, r.baccNumber && `Bacc n° ${r.baccNumber}`, r.formation, r.level, r.academicYear]
                            .filter(Boolean)
                            .join(" · ") || "Aucun détail complémentaire"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {prefillError && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {prefillError}
          </p>
        )}

        <div className="mt-6 flex items-center gap-3 border-t border-black/5 pt-6 dark:border-white/10">
          <p className="flex-1 text-xs text-zinc-500 dark:text-zinc-400">
            Étudiant absent de la présélection, ou cas particulier ?
          </p>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setMode("form");
            }}
            className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500"
          >
            + Inscrire un étudiant
          </button>
        </div>
      </div>
    </div>
  );
}
