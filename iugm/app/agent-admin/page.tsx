import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { searchStudents } from "@/lib/students";
import { getUserFormation } from "@/lib/permissions";
import { AppShell } from "@/app/ui/app-shell";
import { StatCard } from "@/app/ui/stat-card";
import { IconFolder, IconClipboard, IconShield, IconCap } from "@/app/ui/icons";
import { STATUS_LABELS, STATUS_BADGE_CLASSES } from "@/app/ui/student-status";
import { DossierActions } from "./dossier-actions";
import { ImportCsvForm } from "./import-form";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

export default async function AgentAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "SUPERADMIN"].includes(session.role)) redirect("/");

  const { q } = await searchParams;
  // Secrétaire de formation : dossiers limités à sa formation
  const userFormation = await getUserFormation(session.sub, session.role);
  const [students, statusCounts] = await Promise.all([
    searchStudents(q, userFormation),
    prisma.student.groupBy({
      by: ["status"],
      _count: { _all: true },
      ...(userFormation
        ? { where: { OR: [{ mention: userFormation }, { program: userFormation }] } }
        : {}),
    }),
  ]);
  const countOf = (status: string) =>
    statusCounts.find((s) => s.status === status)?._count._all ?? 0;

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Dossiers étudiants — Agent d'administration"
      active="/agent-admin"
    >
        {/* Cartes statistiques du workflow */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Enregistrés"
            value={countOf("ENREGISTRE")}
            sublabel="en attente de paiement"
            gradient="from-violet-500 to-purple-600"
            icon={<IconFolder />}
          />
          <StatCard
            label="Paiement vérifié"
            value={countOf("PAIEMENT_VERIFIE")}
            sublabel="reçus bancaires contrôlés"
            gradient="from-sky-500 to-blue-600"
            icon={<IconClipboard />}
          />
          <StatCard
            label="Inscr. administrative"
            value={countOf("ADMIN_VALIDEE")}
            sublabel="en attente pédagogique"
            gradient="from-amber-400 to-orange-500"
            icon={<IconShield />}
          />
          <StatCard
            label="Inscrits"
            value={countOf("INSCRIT")}
            sublabel="inscription finalisée"
            gradient="from-emerald-500 to-teal-600"
            icon={<IconCap />}
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr]">
          {/* Colonne gauche : enregistrement + CSV */}
          <div className="space-y-8">
            <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
              <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Nouvelle inscription
              </h2>
              <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
                Formulaire complet étape par étape : identité, CIN, études antérieures, contact et
                cursus. Le matricule (FI{new Date().getFullYear()}-n) est généré automatiquement.
              </p>
              <a
                href="/agent-admin/inscription"
                className="inline-block rounded-xl bg-linear-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-violet-500"
              >
                + Inscrire un étudiant
              </a>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
              <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Sauvegarde CSV
              </h2>
              <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
                Solution de secours en cas de panne réseau : exportez les dossiers, travaillez
                hors-ligne, puis réimportez le fichier (identifié par le matricule).
              </p>
              <a
                href="/api/students/export"
                className="mb-4 inline-block rounded-lg border border-black/10 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                ⬇ Exporter les dossiers (CSV)
              </a>
              <ImportCsvForm />
            </section>
          </div>

          {/* Colonne droite : dossiers étudiants */}
          <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Dossiers étudiants ({students.length})
              </h2>
              <form method="get" className="flex items-center gap-2">
                <input
                  name="q"
                  type="search"
                  defaultValue={q ?? ""}
                  placeholder="Nom, matricule, reçu, filière..."
                  className="w-56 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                />
                <button
                  type="submit"
                  className="rounded-xl border border-black/10 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Rechercher
                </button>
              </form>
            </div>

            {students.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {q ? `Aucun dossier ne correspond à « ${q} ».` : "Aucun dossier pour le moment."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                      <th className="py-2 pr-4 font-medium">Matricule</th>
                      <th className="py-2 pr-4 font-medium">Nom</th>
                      <th className="py-2 pr-4 font-medium">Filière / Niveau</th>
                      <th className="py-2 pr-4 font-medium">Créé le</th>
                      <th className="py-2 pr-4 font-medium">Statut</th>
                      <th className="py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                        <td className="py-2.5 pr-4 whitespace-nowrap font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {s.matricule}
                          {s.academicYear && (
                            <span className="block text-[10px] text-zinc-400 dark:text-zinc-500">
                              {s.academicYear}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-900 dark:text-zinc-50">{s.fullName}</td>
                        <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                          {[s.program, s.level ?? s.track].filter(Boolean).join(" — ") || "—"}
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                          {dateFormatter.format(s.createdAt)}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={STATUS_BADGE_CLASSES[s.status]}>
                            {STATUS_LABELS[s.status] ?? s.status}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <DossierActions
                            studentId={s.id}
                            status={s.status}
                            accountEmail={s.account?.email}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
    </AppShell>
  );
}
