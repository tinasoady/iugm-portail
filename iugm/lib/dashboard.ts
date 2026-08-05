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

// Fenêtre de mois à afficher : soit les `monthsBack` derniers mois (mode
// "toutes les années", piloté par MonthRangeSelector), soit les 12 mois de
// l'année universitaire sélectionnée (1er septembre -> 31 août), quand le
// sélecteur global d'année (en-tête) impose une année précise.
function monthWindow(opts: { monthsBack: number; academicYear: string | null }) {
  if (opts.academicYear) {
    const startYear = Number(opts.academicYear.split("-")[0]);
    return { start: new Date(startYear, 8, 1), span: 12 };
  }
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth() - (opts.monthsBack - 1), 1),
    span: opts.monthsBack,
  };
}

// Évolution mois par mois (voir monthWindow ci-dessus pour la fenêtre), avec
// des zéros explicites pour les mois sans activité — le graphique garde
// toujours la même largeur, qu'il y ait beaucoup de données ou presque pas.
//
// Les compteurs "payments"/"inscriptions" combinent les horodatages actuels
// de Student ET ceux archivés dans EnrollmentHistory : une réinscription
// remet receiptVerifiedAt/pedagoValidatedAt à zéro sur le dossier (pour
// repartir sur l'année suivante), mais copie d'abord leur valeur dans
// l'historique — sans cette union, les événements d'une année déjà
// réinscrite disparaîtraient du graphique alors qu'ils ont bien eu lieu.
export async function getInscriptionTrend(
  opts: { monthsBack?: number; academicYear?: string | null; level?: string | null } = {},
): Promise<InscriptionTrend> {
  const { monthsBack = 6, academicYear = null, level = null } = opts;
  const { start, span } = monthWindow({ monthsBack, academicYear });
  const end = new Date(start.getFullYear(), start.getMonth() + span, 1); // borne haute exclusive

  const [students, archived] = await Promise.all([
    prisma.student.findMany({
      where: {
        AND: [
          {
            OR: [
              { createdAt: { gte: start, lt: end } },
              { receiptVerifiedAt: { gte: start, lt: end } },
              { pedagoValidatedAt: { gte: start, lt: end } },
            ],
          },
          ...(level ? [{ level }] : []),
        ],
      },
      select: { createdAt: true, receiptVerifiedAt: true, pedagoValidatedAt: true },
    }),
    prisma.enrollmentHistory.findMany({
      where: {
        AND: [
          {
            OR: [
              { receiptVerifiedAt: { gte: start, lt: end } },
              { pedagoValidatedAt: { gte: start, lt: end } },
            ],
          },
          // `track` porte le niveau au moment de l'archivage (voir
          // reenrollStudent dans lib/students.ts, qui n'a pas de colonne
          // "level" dédiée sur l'historique) : seule façon de filtrer par
          // niveau les événements passés d'une année déjà réinscrite.
          ...(level ? [{ track: level }] : []),
        ],
      },
      select: { receiptVerifiedAt: true, pedagoValidatedAt: true },
    }),
  ]);

  const months: string[] = [];
  const monthLabels: string[] = [];
  for (let i = 0; i < span; i++) {
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
  for (const a of archived) {
    bump(a.receiptVerifiedAt, "payments");
    bump(a.pedagoValidatedAt, "inscriptions");
  }

  return {
    months,
    monthLabels,
    registrations: months.map((k) => counts.get(k)!.registrations),
    payments: months.map((k) => counts.get(k)!.payments),
    inscriptions: months.map((k) => counts.get(k)!.inscriptions),
  };
}
