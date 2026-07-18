import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PrintButton } from "./print-button";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

// Reçu d'inscription imprimable, généré une fois l'étudiant inscrit
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)) redirect("/");

  const { studentId } = await params;
  const [student, settings] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: { account: { select: { email: true } } },
    }),
    getSettings(),
  ]);
  if (!student) notFound();
  if (student.status !== "INSCRIT") {
    redirect("/agent-pedagogique");
  }

  const rows: Array<[string, string]> = [
    ["Matricule", student.matricule],
    ["Année universitaire", student.academicYear ?? "—"],
    ["Nom complet", student.fullName],
    ["Domaine", student.domain ?? student.department ?? "—"],
    ["Mention", student.mention ?? student.program ?? "—"],
    ["Niveau", student.level ?? student.track ?? "—"],
    ["Type de formation", student.trainingType ?? "—"],
    ["N° du reçu bancaire", student.receiptNumber ?? "—"],
    ["Date d'inscription", dateFormatter.format(student.updatedAt)],
  ];

  const credentials: Array<[string, string]> = [
    ["Adresse email", student.account?.email ?? "—"],
    ["Mot de passe initial", student.initialPassword ?? "—"],
  ];

  return (
    <div className="min-h-screen bg-zinc-50 p-8 print:bg-white print:p-0 dark:bg-black">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <a
            href="/agent-pedagogique"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ← Retour au tableau de bord
          </a>
          <PrintButton matricule={student.matricule} fullName={student.fullName} />
        </div>

        {/* Le reçu lui-même : fond blanc forcé pour l'impression */}
        <div className="rounded-2xl border border-black/10 bg-white p-10 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <header className="mb-8 border-b border-black/10 pb-6 text-center">
            {settings.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image inutile ici
              <img
                src={settings.logo}
                alt={`Logo ${settings.institutionAcronym}`}
                className="mx-auto mb-3 h-16 w-16 object-contain"
              />
            )}
            <h1 className="text-2xl font-bold tracking-wide text-zinc-900">
              {settings.institutionAcronym} — {(settings.city ?? "").toUpperCase()}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">{settings.institutionName}</p>
            {settings.address && <p className="text-xs text-zinc-500">{settings.address}</p>}
            {(settings.phone || settings.email) && (
              <p className="text-xs text-zinc-500">
                {[settings.phone, settings.email].filter(Boolean).join(" — ")}
              </p>
            )}
            <p className="mt-4 text-lg font-semibold text-zinc-900 uppercase">
              Reçu d&apos;inscription définitive
            </p>
          </header>

          <table className="w-full text-sm">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label} className="border-b border-black/5 last:border-0">
                  <td className="py-2.5 pr-6 font-medium text-zinc-500">{label}</td>
                  <td className="py-2.5 font-semibold text-zinc-900">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Identifiants du compte étudiant, remis avec le reçu */}
          <div className="mt-8 rounded-xl border border-zinc-300 p-4 print:rounded-none">
            <p className="mb-2 text-sm font-semibold text-zinc-900 uppercase">
              Compte étudiant — portail en ligne
            </p>
            <table className="w-full text-sm">
              <tbody>
                {credentials.map(([label, value]) => (
                  <tr key={label}>
                    <td className="py-1 pr-6 font-medium text-zinc-500">{label}</td>
                    <td className="py-1 font-mono font-semibold text-zinc-900">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-zinc-500">
              Identifiants strictement personnels. Changez ce mot de passe dès votre première
              connexion.
            </p>
          </div>

          <p className="mt-8 text-sm text-zinc-700">
            Le présent reçu atteste que l&apos;étudiant(e) ci-dessus a accompli l&apos;intégralité
            des formalités d&apos;inscription administrative et pédagogique au titre de
            l&apos;année universitaire en cours.
          </p>

          <footer className="mt-10 flex items-end justify-between text-sm text-zinc-600">
            <div>
              <p>
                Fait à {settings.city ?? "—"}, le {dateFormatter.format(new Date())}
              </p>
            </div>
            <div className="text-center">
              <p className="mb-14">L&apos;agent pédagogique</p>
              <p className="border-t border-zinc-400 px-8 pt-1">Signature et cachet</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
