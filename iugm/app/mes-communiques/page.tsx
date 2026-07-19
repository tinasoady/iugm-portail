import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  listAnnouncementsForStudent,
  markAnnouncementsRead,
} from "@/lib/announcements";
import { AppShell } from "@/app/ui/app-shell";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
});

export default async function MesCommuniquesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ETUDIANT") redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { mustChangePassword: true },
  });
  if (user?.mustChangePassword) redirect("/changer-mot-de-passe");

  // Liste AVANT marquage : conserve les badges « Nouveau » pour cet affichage
  const announcements = await listAnnouncementsForStudent(session.sub);
  await markAnnouncementsRead(session.sub);

  return (
    <AppShell
      email={session.email}
      role={session.role}
      title="Communiqués de l'université"
      active="/mes-communiques"
    >
      {announcements.length === 0 ? (
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Aucun communiqué pour le moment.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => {
            const isNew = a.reads.length === 0;
            return (
              <article
                key={a.id}
                className={`rounded-2xl border bg-white p-6 shadow-sm dark:bg-zinc-900 ${
                  isNew
                    ? "border-indigo-300 dark:border-indigo-700"
                    : "border-black/5 dark:border-white/10"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      {a.title}
                      {isNew && (
                        <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          Nouveau
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {dateFormatter.format(a.createdAt)}
                      {a.author
                        ? ` — ${a.author.fullName ?? "Administration"}${a.author.jobTitle ? ` (${a.author.jobTitle})` : ""}`
                        : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {a.formation ?? "Toutes filières"} · {a.level ?? "Tous niveaux"}
                  </span>
                </div>
                <p className="mt-3 text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                  {a.body}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
