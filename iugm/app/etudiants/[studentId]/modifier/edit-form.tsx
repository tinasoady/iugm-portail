"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateStudentAction, type EditStudentState } from "./actions";

const LEVELS = ["L1", "L2", "L3", "M1", "M2"];

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

type Defaults = {
  lastName: string;
  firstName: string;
  nationality: string;
  gender: string;
  birthDate: string;
  birthPlace: string;
  cin: string;
  cinIssueDate: string;
  cinIssuePlace: string;
  phone: string;
  personalEmail: string;
  address: string;
  maritalStatus: string;
  baccNumber: string;
  baccSeries: string;
  baccMention: string;
  baccYear: string;
  baccCenter: string;
  baccCountry: string;
  previousSchool: string;
  previousUniversity: string;
  repeatCode: string;
  fatherName: string;
  motherName: string;
  parentsPhone: string;
  parentsAddress: string;
  parentsCity: string;
  guardianName: string;
  guardianPhone: string;
  guardianAddress: string;
  domain: string;
  formation: string;
  track: string;
  trainingType: string;
  level: string;
  docResidenceCert: boolean;
  docCinCopy: boolean;
  docParentCin: boolean;
  docPhotos: boolean;
  docPinkFolder: boolean;
  docPaymentSlip: boolean;
  docEngagementLetter: boolean;
};

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";
const sectionClass =
  "rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900";
const sectionTitleClass = "mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50";

const initialState: EditStudentState = {};

export function EditStudentForm({
  studentId,
  matricule,
  formations,
  lockedFormation,
  defaults: d,
}: {
  studentId: string;
  matricule: string;
  formations: string[];
  lockedFormation?: string | null;
  defaults: Defaults;
}) {
  const boundAction = updateStudentAction.bind(null, studentId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400">{matricule}</p>
        <Link
          href={`/etudiants/${studentId}`}
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Annuler
        </Link>
      </div>

      {/* Identité */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Renseignements sur l&apos;étudiant</h2>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="lastName">Nom *</label>
              <input id="lastName" name="lastName" type="text" required defaultValue={d.lastName} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="firstName">Prénom *</label>
              <input id="firstName" name="firstName" type="text" required defaultValue={d.firstName} className={inputClass} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="nationality">Nationalité *</label>
              <select id="nationality" name="nationality" required defaultValue={d.nationality} className={inputClass}>
                <option value="Malagasy">Malagasy</option>
                <option value="Étranger">Étranger</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="gender">Sexe *</label>
              <select id="gender" name="gender" required defaultValue={d.gender} className={inputClass}>
                <option value="" disabled>Choisir...</option>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="maritalStatus">Situation familiale *</label>
              <select id="maritalStatus" name="maritalStatus" required defaultValue={d.maritalStatus} className={inputClass}>
                <option value="Célibataire">Célibataire</option>
                <option value="Marié(e)">Marié(e)</option>
                <option value="Salarié(e)">Salarié(e)</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="birthDate">Date de naissance *</label>
              <input id="birthDate" name="birthDate" type="date" required defaultValue={d.birthDate} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="birthPlace">Lieu de naissance *</label>
              <input id="birthPlace" name="birthPlace" type="text" required defaultValue={d.birthPlace} className={inputClass} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="cin">N° CIN</label>
              <input id="cin" name="cin" type="text" defaultValue={d.cin} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="cinIssueDate">Date de délivrance</label>
              <input id="cinIssueDate" name="cinIssueDate" type="date" defaultValue={d.cinIssueDate} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="cinIssuePlace">Lieu de délivrance</label>
              <input id="cinIssuePlace" name="cinIssuePlace" type="text" defaultValue={d.cinIssuePlace} className={inputClass} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="phone">Téléphone de l&apos;étudiant *</label>
              <input id="phone" name="phone" type="tel" required defaultValue={d.phone} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="personalEmail">Email de l&apos;étudiant</label>
              <input id="personalEmail" name="personalEmail" type="email" defaultValue={d.personalEmail} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="address">Adresse exacte de l&apos;étudiant *</label>
            <input id="address" name="address" type="text" required defaultValue={d.address} className={inputClass} />
          </div>
        </div>
      </section>

      {/* Baccalauréat */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Renseignements sur le baccalauréat</h2>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="baccNumber">Numéro du bacc *</label>
              <input id="baccNumber" name="baccNumber" type="text" required defaultValue={d.baccNumber} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="baccSeries">Série *</label>
              <input id="baccSeries" name="baccSeries" type="text" required defaultValue={d.baccSeries} className={inputClass} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="baccMention">Mention *</label>
              <select id="baccMention" name="baccMention" required defaultValue={d.baccMention} className={inputClass}>
                <option value="" disabled>Choisir...</option>
                <option value="Passable">Passable</option>
                <option value="Assez bien">Assez bien</option>
                <option value="Bien">Bien</option>
                <option value="Très bien">Très bien</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="baccYear">Année d&apos;obtention *</label>
              <input id="baccYear" name="baccYear" type="number" required min={1980} max={2100} defaultValue={d.baccYear} className={inputClass} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="baccCenter">Centre d&apos;examen</label>
              <input id="baccCenter" name="baccCenter" type="text" defaultValue={d.baccCenter} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="baccCountry">Pays</label>
              <input id="baccCountry" name="baccCountry" type="text" defaultValue={d.baccCountry} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="previousSchool">Établissement d&apos;origine</label>
            <input id="previousSchool" name="previousSchool" type="text" defaultValue={d.previousSchool} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="previousUniversity">Inscription antérieure à l&apos;université</label>
            <input id="previousUniversity" name="previousUniversity" type="text" defaultValue={d.previousUniversity} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="repeatCode">Code de redoublement</label>
            <select id="repeatCode" name="repeatCode" defaultValue={d.repeatCode} className={inputClass}>
              <option value="N">N — Nouveau</option>
              <option value="R">R — Redoublant</option>
              <option value="T">T — Triplant</option>
            </select>
          </div>
        </div>
      </section>

      {/* Parents + urgence */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Parents et personne à contacter d&apos;urgence</h2>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="fatherName">Nom du père</label>
              <input id="fatherName" name="fatherName" type="text" defaultValue={d.fatherName} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="motherName">Nom de la mère</label>
              <input id="motherName" name="motherName" type="text" defaultValue={d.motherName} className={inputClass} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="parentsPhone">Téléphone des parents</label>
              <input id="parentsPhone" name="parentsPhone" type="tel" defaultValue={d.parentsPhone} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="parentsAddress">Adresse des parents</label>
              <input id="parentsAddress" name="parentsAddress" type="text" defaultValue={d.parentsAddress} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="parentsCity">Ville</label>
              <input id="parentsCity" name="parentsCity" type="text" defaultValue={d.parentsCity} className={inputClass} />
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
            <p className="mb-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
              Personne à contacter d&apos;urgence — obligatoire
            </p>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="guardianName">Nom complet *</label>
                  <input id="guardianName" name="guardianName" type="text" required defaultValue={d.guardianName} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="guardianPhone">Numéro de téléphone *</label>
                  <input id="guardianPhone" name="guardianPhone" type="tel" required defaultValue={d.guardianPhone} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="guardianAddress">Adresse exacte</label>
                <input id="guardianAddress" name="guardianAddress" type="text" defaultValue={d.guardianAddress} className={inputClass} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cursus */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Cursus</h2>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Formation *</label>
            {lockedFormation ? (
              <p className="mt-1 rounded-xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                🔒 {lockedFormation} (votre formation)
              </p>
            ) : (
              <select id="formation" name="formation" required defaultValue={d.formation} className={inputClass}>
                {formations.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}
            {lockedFormation && <input type="hidden" name="formation" value={lockedFormation} />}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="level">Niveau *</label>
              <select id="level" name="level" required defaultValue={d.level} className={inputClass}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="trainingType">Type de formation</label>
              <select id="trainingType" name="trainingType" defaultValue={d.trainingType} className={inputClass}>
                <option value="Formation initiale">Formation initiale</option>
                <option value="Formation continue">Formation continue</option>
                <option value="Formation à distance">Formation à distance</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="domain">Domaine</label>
              <input id="domain" name="domain" type="text" defaultValue={d.domain} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="track">Parcours</label>
              <input id="track" name="track" type="text" defaultValue={d.track} className={inputClass} />
            </div>
          </div>
        </div>
      </section>

      {/* Pièces du dossier */}
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>Pièces du dossier</h2>
        <div className="space-y-2">
          {DOCUMENTS.map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/10 px-4 py-3 transition has-checked:border-emerald-500 has-checked:bg-emerald-50 dark:border-white/10 dark:has-checked:border-emerald-600 dark:has-checked:bg-emerald-950/40"
            >
              <input
                type="checkbox"
                name={key}
                defaultChecked={d[key as keyof Defaults] as boolean}
                className="mt-0.5 h-4 w-4 accent-emerald-600"
              />
              <span className="text-sm text-zinc-900 dark:text-zinc-50">{label}</span>
            </label>
          ))}
        </div>
      </section>

      {state.error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <Link
          href={`/etudiants/${studentId}`}
          className="rounded-xl border border-black/10 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Annuler
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50"
        >
          {pending ? "Enregistrement..." : "✓ Enregistrer les modifications"}
        </button>
      </div>
    </form>
  );
}
