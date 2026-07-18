import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getStudentProfile } from "@/lib/students";
import { hasTaskPermission } from "@/lib/permissions";
import { AppShell } from "@/app/ui/app-shell";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASSES,
  MENTION_LABELS,
  MENTION_BADGE_CLASSES,
} from "@/app/ui/student-status";
import { ConductForm } from "./conduct-form";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

const GENDER_LABELS: Record<string, string> = { M: "Masculin", F: "Féminin" };
const REPEAT_LABELS: Record<string, string> = {
  N: "N — Nouveau",
  R: "R — Redoublant",
  T: "T — Triplant",
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b border-black/5 py-2 text-sm last:border-0 dark:border-white/5">
      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{label}</span>
      <span
        className={
          value
            ? "text-right font-medium text-zinc-900 dark:text-zinc-50"
            : "text-right text-zinc-400 dark:text-zinc-600"
        }
      >
        {value || "—"}
      </span>
    </div>
  );
}

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) {
    redirect("/");
  }

  const { studentId } = await params;
  const student = await getStudentProfile(studentId);
  if (!student) notFound();

  const canEditConduct = await hasTaskPermission(session.sub, session.role, "conduite");
  const canPrintReceipt = ["AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role);
  // Écolage considéré payé dès que le reçu bancaire a été vérifié
  const feePaid = student.status !== "ENREGISTRE";

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title={`Profil étudiant — ${student.fullName}`}
      active="/etudiants"
    >
      {/* En-tête du profil */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white">
              {student.fullName
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                {student.fullName}
              </h2>
              <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
                {student.matricule}
                {student.academicYear ? ` — ${student.academicYear}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={STATUS_BADGE_CLASSES[student.status]}>
              {STATUS_LABELS[student.status] ?? student.status}
            </span>
            {student.status === "INSCRIT" && canPrintReceipt && (
              <a
                href={`/agent-pedagogique/recu/${student.id}`}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                🖨 Reçu d&apos;inscription
              </a>
            )}
            <Link
              href="/etudiants"
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              ← Retour à la liste
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* État civil */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            État civil
          </h3>
          <InfoRow label="Sexe" value={student.gender ? GENDER_LABELS[student.gender] : null} />
          <InfoRow
            label="Naissance"
            value={
              student.birthDate
                ? `${dateFormatter.format(student.birthDate)}${student.birthPlace ? ` à ${student.birthPlace}` : ""}`
                : student.birthPlace
            }
          />
          <InfoRow label="Nationalité" value={student.nationality} />
          <InfoRow label="Situation familiale" value={student.maritalStatus} />
          <InfoRow label="Nom du père" value={student.fatherName} />
          <InfoRow label="Nom de la mère" value={student.motherName} />
          <InfoRow label="Téléphone des parents" value={student.parentsPhone} />
          <InfoRow
            label="Adresse des parents"
            value={
              [student.parentsAddress, student.parentsCity].filter(Boolean).join(", ") || null
            }
          />
          <InfoRow label="CIN" value={student.cin} />
          <InfoRow
            label="CIN délivrée"
            value={
              student.cinIssueDate
                ? `le ${shortDateFormatter.format(student.cinIssueDate)}${student.cinIssuePlace ? ` à ${student.cinIssuePlace}` : ""}`
                : student.cinIssuePlace
            }
          />
        </section>

        {/* Contact */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">Contact</h3>
          <InfoRow label="Adresse" value={student.address} />
          <InfoRow label="Téléphone" value={student.phone} />
          <InfoRow label="Email personnel" value={student.personalEmail} />
          <InfoRow label="Email institutionnel" value={student.account?.email} />
          {canPrintReceipt && (
            <InfoRow label="Mot de passe initial" value={student.initialPassword} />
          )}
          <InfoRow label="Contact d'urgence" value={student.guardianName} />
          <InfoRow label="Téléphone (urgence)" value={student.guardianPhone} />
          <InfoRow label="Adresse (urgence)" value={student.guardianAddress} />
        </section>

        {/* Cursus */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">Cursus</h3>
          <InfoRow label="Année universitaire" value={student.academicYear} />
          <InfoRow label="Domaine" value={student.domain ?? student.department} />
          <InfoRow label="Mention (filière)" value={student.mention ?? student.program} />
          <InfoRow label="Niveau" value={student.level ?? student.track} />
          <InfoRow label="Type de formation" value={student.trainingType} />
          <InfoRow
            label="Code de redoublement"
            value={student.repeatCode ? REPEAT_LABELS[student.repeatCode] : null}
          />
        </section>

        {/* Baccalauréat */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Baccalauréat
          </h3>
          <InfoRow label="Numéro" value={student.baccNumber} />
          <InfoRow label="Série" value={student.baccSeries} />
          <InfoRow label="Mention" value={student.baccMention} />
          <InfoRow label="Année d'obtention" value={student.baccYear} />
          <InfoRow label="Centre d'examen" value={student.baccCenter} />
          <InfoRow label="Pays" value={student.baccCountry} />
          <InfoRow label="Établissement d'origine" value={student.previousSchool} />
          <InfoRow label="Inscription antérieure" value={student.previousUniversity} />
        </section>

        {/* Écolage / paiement */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Écolage / paiement
          </h3>
          <div className="mb-3">
            {feePaid ? (
              <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                ✓ Écolage payé (reçu bancaire vérifié)
              </span>
            ) : (
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                Paiement en attente de vérification
              </span>
            )}
          </div>
          <InfoRow label="N° du reçu bancaire" value={student.receiptNumber} />
          <InfoRow
            label="Étape du dossier"
            value={STATUS_LABELS[student.status] ?? student.status}
          />
          <InfoRow
            label="Dossier créé le"
            value={shortDateFormatter.format(student.createdAt)}
          />
        </section>

        {/* Pièces du dossier */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm lg:col-span-2 dark:border-white/10 dark:bg-zinc-900">
          <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Pièces du dossier
          </h3>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {(
              [
                [student.docResidenceCert, "Certificat de résidence de l'étudiant"],
                [student.docCinCopy, "Copie légalisée de la CIN (ou acte d'état civil pour le mineur)"],
                [student.docParentCin, "CIN légalisée du parent"],
                [student.docPhotos, "4 photos d'identité récentes"],
                [student.docPinkFolder, "Papier chemise ROSE"],
                [
                  student.docPaymentSlip,
                  "Bordereau de versement (droit d'inscription, assurance, t-shirt/polo, premier versement)",
                ],
                [student.docEngagementLetter, "Lettre d'engagement manuscrite co-signée par les parents"],
              ] as Array<[boolean, string]>
            ).map(([provided, label]) => (
              <li
                key={label}
                className={
                  provided
                    ? "text-sm text-emerald-700 dark:text-emerald-400"
                    : "text-sm text-red-600 dark:text-red-400"
                }
              >
                {provided ? "✓" : "✗"} {label}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Historique des inscriptions */}
      {student.enrollmentHistory.length > 0 && (
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Historique des inscriptions
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                  <th className="py-2 pr-4 font-semibold">Année universitaire</th>
                  <th className="py-2 pr-4 font-semibold">Niveau</th>
                  <th className="py-2 pr-4 font-semibold">Reçu bancaire</th>
                  <th className="py-2 font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2.5 pr-4 font-medium text-zinc-900 dark:text-zinc-50">
                    {student.academicYear ?? "—"}{" "}
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      en cours
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                    {student.level ?? student.track ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {student.receiptNumber ?? "—"}
                  </td>
                  <td className="py-2.5">
                    <span className={STATUS_BADGE_CLASSES[student.status]}>
                      {STATUS_LABELS[student.status] ?? student.status}
                    </span>
                  </td>
                </tr>
                {student.enrollmentHistory.map((h) => (
                  <tr key={h.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-2.5 pr-4 text-zinc-900 dark:text-zinc-50">{h.academicYear}</td>
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">{h.track ?? "—"}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {h.receiptNumber ?? "—"}
                    </td>
                    <td className="py-2.5">
                      <span className={STATUS_BADGE_CLASSES[h.status] ?? ""}>
                        {STATUS_LABELS[h.status] ?? h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Résultats semestriels */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Notes semestrielles
        </h3>
        {student.results.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Aucun résultat enregistré pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                  <th className="py-2 pr-4 font-semibold">Année universitaire</th>
                  <th className="py-2 pr-4 font-semibold">Semestre</th>
                  <th className="py-2 pr-4 font-semibold">Moyenne</th>
                  <th className="py-2 font-semibold">Mention</th>
                </tr>
              </thead>
              <tbody>
                {student.results.map((r) => (
                  <tr key={r.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-2.5 pr-4 text-zinc-900 dark:text-zinc-50">{r.academicYear}</td>
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">{r.semester}</td>
                    <td className="py-2.5 pr-4 font-semibold text-zinc-900 dark:text-zinc-50">
                      {r.average}/20
                    </td>
                    <td className="py-2.5">
                      <span className={MENTION_BADGE_CLASSES[r.mention]}>
                        {MENTION_LABELS[r.mention] ?? r.mention}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Conduite */}
      <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">Conduite</h3>
        {canEditConduct ? (
          <ConductForm studentId={student.id} conduct={student.conduct} />
        ) : student.conduct ? (
          <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {student.conduct}
          </p>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Aucune appréciation de conduite pour le moment.
          </p>
        )}
      </section>
    </AppShell>
  );
}
