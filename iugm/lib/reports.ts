import type { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { LEVELS } from "./level-shared";
import {
  annualTuition,
  getLevelFinancialInfos,
  FOREIGN_NATIONALITY,
  type FinancialInfoFields,
} from "./finance";
import { paymentStatusOf, type EcolagePaymentStatus, type EcolagePaymentTypeValue } from "./students";

// ---------------------------------------------------------------------------
// États récapitulatifs : effectifs, encaissements et impayés par filière et
// par niveau. Mêmes règles que la Gestion d'écolage (lib/students.ts) :
//  - seuls comptent les versements de l'année de rattachement ACTUELLE du
//    dossier (un versement d'une année archivée par réinscription est ignoré) ;
//  - « attendu » = frais de formation annuel du niveau (tarif local ou
//    étranger) ; « versé » = somme des versements enregistrés, droits
//    d'inscription compris, puisque le versement à l'inscription les inclut ;
//  - « reste dû » = attendu − versé, jamais négatif, nul si l'écolage est soldé ;
//  - un dossier sans niveau n'a pas de tarif : il compte dans l'effectif mais
//    pas dans l'attendu ni le reste dû (signalé dans `withoutLevel`).
// ---------------------------------------------------------------------------

export const UNKNOWN_FORMATION = "Filière non renseignée";
export const UNKNOWN_LEVEL = "Niveau non défini";

export type ReportStudent = {
  id: string;
  matricule: string;
  fullName: string;
  phone: string | null;
  guardianPhone: string | null;
  mention: string | null;
  program: string | null;
  level: string | null;
  track: string | null;
  nationality: string | null;
  status: string;
  academicYear: string | null;
};

export type ReportPayment = {
  studentId: string;
  academicYear: string;
  type: EcolagePaymentTypeValue;
  amount: number;
};

export type ReportRow = {
  formation: string;
  level: string;
  headcount: number;
  foreign: number;
  enrolled: number; // inscription finalisée (statut INSCRIT)
  fullyPaid: number;
  partiallyPaid: number;
  unpaid: number;
  collected: number; // Ar versés
  expected: number; // Ar attendus (tarif annuel)
  outstanding: number; // Ar restant dus
};

export type ReportDueEntry = {
  id: string;
  matricule: string;
  fullName: string;
  phone: string | null;
  guardianPhone: string | null;
  formation: string;
  level: string;
  status: Exclude<EcolagePaymentStatus, "FULL">;
  paid: number;
  due: number | null; // null : niveau non défini, reste dû incalculable
};

export type FinancialReport = {
  rows: ReportRow[];
  totals: ReportRow;
  byStatus: Record<string, number>;
  dueStudents: ReportDueEntry[];
  withoutLevel: number;
};

function emptyRow(formation: string, level: string): ReportRow {
  return {
    formation,
    level,
    headcount: 0,
    foreign: 0,
    enrolled: 0,
    fullyPaid: 0,
    partiallyPaid: 0,
    unpaid: 0,
    collected: 0,
    expected: 0,
    outstanding: 0,
  };
}

function levelRank(level: string): number {
  const i = (LEVELS as readonly string[]).indexOf(level);
  return i === -1 ? LEVELS.length : i;
}

// Fonction pure (aucun accès base) : testable avec des données fabriquées.
export function buildFinancialReport(
  students: ReportStudent[],
  payments: ReportPayment[],
  infoByLevel: Map<string, FinancialInfoFields>,
): FinancialReport {
  const paymentsByStudent = new Map<string, ReportPayment[]>();
  for (const p of payments) {
    const list = paymentsByStudent.get(p.studentId);
    if (list) list.push(p);
    else paymentsByStudent.set(p.studentId, [p]);
  }

  const rows = new Map<string, ReportRow>();
  const byStatus: Record<string, number> = {};
  const dueStudents: ReportDueEntry[] = [];
  let withoutLevel = 0;

  for (const s of students) {
    const formation = s.mention ?? s.program ?? UNKNOWN_FORMATION;
    const level = s.level ?? s.track ?? UNKNOWN_LEVEL;
    const key = `${formation}\u0000${level}`;
    let row = rows.get(key);
    if (!row) {
      row = emptyRow(formation, level);
      rows.set(key, row);
    }

    // Seuls les versements de l'année de rattachement actuelle comptent
    const own = (paymentsByStudent.get(s.id) ?? []).filter((p) => p.academicYear === s.academicYear);
    const paid = own.reduce((sum, p) => sum + p.amount, 0);
    const status = paymentStatusOf(new Set(own.map((p) => p.type)));

    const info = s.level ? infoByLevel.get(s.level) : undefined;
    const annual = info ? annualTuition(info, s.nationality === FOREIGN_NATIONALITY) : null;
    if (annual === null) withoutLevel++;
    const outstanding = status === "FULL" || annual === null ? 0 : Math.max(annual - paid, 0);

    row.headcount++;
    if (s.nationality === FOREIGN_NATIONALITY) row.foreign++;
    if (s.status === "INSCRIT") row.enrolled++;
    if (status === "FULL") row.fullyPaid++;
    else if (status === "PARTIAL") row.partiallyPaid++;
    else row.unpaid++;
    row.collected += paid;
    row.expected += annual ?? 0;
    row.outstanding += outstanding;
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;

    if (status !== "FULL") {
      dueStudents.push({
        id: s.id,
        matricule: s.matricule,
        fullName: s.fullName,
        phone: s.phone,
        guardianPhone: s.guardianPhone,
        formation,
        level,
        status,
        paid,
        due: annual === null ? null : outstanding,
      });
    }
  }

  const sorted = [...rows.values()].sort(
    (a, b) =>
      a.formation.localeCompare(b.formation, "fr") ||
      levelRank(a.level) - levelRank(b.level) ||
      a.level.localeCompare(b.level, "fr"),
  );

  const totals = emptyRow("Total", "");
  for (const r of sorted) {
    totals.headcount += r.headcount;
    totals.foreign += r.foreign;
    totals.enrolled += r.enrolled;
    totals.fullyPaid += r.fullyPaid;
    totals.partiallyPaid += r.partiallyPaid;
    totals.unpaid += r.unpaid;
    totals.collected += r.collected;
    totals.expected += r.expected;
    totals.outstanding += r.outstanding;
  }

  // Plus gros reste dû d'abord : les relances commencent par les cas les plus lourds
  dueStudents.sort(
    (a, b) => (b.due ?? -1) - (a.due ?? -1) || a.fullName.localeCompare(b.fullName, "fr"),
  );

  return { rows: sorted, totals, byStatus, dueStudents, withoutLevel };
}

export type ReportFilters = {
  academicYear?: string | null;
  level?: string | null;
  // Filière demandée (liste déroulante) ; `scopeFormation` est le périmètre
  // imposé côté serveur à un secrétaire de formation et prime toujours.
  formation?: string | null;
  scopeFormation?: string | null;
};

export async function getFinancialReport(filters: ReportFilters): Promise<FinancialReport> {
  const formation = filters.scopeFormation ?? filters.formation ?? null;
  const where: Prisma.StudentWhereInput = {
    ...(filters.academicYear ? { academicYear: filters.academicYear } : {}),
    ...(filters.level ? { level: filters.level } : {}),
    ...(formation ? { OR: [{ mention: formation }, { program: formation }] } : {}),
  };

  const [students, payments, infos] = await Promise.all([
    prisma.student.findMany({
      where,
      select: {
        id: true,
        matricule: true,
        fullName: true,
        phone: true,
        guardianPhone: true,
        mention: true,
        program: true,
        level: true,
        track: true,
        nationality: true,
        status: true,
        academicYear: true,
      },
    }),
    // Filtre par relation plutôt que par liste d'identifiants : une liste de
    // milliers d'ids dépasserait la limite de paramètres de PostgreSQL.
    prisma.ecolagePayment.findMany({
      where: { student: where },
      select: { studentId: true, academicYear: true, type: true, amount: true },
    }),
    getLevelFinancialInfos(),
  ]);

  return buildFinancialReport(
    students,
    payments,
    new Map(infos.map((i) => [i.level, i])),
  );
}

// ---------------------------------------------------------------------------
// Paramètres d'URL des états (page, impression, export) : tout est validé
// contre des valeurs connues, jamais transmis tel quel à la base.
// ---------------------------------------------------------------------------

export type RawReportParams = { year?: string; level?: string; f?: string };

export function parseReportParams(
  raw: RawReportParams,
  validFormations: readonly string[],
): { academicYear: string | null; level: string | null; formation: string | null } {
  const academicYear = raw.year && /^\d{4}-\d{4}$/.test(raw.year) ? raw.year : null;
  const level = raw.level && (LEVELS as readonly string[]).includes(raw.level) ? raw.level : null;
  const formation = raw.f && validFormations.includes(raw.f) ? raw.f : null;
  return { academicYear, level, formation };
}
