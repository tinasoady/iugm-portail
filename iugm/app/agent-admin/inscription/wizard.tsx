"use client";

import { useActionState, useRef, useState } from "react";
import { FaCheck, FaCheckCircle, FaTimes } from "react-icons/fa";
import { registerInscriptionAction, type InscriptionState } from "./actions";

const STEPS = [
  { title: "Étudiant", subtitle: "Renseignements sur l'étudiant" },
  { title: "Baccalauréat", subtitle: "Renseignements sur le baccalauréat" },
  { title: "Parents", subtitle: "Parents et personne à contacter d'urgence" },
  { title: "Inscription", subtitle: "Choix de la formation" },
  { title: "Pièces", subtitle: "Vérification des pièces du dossier" },
  { title: "Récapitulatif", subtitle: "Vérification avant validation" },
];

import { FORMATIONS } from "@/lib/formations";

// Pièces du dossier à vérifier à la réception
const DOCUMENTS: Array<[string, string]> = [
  ["docResidenceCert", "Certificat de résidence de l'étudiant"],
  ["docCinCopy", "Copie légalisée de la CIN (ou acte d'état civil pour le mineur)"],
  ["docParentCin", "CIN légalisée du parent"],
  ["docPhotos", "4 photos d'identité récentes"],
  ["docPinkFolder", "Papier chemise ROSE"],
  [
    "docPaymentSlip",
    "Bordereau de versement (droit d'inscription, assurance, t-shirt/polo, premier versement)",
  ],
  ["docEngagementLetter", "Lettre d'engagement manuscrite co-signée par les parents"],
];

// Libellés pour le récapitulatif (dans l'ordre d'affichage)
const FIELD_LABELS: Record<string, string> = {
  lastName: "Nom",
  firstName: "Prénom",
  nationality: "Nationalité",
  gender: "Sexe",
  birthDate: "Date de naissance",
  birthPlace: "Lieu de naissance",
  cin: "N° CIN",
  cinIssueDate: "CIN délivrée le",
  cinIssuePlace: "CIN délivrée à",
  phone: "Téléphone étudiant",
  personalEmail: "Email étudiant",
  address: "Adresse exacte",
  maritalStatus: "Situation familiale",
  baccNumber: "N° du bacc",
  baccSeries: "Série du bacc",
  baccMention: "Mention au bacc",
  baccYear: "Année d'obtention",
  baccCenter: "Centre d'examen",
  baccCountry: "Pays",
  previousSchool: "Établissement d'origine",
  previousUniversity: "Inscription antérieure à l'université",
  fatherName: "Nom du père",
  motherName: "Nom de la mère",
  parentsPhone: "Téléphone des parents",
  parentsAddress: "Adresse des parents",
  parentsCity: "Ville des parents",
  guardianName: "Personne à contacter d'urgence",
  guardianPhone: "Téléphone (urgence)",
  guardianAddress: "Adresse exacte (urgence)",
  academicYear: "Année universitaire",
  formation: "Formation choisie",
  level: "Niveau",
};

// Niveaux d'entrée possibles (inscription directe en L2, L3, M1... autorisée)
const LEVELS = ["L1", "L2", "L3", "M1", "M2"];

const VALUE_LABELS: Record<string, Record<string, string>> = {
  gender: { M: "Masculin", F: "Féminin" },
};

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";
const primaryButtonClass =
  "rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-500 disabled:opacity-50";
const secondaryButtonClass =
  "rounded-xl border border-black/10 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800";

// Bouton à choix unique (remplace les <select> pour ce formulaire) : un seul
// clic direct sur le libellé suffit, plus rapide qu'ouvrir un menu déroulant
// puis choisir une option — important pour des agents peu à l'aise avec l'informatique.
const pillClass =
  "cursor-pointer rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-zinc-700 transition select-none has-checked:border-indigo-600 has-checked:bg-indigo-600 has-checked:text-white dark:border-white/10 dark:text-zinc-300 dark:has-checked:border-indigo-500 dark:has-checked:bg-indigo-600 dark:has-checked:text-white";

function RadioPills({
  name,
  value,
  options,
  required = true,
}: {
  name: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <label key={opt.value} className={pillClass}>
          <input
            type="radio"
            name={name}
            value={opt.value}
            required={required}
            defaultChecked={value === opt.value}
            className="sr-only"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

const initialState: InscriptionState = {};

export function InscriptionWizard({
  years,
  defaultYear,
  initialValues,
  preselectionId,
  userFormation,
}: {
  years: string[];
  defaultYear: string;
  // Pré-remplissage depuis une fiche de présélection choisie dans la
  // recherche (voir search-entry.tsx) ; absent pour une saisie manuelle.
  initialValues?: Record<string, string>;
  preselectionId?: string | null;
  // Secrétaire de formation : seule cette filière reste sélectionnable dans
  // le choix de formation, pour éviter d'inscrire par erreur dans une autre.
  userFormation?: string | null;
}) {
  const [step, setStep] = useState(0);
  // Valeurs saisies, alimentées en continu pour le récapitulatif — pré-remplies
  // d'entrée si l'inscription part d'une fiche de présélection
  const [values, setValues] = useState<Record<string, string>>({
    nationality: "Malagasy",
    maritalStatus: "Célibataire",
    academicYear: defaultYear,
    level: "L1",
    baccCountry: "Madagascar",
    // Secrétaire de formation : sa filière est la seule sélectionnable, donc
    // autant la présélectionner d'entrée (initialValues garde la priorité si
    // une fiche de présélection précise déjà une formation).
    ...(userFormation ? { formation: userFormation } : {}),
    ...initialValues,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(registerInscriptionAction, initialState);

  // Valide les champs de l'étape courante avant de passer à la suivante
  function next() {
    const container = formRef.current?.querySelector(`[data-step="${step}"]`);
    if (container) {
      const fields = container.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "input, select",
      );
      for (const field of fields) {
        if (!field.reportValidity()) return;
      }
    }
    setStep(step + 1);
  }

  // Écran de succès : matricule généré
  if (state.matricule) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-black/5 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
          <FaCheckCircle size={28} />
        </div>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Inscription enregistrée !
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{state.fullName}</p>
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Numéro matricule généré :</p>
        <p className="mt-1 font-mono text-3xl font-bold text-indigo-600 dark:text-indigo-400">
          {state.matricule}
        </p>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{state.success}</p>
        <div className="mt-6 flex justify-center gap-3">
          <a href="/agent-admin/inscription" className={primaryButtonClass}>
            + Nouvelle inscription
          </a>
          <a href="/agent-admin" className={secondaryButtonClass}>
            Voir les dossiers
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-zinc-900">
      {preselectionId && (
        <p className="mb-6 flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <FaCheck size={12} className="shrink-0" /> Dossier pré-rempli depuis la présélection — vérifiez chaque champ et les pièces avant de
          valider.
        </p>
      )}

      {/* Barre de progression */}
      <ol className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <div
                className={`h-1 flex-1 rounded-full ${i === 0 ? "opacity-0" : i <= step ? "bg-indigo-500" : "bg-zinc-200 dark:bg-zinc-800"}`}
              />
              <div
                className={
                  i < step
                    ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white"
                    : i === step
                      ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white ring-4 ring-indigo-500/20"
                      : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }
              >
                {i < step ? <FaCheck size={12} /> : i + 1}
              </div>
              <div
                className={`h-1 flex-1 rounded-full ${i === STEPS.length - 1 ? "opacity-0" : i < step ? "bg-indigo-500" : "bg-zinc-200 dark:bg-zinc-800"}`}
              />
            </div>
            <span
              className={`hidden text-center text-[11px] font-medium sm:block ${i === step ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400 dark:text-zinc-500"}`}
            >
              {s.title}
            </span>
          </li>
        ))}
      </ol>

      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Étape {step + 1} / {STEPS.length} — {STEPS[step].subtitle}
        </h2>
      </div>

      <form
        ref={formRef}
        action={formAction}
        onChange={(e) => {
          // Alimente le récapitulatif au fil de la saisie (délégation d'événement)
          const target = e.target as unknown as HTMLInputElement | HTMLSelectElement;
          if (!target.name) return;
          const value =
            target instanceof HTMLInputElement && target.type === "checkbox"
              ? target.checked
                ? "on"
                : ""
              : target.value;
          setValues((v) => ({ ...v, [target.name]: value }));
        }}
      >
        {preselectionId && <input type="hidden" name="preselectionId" value={preselectionId} />}

        {/* Étape 1 : Renseignements sur l'étudiant */}
        <div data-step="0" className={step === 0 ? "space-y-4" : "hidden"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="lastName">Nom *</label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                required
                defaultValue={values.lastName ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="firstName">Prénom</label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                defaultValue={values.firstName ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <p className={labelClass}>Nationalité *</p>
              <RadioPills
                name="nationality"
                value={values.nationality ?? "Malagasy"}
                options={[
                  { value: "Malagasy", label: "Malagasy" },
                  { value: "Étranger", label: "Étranger" },
                ]}
              />
            </div>
            <div>
              <p className={labelClass}>Sexe *</p>
              <RadioPills
                name="gender"
                value={values.gender}
                options={[
                  { value: "M", label: "Masculin" },
                  { value: "F", label: "Féminin" },
                ]}
              />
            </div>
            <div>
              <p className={labelClass}>Situation familiale *</p>
              <RadioPills
                name="maritalStatus"
                value={values.maritalStatus ?? "Célibataire"}
                options={[
                  { value: "Célibataire", label: "Célibataire" },
                  { value: "Marié(e)", label: "Marié(e)" },
                  { value: "Salarié(e)", label: "Salarié(e)" },
                ]}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="birthDate">Date de naissance *</label>
              <input
                id="birthDate"
                name="birthDate"
                type="date"
                required
                defaultValue={values.birthDate ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="birthPlace">Lieu de naissance *</label>
              <input
                id="birthPlace"
                name="birthPlace"
                type="text"
                required
                defaultValue={values.birthPlace ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="cin">N° CIN</label>
              <input
                id="cin"
                name="cin"
                type="text"
                placeholder="ex : 101 011 123 456"
                defaultValue={values.cin ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cinIssueDate">Date de délivrance</label>
              <input
                id="cinIssueDate"
                name="cinIssueDate"
                type="date"
                defaultValue={values.cinIssueDate ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cinIssuePlace">Lieu de délivrance</label>
              <input
                id="cinIssuePlace"
                name="cinIssuePlace"
                type="text"
                defaultValue={values.cinIssuePlace ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            CIN facultative pour un étudiant mineur (fournir l&apos;acte d&apos;état civil dans les
            pièces du dossier).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="phone">Téléphone de l&apos;étudiant *</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                placeholder="+261 34 00 000 00"
                defaultValue={values.phone ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="personalEmail">Email de l&apos;étudiant</label>
              <input
                id="personalEmail"
                name="personalEmail"
                type="email"
                defaultValue={values.personalEmail ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="address">Adresse exacte de l&apos;étudiant *</label>
            <input
              id="address"
              name="address"
              type="text"
              required
              defaultValue={values.address ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        {/* Étape 2 : Renseignements sur le baccalauréat */}
        <div data-step="1" className={step === 1 ? "space-y-4" : "hidden"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="baccNumber">Numéro du bacc *</label>
              <input
                id="baccNumber"
                name="baccNumber"
                type="text"
                required
                defaultValue={values.baccNumber ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="baccSeries">Série *</label>
              <input
                id="baccSeries"
                name="baccSeries"
                type="text"
                required
                placeholder="ex : A2, C, D, OSE..."
                defaultValue={values.baccSeries ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <p className={labelClass}>Mention *</p>
            <RadioPills
              name="baccMention"
              value={values.baccMention}
              options={[
                { value: "Passable", label: "Passable" },
                { value: "Assez bien", label: "Assez bien" },
                { value: "Bien", label: "Bien" },
                { value: "Très bien", label: "Très bien" },
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="baccYear">Année d&apos;obtention *</label>
              <input
                id="baccYear"
                name="baccYear"
                type="number"
                required
                min={1980}
                max={2100}
                placeholder="2025"
                defaultValue={values.baccYear ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="baccCenter">Centre d&apos;examen</label>
              <input
                id="baccCenter"
                name="baccCenter"
                type="text"
                defaultValue={values.baccCenter ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="baccCountry">Pays</label>
              <input
                id="baccCountry"
                name="baccCountry"
                type="text"
                defaultValue={values.baccCountry ?? "Madagascar"}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="previousSchool">Établissement d&apos;origine</label>
            <input
              id="previousSchool"
              name="previousSchool"
              type="text"
              defaultValue={values.previousSchool ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="previousUniversity">
              Inscription antérieure à l&apos;université
            </label>
            <input
              id="previousUniversity"
              name="previousUniversity"
              type="text"
              placeholder="ex : Aucune, ou Université de Mahajanga (2024-2025)"
              defaultValue={values.previousUniversity ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        {/* Étape 3 : Parents + personne à contacter d'urgence */}
        <div data-step="2" className={step === 2 ? "space-y-4" : "hidden"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="fatherName">Nom du père</label>
              <input
                id="fatherName"
                name="fatherName"
                type="text"
                defaultValue={values.fatherName ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="motherName">Nom de la mère</label>
              <input
                id="motherName"
                name="motherName"
                type="text"
                defaultValue={values.motherName ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="parentsPhone">Téléphone des parents</label>
              <input
                id="parentsPhone"
                name="parentsPhone"
                type="tel"
                defaultValue={values.parentsPhone ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="parentsAddress">Adresse des parents</label>
              <input
                id="parentsAddress"
                name="parentsAddress"
                type="text"
                defaultValue={values.parentsAddress ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="parentsCity">Ville</label>
              <input
                id="parentsCity"
                name="parentsCity"
                type="text"
                defaultValue={values.parentsCity ?? ""}
                className={inputClass}
              />
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="mb-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
              Personne à contacter d&apos;urgence — obligatoire pour chaque étudiant
            </p>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="guardianName">Nom complet *</label>
                  <input id="guardianName" name="guardianName" type="text" required className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="guardianPhone">Numéro de téléphone *</label>
                  <input id="guardianPhone" name="guardianPhone" type="tel" required className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="guardianAddress">Adresse exacte</label>
                <input id="guardianAddress" name="guardianAddress" type="text" className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {/* Étape 4 : Inscription — année, niveau et formation */}
        <div data-step="3" className={step === 3 ? "space-y-4" : "hidden"}>
          <div>
            <p className={labelClass}>Année universitaire *</p>
            <RadioPills
              name="academicYear"
              value={values.academicYear ?? defaultYear}
              options={years.map((y) => ({ value: y, label: y }))}
            />
          </div>
          <div>
            <p className={labelClass}>Niveau *</p>
            <RadioPills
              name="level"
              value={values.level ?? "L1"}
              options={LEVELS.map((l) => ({ value: l, label: l }))}
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Inscription directe en L2, L3, M1... possible selon le dossier.
            </p>
          </div>

          <p className={labelClass}>Choix de formation * (cliquer sur une formation)</p>
          {userFormation && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Vous êtes rattaché(e) à la filière <strong>{userFormation}</strong> : les autres
              filières sont désactivées pour éviter une erreur d&apos;inscription.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FORMATIONS.map((f) => {
              const disabled = !!userFormation && f.label !== userFormation;
              return (
                <label
                  key={f.code}
                  className={
                    disabled
                      ? "flex cursor-not-allowed items-center gap-3 rounded-xl border border-black/5 px-4 py-3 opacity-40 dark:border-white/5"
                      : "flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 px-4 py-3 transition has-checked:border-indigo-500 has-checked:bg-indigo-50 dark:border-white/10 dark:has-checked:border-indigo-500 dark:has-checked:bg-indigo-950/40"
                  }
                >
                  <input
                    type="radio"
                    name="formation"
                    value={f.label}
                    required
                    disabled={disabled}
                    defaultChecked={values.formation === f.label}
                    className="h-4 w-4 accent-indigo-600"
                  />
                  <span className="text-sm text-zinc-900 dark:text-zinc-50">{f.label}</span>
                  <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {f.code}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Étape 5 : Vérification des pièces du dossier */}
        <div data-step="4" className={step === 4 ? "space-y-4" : "hidden"}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Cochez chaque pièce que l&apos;étudiant a bien remise avec son dossier :
          </p>
          <div className="space-y-2">
            {DOCUMENTS.map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/10 px-4 py-3 transition has-checked:border-emerald-500 has-checked:bg-emerald-50 dark:border-white/10 dark:has-checked:border-emerald-600 dark:has-checked:bg-emerald-950/40"
              >
                <input type="checkbox" name={key} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                <span className="text-sm text-zinc-900 dark:text-zinc-50">{label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Les pièces manquantes resteront visibles sur le profil de l&apos;étudiant : le dossier
            peut être enregistré même incomplet.
          </p>
        </div>

        {/* Étape 6 : Récapitulatif */}
        <div data-step="5" className={step === 5 ? "space-y-4" : "hidden"}>
          <div className="overflow-hidden rounded-xl border border-black/5 dark:border-white/10">
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(FIELD_LABELS).map(([key, label]) => {
                  const raw = (values[key] ?? "").trim();
                  return (
                    <tr
                      key={key}
                      className="border-b border-black/5 last:border-0 odd:bg-zinc-50 dark:border-white/5 dark:odd:bg-zinc-950/50"
                    >
                      <td className="px-4 py-2 font-medium text-zinc-500 dark:text-zinc-400">
                        {label}
                      </td>
                      <td
                        className={
                          raw
                            ? "px-4 py-2 font-semibold text-zinc-900 dark:text-zinc-50"
                            : "px-4 py-2 text-zinc-400 dark:text-zinc-600"
                        }
                      >
                        {raw ? (VALUE_LABELS[key]?.[raw] ?? raw) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-black/5 p-4 dark:border-white/10">
            <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Pièces du dossier
            </p>
            <ul className="space-y-1">
              {DOCUMENTS.map(([key, label]) => {
                const provided = values[key] === "on";
                return (
                  <li
                    key={key}
                    className={
                      provided
                        ? "text-sm text-emerald-700 dark:text-emerald-400"
                        : "text-sm text-red-600 dark:text-red-400"
                    }
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {provided ? <FaCheck size={10} /> : <FaTimes size={10} />} {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Vérifiez les informations ci-dessus (utilisez « Précédent » pour corriger) : à la
            validation, le système génère automatiquement le numéro matricule.
          </p>
        </div>

        {state.error && (
          <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className={`${secondaryButtonClass} disabled:opacity-40`}
          >
            ← Précédent
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className={primaryButtonClass}>
              Suivant →
            </button>
          ) : (
            <button type="submit" disabled={pending} className={`${primaryButtonClass} flex items-center gap-2`}>
              {pending ? "Enregistrement..." : (<><FaCheck size={13} /> Valider l&apos;inscription</>)}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
