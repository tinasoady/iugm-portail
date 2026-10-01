import { describe, expect, it } from "vitest";

import { FINANCIAL_INFO_DEFAULTS } from "@/lib/finance";
import {
  UNKNOWN_FORMATION,
  UNKNOWN_LEVEL,
  buildFinancialReport,
  parseReportParams,
  type ReportPayment,
  type ReportStudent,
} from "@/lib/reports";

// Tarifs de test lisibles : L1 local 700 000 Ar, étranger 1 000 000 Ar
const INFOS = new Map([
  ["L1", { ...FINANCIAL_INFO_DEFAULTS }],
  ["L2", { ...FINANCIAL_INFO_DEFAULTS, tuitionLocal: 800_000, tuitionForeign: 1_100_000 }],
]);

let seq = 0;
function student(overrides: Partial<ReportStudent> = {}): ReportStudent {
  seq += 1;
  return {
    id: `s${seq}`,
    matricule: `FI2026-${seq}`,
    fullName: `ETUDIANT ${seq}`,
    phone: null,
    guardianPhone: null,
    mention: "Management",
    program: null,
    level: "L1",
    track: null,
    nationality: "Malagasy",
    status: "INSCRIT",
    academicYear: "2026-2027",
    ...overrides,
  };
}

function payment(
  studentId: string,
  type: ReportPayment["type"],
  amount: number,
  academicYear = "2026-2027",
): ReportPayment {
  return { studentId, type, amount, academicYear };
}

describe("buildFinancialReport", () => {
  it("rapport vide : totaux à zéro", () => {
    const report = buildFinancialReport([], [], INFOS);
    expect(report.rows).toEqual([]);
    expect(report.totals.headcount).toBe(0);
    expect(report.totals.collected).toBe(0);
    expect(report.dueStudents).toEqual([]);
  });

  it("classe payé / partiel / non payé et calcule le reste dû", () => {
    const paid = student();
    const partial = student();
    const unpaid = student();
    const report = buildFinancialReport(
      [paid, partial, unpaid],
      [
        payment(paid.id, "TOTALITE", 700_000),
        payment(partial.id, "TRANCHE_S1", 250_000),
      ],
      INFOS,
    );

    const row = report.rows[0];
    expect(row).toMatchObject({
      formation: "Management",
      level: "L1",
      headcount: 3,
      fullyPaid: 1,
      partiallyPaid: 1,
      unpaid: 1,
      collected: 950_000,
      expected: 2_100_000,
      // partiel : 700 000 − 250 000 ; non payé : 700 000 ; payé : 0
      outstanding: 450_000 + 700_000,
    });
    expect(report.totals.outstanding).toBe(1_150_000);
    expect(report.dueStudents.map((d) => [d.id, d.status, d.due])).toEqual([
      [unpaid.id, "UNPAID", 700_000],
      [partial.id, "PARTIAL", 450_000],
    ]);
  });

  it("deux tranches = payé intégralement, même si le total versé diffère du tarif", () => {
    const s = student();
    const report = buildFinancialReport(
      [s],
      [payment(s.id, "TRANCHE_S1", 350_000), payment(s.id, "TRANCHE_S2", 350_000)],
      INFOS,
    );
    expect(report.totals.fullyPaid).toBe(1);
    expect(report.totals.outstanding).toBe(0);
    expect(report.dueStudents).toEqual([]);
  });

  it("un versement qui dépasse le tarif ne donne jamais un reste dû négatif", () => {
    const s = student();
    const report = buildFinancialReport([s], [payment(s.id, "TRANCHE_S1", 900_000)], INFOS);
    expect(report.totals.outstanding).toBe(0);
    expect(report.dueStudents[0].due).toBe(0);
  });

  it("ignore les versements d'une autre année que celle du dossier", () => {
    const s = student({ academicYear: "2026-2027" });
    const report = buildFinancialReport(
      [s],
      [payment(s.id, "TOTALITE", 700_000, "2025-2026")],
      INFOS,
    );
    expect(report.totals.collected).toBe(0);
    expect(report.totals.unpaid).toBe(1);
    expect(report.totals.outstanding).toBe(700_000);
  });

  it("applique le tarif étranger", () => {
    const s = student({ nationality: "Étranger" });
    const report = buildFinancialReport([s], [], INFOS);
    expect(report.totals.foreign).toBe(1);
    expect(report.totals.expected).toBe(1_000_000);
    expect(report.totals.outstanding).toBe(1_000_000);
  });

  it("un dossier sans niveau compte dans l'effectif mais pas dans l'attendu", () => {
    const s = student({ level: null, track: null });
    const report = buildFinancialReport([s], [payment(s.id, "TRANCHE_S1", 100_000)], INFOS);
    expect(report.rows[0]).toMatchObject({ level: UNKNOWN_LEVEL, headcount: 1, expected: 0, outstanding: 0 });
    expect(report.withoutLevel).toBe(1);
    expect(report.dueStudents[0]).toMatchObject({ due: null, paid: 100_000 });
  });

  it("filière et niveau retombent sur les champs hérités (program, track)", () => {
    const s = student({ mention: null, program: "Économie générale", level: null, track: "L2" });
    const report = buildFinancialReport([s], [], INFOS);
    expect(report.rows[0]).toMatchObject({ formation: "Économie générale", level: "L2" });
    // level est vide : pas de tarif malgré le parcours
    expect(report.totals.expected).toBe(0);
  });

  it("filière absente : libellé dédié", () => {
    const report = buildFinancialReport([student({ mention: null, program: null })], [], INFOS);
    expect(report.rows[0].formation).toBe(UNKNOWN_FORMATION);
  });

  it("regroupe par filière puis niveau dans l'ordre L1 → M2, filières par ordre alphabétique", () => {
    const report = buildFinancialReport(
      [
        student({ mention: "Management", level: "L2" }),
        student({ mention: "Management", level: "L1" }),
        student({ mention: "Économie générale", level: "L1" }),
        student({ mention: "Management", level: "M1" }),
      ],
      [],
      INFOS,
    );
    expect(report.rows.map((r) => `${r.formation}/${r.level}`)).toEqual([
      "Économie générale/L1",
      "Management/L1",
      "Management/L2",
      "Management/M1",
    ]);
  });

  it("compte les inscrits et les statuts du workflow", () => {
    const report = buildFinancialReport(
      [
        student({ status: "INSCRIT" }),
        student({ status: "ENREGISTRE" }),
        student({ status: "ENREGISTRE" }),
      ],
      [],
      INFOS,
    );
    expect(report.totals.enrolled).toBe(1);
    expect(report.byStatus).toEqual({ INSCRIT: 1, ENREGISTRE: 2 });
  });

  it("la somme des lignes égale les totaux", () => {
    const students = Array.from({ length: 12 }, (_, i) =>
      student({ level: i % 2 ? "L1" : "L2", mention: i % 3 ? "Management" : "Économie générale" }),
    );
    const payments = students
      .filter((_, i) => i % 4 === 0)
      .map((s) => payment(s.id, "TRANCHE_S1", 200_000));
    const report = buildFinancialReport(students, payments, INFOS);
    const sum = (key: "headcount" | "collected" | "expected" | "outstanding") =>
      report.rows.reduce((total, r) => total + r[key], 0);
    expect(report.totals.headcount).toBe(sum("headcount"));
    expect(report.totals.collected).toBe(sum("collected"));
    expect(report.totals.expected).toBe(sum("expected"));
    expect(report.totals.outstanding).toBe(sum("outstanding"));
    expect(report.totals.headcount).toBe(12);
  });

  it("trie les impayés du plus gros reste dû au plus petit, niveau inconnu en dernier", () => {
    const small = student();
    const big = student({ level: "L2" });
    const noLevel = student({ level: null });
    const report = buildFinancialReport(
      [small, noLevel, big],
      [payment(small.id, "TRANCHE_S1", 500_000)],
      INFOS,
    );
    expect(report.dueStudents.map((d) => d.id)).toEqual([big.id, small.id, noLevel.id]);
  });
});

describe("parseReportParams", () => {
  const FORMATIONS = ["Management", "Économie générale"];

  it("accepte des valeurs connues", () => {
    expect(parseReportParams({ year: "2026-2027", level: "L2", f: "Management" }, FORMATIONS)).toEqual({
      academicYear: "2026-2027",
      level: "L2",
      formation: "Management",
    });
  });

  it("rejette tout ce qui n'est pas reconnu", () => {
    expect(
      parseReportParams({ year: "2026'; DROP TABLE", level: "L9", f: "Inconnue" }, FORMATIONS),
    ).toEqual({ academicYear: null, level: null, formation: null });
    expect(parseReportParams({}, FORMATIONS)).toEqual({ academicYear: null, level: null, formation: null });
    expect(parseReportParams({ year: "2026-27" }, FORMATIONS).academicYear).toBeNull();
  });
});
