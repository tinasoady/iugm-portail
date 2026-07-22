import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Évolution mensuelle des étapes clés du parcours étudiant, pour le graphique
// du tableau de bord superadmin. S'appuie sur le journal d'audit (chaque
// étape a déjà un horodatage fiable et dédié) plutôt que sur Student.updatedAt,
// qui est repoussé par n'importe quelle modification ultérieure du dossier.
// ---------------------------------------------------------------------------

const TREND_ACTIONS = [
  "STUDENT_REGISTERED",
  "RECEIPT_VERIFIED",
  "PEDAGO_INSCRIPTION_VALIDATED",
] as const;
type TrendAction = (typeof TREND_ACTIONS)[number];
const TREND_ACTION_SET: Set<string> = new Set(TREND_ACTIONS);

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

  const logs = await prisma.auditLog.findMany({
    where: {
      action: { in: [...TREND_ACTIONS] },
      createdAt: { gte: start },
    },
    select: { action: true, createdAt: true },
  });

  const months: string[] = [];
  const monthLabels: string[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    monthLabels.push(monthLabelFormatter.format(d));
  }

  const counts = new Map<string, Record<TrendAction, number>>();
  for (const key of months) {
    counts.set(key, { STUDENT_REGISTERED: 0, RECEIPT_VERIFIED: 0, PEDAGO_INSCRIPTION_VALIDATED: 0 });
  }

  for (const log of logs) {
    if (!TREND_ACTION_SET.has(log.action)) continue;
    const key = `${log.createdAt.getFullYear()}-${String(log.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const bucket = counts.get(key);
    if (bucket) bucket[log.action as TrendAction]++;
  }

  return {
    months,
    monthLabels,
    registrations: months.map((k) => counts.get(k)!.STUDENT_REGISTERED),
    payments: months.map((k) => counts.get(k)!.RECEIPT_VERIFIED),
    inscriptions: months.map((k) => counts.get(k)!.PEDAGO_INSCRIPTION_VALIDATED),
  };
}
