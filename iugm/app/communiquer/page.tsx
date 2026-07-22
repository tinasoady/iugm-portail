import { redirect } from "next/navigation";
import { FaEye } from "react-icons/fa";

import { getSession } from "@/lib/auth";
import { hasTaskPermission, getUserFormation } from "@/lib/permissions";
import { listAnnouncementsForAgent } from "@/lib/announcements";
import { FORMATIONS } from "@/lib/formations";
import { AppShell } from "@/app/ui/app-shell";
import { ComposeForm, DeleteAnnouncementButton } from "./announcement-forms";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

export default async function CommuniquerPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) {
    redirect("/");
  }
  if (!(await hasTaskPermission(session.sub, session.role, "communiquer"))) {
    redirect("/");
  }

  const [announcements, userFormation] = await Promise.all([
    listAnnouncementsForAgent(),
    getUserFormation(session.sub, session.role),
  ]);

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Communiquer avec les étudiants"
      active="/communiquer"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Rédaction */}
        <section className="h-fit rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Nouveau communiqué
          </h2>
          <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
            Tous les étudiants du groupe ciblé (filière et/ou niveau) recevront le même message
            dans leurs notifications.
          </p>
          <ComposeForm
            formations={FORMATIONS.map((f) => f.label)}
            lockedFormation={userFormation}
          />
        </section>

        {/* Historique */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Communiqués envoyés ({announcements.length})
          </h2>
          {announcements.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Aucun communiqué pour le moment.
            </p>
          ) : (
            <div className="space-y-4">
              {announcements.map((a) => (
                <article
                  key={a.id}
                  className="rounded-xl border border-black/5 p-4 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{a.title}</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {dateFormatter.format(a.createdAt)} —{" "}
                        {a.author
                          ? `${a.author.fullName ?? a.author.email}${a.author.jobTitle ? ` (${a.author.jobTitle})` : ""}`
                          : "auteur supprimé"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        {a.formation ?? "Toutes filières"} · {a.level ?? "Tous niveaux"}
                      </span>
                      <span
                        className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        title="Nombre d'étudiants ayant lu ce communiqué"
                      >
                        <FaEye className="inline" /> {a._count.reads} lecture(s)
                      </span>
                      <DeleteAnnouncementButton id={a.id} title={a.title} />
                    </div>
                  </div>
                  <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                    {a.body}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
