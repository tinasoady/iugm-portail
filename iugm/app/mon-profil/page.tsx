import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/app/ui/app-shell";
import {
  STATUS_LABELS,
  STATUS_BADGE_CLASSES,
  MENTION_LABELS,
  MENTION_BADGE_CLASSES,
} from "@/app/ui/student-status";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

const GENDER_LABELS: Record<string, string> = { M: "Masculin", F: "Féminin" };

const HOME_BY_ROLE: Record<string, string> = {
  SUPERADMIN: "/admin",
  AGENT_ADMINISTRATION: "/agent-admin",
  AGENT_PEDAGOGIQUE: "/agent-pedagogique",
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

export default async function MonProfilPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Les membres du personnel ont leur propre tableau de bord
  if (session.role !== "ETUDIANT") redirect(HOME_BY_ROLE[session.role] ?? "/");

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    include: {
      studentFile: {
        include: { results: { orderBy: [{ academicYear: "desc" }, { semester: "desc" }] } },
      },
    },
  });
  if (!user) redirect("/login");
  // Mot de passe initial prévisible : changement obligatoire avant tout accès
  if (user.mustChangePassword) redirect("/changer-mot-de-passe");

  const student = user.studentFile;

  return (
    <AppShell email={session.email} role={session.role} title="Mon profil" active="/mon-profil">
      {!student ? (
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Aucun dossier étudiant n&apos;est associé à votre compte ({user.email}). Contactez la
            scolarité si c&apos;est une erreur.
          </p>
        </section>
      ) : (
        <>
          {/* En-tête */}
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
              <span className={STATUS_BADGE_CLASSES[student.status]}>
                {STATUS_LABELS[student.status] ?? student.status}
              </span>
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Informations personnelles */}
            <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
              <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Informations personnelles
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
              <InfoRow label="CIN" value={student.cin} />
              <InfoRow label="Adresse" value={student.address} />
              <InfoRow label="Téléphone" value={student.phone} />
              <InfoRow label="Email personnel" value={student.personalEmail} />
              <InfoRow label="Email institutionnel" value={user.email} />
            </section>

            {/* Cursus */}
            <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
              <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Mon cursus
              </h3>
              <InfoRow label="Année universitaire" value={student.academicYear} />
              <InfoRow label="Formation (mention)" value={student.mention ?? student.program} />
              <InfoRow label="Niveau" value={student.level ?? student.track} />
              <InfoRow label="Type de formation" value={student.trainingType} />
              <InfoRow
                label="Bacc"
                value={
                  student.baccSeries
                    ? `Série ${student.baccSeries}${student.baccYear ? ` (${student.baccYear})` : ""}`
                    : null
                }
              />
              <InfoRow
                label="Écolage"
                value={
                  student.status !== "ENREGISTRE"
                    ? `Payé — reçu ${student.receiptNumber ?? ""}`.trim()
                    : "En attente de vérification"
                }
              />
              <InfoRow
                label="Étape du dossier"
                value={STATUS_LABELS[student.status] ?? student.status}
              />
            </section>
          </div>

          {/* Notes semestrielles */}
          <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
            <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Mes notes semestrielles
            </h3>
            {student.results.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Aucun résultat publié pour le moment.
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
          {student.conduct && (
            <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
              <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Appréciation de conduite
              </h3>
              <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                {student.conduct}
              </p>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
