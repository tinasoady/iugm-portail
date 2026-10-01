import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { getFinancialReport } from "@/lib/reports";
import { buildFinancialReportWorkbook } from "@/lib/reports-xlsx";
import ExcelJS from "exceljs";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(resetDb);
afterAll(disconnectDb);

let seq = 0;
async function createStudent(
  overrides: Partial<{
    mention: string;
    level: string;
    academicYear: string;
    nationality: string;
    status: "ENREGISTRE" | "PAIEMENT_VERIFIE" | "ADMIN_VALIDEE" | "INSCRIT";
  }> = {},
) {
  seq += 1;
  return prisma.student.create({
    data: {
      matricule: `FI2026-${seq}`,
      fullName: `ETUDIANT ${seq}`,
      mention: overrides.mention ?? "Management",
      level: overrides.level ?? "L1",
      academicYear: overrides.academicYear ?? "2026-2027",
      nationality: overrides.nationality ?? "Malagasy",
      status: overrides.status ?? "INSCRIT",
    },
  });
}

async function pay(studentId: string, type: "TRANCHE_S1" | "TRANCHE_S2" | "TOTALITE", amount: number, year = "2026-2027") {
  return prisma.ecolagePayment.create({
    data: { studentId, academicYear: year, type, amount, receiptNumber: `R-${studentId}-${type}` },
  });
}

describe("getFinancialReport (base de données)", () => {
  it("agrège effectifs, versements et reste dû pour l'année demandée", async () => {
    const a = await createStudent();
    const b = await createStudent();
    await createStudent({ academicYear: "2025-2026" }); // autre année : exclu
    await pay(a.id, "TOTALITE", 700_000);
    await pay(b.id, "TRANCHE_S1", 300_000);

    const report = await getFinancialReport({ academicYear: "2026-2027" });
    expect(report.totals).toMatchObject({
      headcount: 2,
      fullyPaid: 1,
      partiallyPaid: 1,
      collected: 1_000_000,
      expected: 1_400_000,
      outstanding: 400_000,
    });
    expect(report.dueStudents.map((d) => d.id)).toEqual([b.id]);
  });

  it("sans année : chaque dossier est jugé sur SON année de rattachement", async () => {
    const old = await createStudent({ academicYear: "2025-2026" });
    const current = await createStudent({ academicYear: "2026-2027" });
    await pay(old.id, "TOTALITE", 700_000, "2025-2026");
    await pay(current.id, "TRANCHE_S1", 100_000, "2025-2026"); // versement d'une année passée : ignoré

    const report = await getFinancialReport({});
    expect(report.totals.headcount).toBe(2);
    expect(report.totals.fullyPaid).toBe(1);
    expect(report.totals.unpaid).toBe(1);
    expect(report.totals.collected).toBe(700_000);
  });

  it("filtre par niveau et par filière", async () => {
    await createStudent({ level: "L1", mention: "Management" });
    await createStudent({ level: "L2", mention: "Management" });
    await createStudent({ level: "L1", mention: "Économie générale" });

    expect((await getFinancialReport({ level: "L1" })).totals.headcount).toBe(2);
    expect((await getFinancialReport({ formation: "Management" })).totals.headcount).toBe(2);
    expect((await getFinancialReport({ level: "L1", formation: "Management" })).totals.headcount).toBe(1);
  });

  it("le périmètre d'un secrétaire de formation prime sur la filière demandée", async () => {
    await createStudent({ mention: "Management" });
    await createStudent({ mention: "Économie générale" });
    const report = await getFinancialReport({
      formation: "Économie générale",
      scopeFormation: "Management",
    });
    expect(report.totals.headcount).toBe(1);
    expect(report.rows[0].formation).toBe("Management");
  });

  it("exclut les versements des dossiers hors sélection (pas de fuite entre filières)", async () => {
    const mine = await createStudent({ mention: "Management" });
    const other = await createStudent({ mention: "Économie générale" });
    await pay(mine.id, "TRANCHE_S1", 200_000);
    await pay(other.id, "TOTALITE", 900_000);

    const report = await getFinancialReport({ scopeFormation: "Management" });
    expect(report.totals.collected).toBe(200_000);
  });

  it("utilise les tarifs configurés pour le niveau", async () => {
    await prisma.levelFinancialInfo.create({
      data: {
        level: "L1",
        inscriptionLocal: 1,
        inscriptionForeign: 1,
        insurance: 1,
        polo: 1,
        tuitionLocal: 500_000,
        tuitionForeign: 600_000,
        firstPaymentLocal: 1,
        firstPaymentForeign: 1,
      },
    });
    await createStudent();
    const report = await getFinancialReport({});
    expect(report.totals.expected).toBe(500_000);
  });
});

describe("export Excel de l'état", () => {
  it("produit un classeur lisible avec les totaux et la liste de relance", async () => {
    const a = await createStudent();
    await createStudent({ nationality: "Étranger" });
    await pay(a.id, "TRANCHE_S1", 200_000);

    const report = await getFinancialReport({ academicYear: "2026-2027" });
    const buffer = await buildFinancialReportWorkbook(report, {
      institutionName: "IUGM",
      academicYear: "2026-2027",
      level: null,
      formation: null,
      generatedAt: new Date("2026-10-01T10:00:00Z"),
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Synthèse", "Reste dû"]);

    const summary = workbook.getWorksheet("Synthèse")!;
    const totalRow = summary.getRow(summary.rowCount - 0);
    // la dernière ligne non vide est le total
    const values: unknown[] = [];
    summary.eachRow((row) => values.push(row.getCell(1).value));
    expect(values).toContain("Total");
    expect(totalRow).toBeDefined();

    const due = workbook.getWorksheet("Reste dû")!;
    expect(due.rowCount).toBe(1 + 2); // en-tête + 2 dossiers non soldés
    expect(due.getRow(1).getCell(1).value).toBe("Matricule");
  });
});
