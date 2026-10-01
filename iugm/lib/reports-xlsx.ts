import ExcelJS from "exceljs";

import type { FinancialReport } from "./reports";

// Classeur Excel de l'état récapitulatif : une feuille « Synthèse » (effectifs
// et encaissements par filière/niveau, avec ligne de total) et une feuille
// « Reste dû » (liste de relance, une ligne par dossier).

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
const AR_FORMAT = '#,##0" Ar"';

const DUE_STATUS_LABEL = { UNPAID: "Non payé", PARTIAL: "2e tranche due" } as const;

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 30;
}

export async function buildFinancialReportWorkbook(
  report: FinancialReport,
  context: {
    institutionName: string;
    academicYear: string | null;
    level: string | null;
    formation: string | null;
    generatedAt: Date;
  },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = context.institutionName;
  workbook.created = context.generatedAt;

  const scope = [
    context.academicYear ? `année ${context.academicYear}` : "toutes années",
    context.level ? `niveau ${context.level}` : "tous niveaux",
    context.formation ? `filière ${context.formation}` : "toutes filières",
  ].join(" — ");

  // --- Synthèse ---
  const summary = workbook.addWorksheet("Synthèse");
  summary.columns = [
    { width: 34 },
    { width: 10 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];
  summary.mergeCells("A1:J1");
  summary.getCell("A1").value = context.institutionName;
  summary.getCell("A1").font = { bold: true, size: 13 };
  summary.mergeCells("A2:J2");
  summary.getCell("A2").value = `État récapitulatif des effectifs et de l'écolage — ${scope}`;
  summary.getCell("A2").font = { bold: true };
  summary.mergeCells("A3:J3");
  summary.getCell("A3").value = `Généré le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(context.generatedAt)}`;
  summary.getCell("A3").font = { italic: true, color: { argb: "FF71717A" } };

  const header = summary.addRow([
    "Filière",
    "Niveau",
    "Effectif",
    "Étrangers",
    "Inscrits",
    "Payé intégral.",
    "Partiel",
    "Versé",
    "Attendu",
    "Reste dû",
  ]);
  header.height = 30;
  styleHeader(header);

  for (const r of report.rows) {
    const row = summary.addRow([
      r.formation,
      r.level,
      r.headcount,
      r.foreign,
      r.enrolled,
      r.fullyPaid,
      r.partiallyPaid,
      r.collected,
      r.expected,
      r.outstanding,
    ]);
    for (const col of [8, 9, 10]) row.getCell(col).numFmt = AR_FORMAT;
  }

  const t = report.totals;
  const totalRow = summary.addRow([
    "Total",
    "",
    t.headcount,
    t.foreign,
    t.enrolled,
    t.fullyPaid,
    t.partiallyPaid,
    t.collected,
    t.expected,
    t.outstanding,
  ]);
  totalRow.font = { bold: true };
  totalRow.fill = TOTAL_FILL;
  for (const col of [8, 9, 10]) totalRow.getCell(col).numFmt = AR_FORMAT;

  if (report.withoutLevel > 0) {
    summary.addRow([]);
    summary.addRow([
      `${report.withoutLevel} dossier(s) sans niveau défini : comptés dans l'effectif, absents de l'attendu et du reste dû.`,
    ]).font = { italic: true, color: { argb: "FF71717A" } };
  }
  summary.views = [{ state: "frozen", ySplit: 4 }];

  // --- Reste dû ---
  const due = workbook.addWorksheet("Reste dû");
  due.columns = [
    { header: "Matricule", width: 14 },
    { header: "Nom", width: 30 },
    { header: "Filière", width: 28 },
    { header: "Niveau", width: 10 },
    { header: "Situation", width: 16 },
    { header: "Versé", width: 16 },
    { header: "Reste dû", width: 16 },
    { header: "Téléphone", width: 16 },
    { header: "Tél. responsable", width: 16 },
  ];
  styleHeader(due.getRow(1));
  for (const d of report.dueStudents) {
    const row = due.addRow([
      d.matricule,
      d.fullName,
      d.formation,
      d.level,
      DUE_STATUS_LABEL[d.status],
      d.paid,
      d.due ?? "Niveau non défini",
      d.phone ?? "",
      d.guardianPhone ?? "",
    ]);
    row.getCell(6).numFmt = AR_FORMAT;
    if (d.due !== null) row.getCell(7).numFmt = AR_FORMAT;
  }
  due.views = [{ state: "frozen", ySplit: 1 }];
  due.autoFilter = { from: "A1", to: "I1" };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
