import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
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
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { account: { select: { email: true } } },
  });
  if (!student) notFound();
  if (student.status !== "INSCRIT") {
    redirect("/agent-pedagogique");
  }

  const rows: Array<[string, string]> = [
    ["Matricule", student.matricule],
    ["Nom complet", student.fullName],
    ["Filière", student.program],
    ["Niveau", student.level],
    ["Département", student.department ?? "—"],
    ["N° du reçu bancaire", student.receiptNumber ?? "—"],
    ["Email institutionnel", student.account?.email ?? "—"],
    ["Date d'inscription", dateFormatter.format(student.updatedAt)],
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
            <h1 className="text-2xl font-bold tracking-wide text-zinc-900">IUGM — MAHAJANGA</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Institut Universitaire de Gestion et de Management
            </p>
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

          <p className="mt-8 text-sm text-zinc-700">
            Le présent reçu atteste que l&apos;étudiant(e) ci-dessus a accompli l&apos;intégralité
            des formalités d&apos;inscription administrative et pédagogique au titre de
            l&apos;année universitaire en cours.
          </p>

          <footer className="mt-10 flex items-end justify-between text-sm text-zinc-600">
            <div>
              <p>Fait à Mahajanga, le {dateFormatter.format(new Date())}</p>
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
