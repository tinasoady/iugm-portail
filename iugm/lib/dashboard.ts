import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Évolution mensuelle des étapes clés du parcours étudiant, pour le graphique
// du tableau de bord superadmin. Lit directement les horodatages du dossier
// (Student.createdAt / receiptVerifiedAt / pedagoValidatedAt) plutôt que le
// journal d'audit : le journal n'est pas lié au dossier (pas de studentId) et
// survit à sa suppression, ce qui faisait "fantômer" des dossiers supprimés
// dans le graphique alors qu'ils n'existent plus nulle part ailleurs.
// ---------------------------------------------------------------------------

export type InscriptionTrend = {
  months: string[]; // clés "AAAA-MM", ordre chronologique
  monthLabels: string[]; // libellés courts affichables, ex "juil. 26"
  registrations: number[]; // STUDENT_REGISTERED : nouveaux dossiers enregistrés
  payments: number[]; // RECEIPT_VERIFIED : reçus bancaires vérifiés
  inscriptions: number[]; // PEDAGO_INSCRIPTION_VALIDATED : inscriptions finalisées
};

const monthLabelFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });

// Évolution sur les `monthsBack` derniers mois (mois courant inclus), avec
// des zéros explicites pour les mois sans activité — le graphique garde
// toujours la même largeur, qu'il y ait beaucoup de données ou presque pas.
export async function getInscriptionTrend(monthsBack = 6): Promise<InscriptionTrend> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const students = await prisma.student.findMany({
    where: {
      OR: [
        { createdAt: { gte: start } },
        { receiptVerifiedAt: { gte: start } },
        { pedagoValidatedAt: { gte: start } },
      ],
    },
    select: { createdAt: true, receiptVerifiedAt: true, pedagoValidatedAt: true },
  });

  const months: string[] = [];
  const monthLabels: string[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    monthLabels.push(monthLabelFormatter.format(d));
  }

  const counts = new Map<string, { registrations: number; payments: number; inscriptions: number }>();
  for (const key of months) {
    counts.set(key, { registrations: 0, payments: 0, inscriptions: 0 });
  }

  const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const bump = (d: Date | null, field: "registrations" | "payments" | "inscriptions") => {
    if (!d) return;
    const bucket = counts.get(keyOf(d));
    if (bucket) bucket[field]++;
  };

  for (const s of students) {
    bump(s.createdAt, "registrations");
    bump(s.receiptVerifiedAt, "payments");
    bump(s.pedagoValidatedAt, "inscriptions");
  }

  return {
    months,
    monthLabels,
    registrations: months.map((k) => counts.get(k)!.registrations),
    payments: months.map((k) => counts.get(k)!.payments),
    inscriptions: months.map((k) => counts.get(k)!.inscriptions),
  };
}
