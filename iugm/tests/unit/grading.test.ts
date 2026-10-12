import { describe, expect, it } from "vitest";

import {
  combineCcExam,
  computeSemesterAverage,
  semesterMention,
  validateGradingSettings,
  type GradedSubject,
} from "@/lib/grading";

const subject = (overrides: Partial<GradedSubject>): GradedSubject => ({
  name: "Matière",
  mandatory: true,
  coefficient: 1,
  bonusThreshold: 10,
  eliminationThreshold: null,
  value: null,
  ...overrides,
});

describe("computeSemesterAverage", () => {
  it("pondère les matières obligatoires par leur coefficient", () => {
    const result = computeSemesterAverage([
      subject({ name: "A", coefficient: 3, value: 14 }),
      subject({ name: "B", coefficient: 1, value: 6 }),
    ]);
    // (42 + 6) / 4 = 12
    expect(result).toEqual({
      status: "complete",
      average: 12,
      bonusPoints: 0,
      totalCoefficients: 4,
      eliminatedBy: [],
    });
  });

  it("ajoute en bonus les points au-delà du seuil d'une facultative, multipliés par son coefficient", () => {
    const result = computeSemesterAverage([
      subject({ name: "A", value: 10 }),
      subject({ name: "B", value: 10 }),
      subject({ name: "Sport", mandatory: false, coefficient: 2, bonusThreshold: 12, value: 15 }),
    ]);
    // (20 + (15 − 12) × 2) / 2 = 13
    expect(result).toMatchObject({ status: "complete", average: 13, bonusPoints: 6 });
  });

  it("ignore une facultative sous le seuil ou non notée", () => {
    const result = computeSemesterAverage([
      subject({ name: "A", value: 11 }),
      subject({ name: "Sport", mandatory: false, value: 4 }),
      subject({ name: "Théâtre", mandatory: false, value: null }),
    ]);
    expect(result).toMatchObject({ status: "complete", average: 11, bonusPoints: 0 });
  });

  it("plafonne la moyenne à 20", () => {
    const result = computeSemesterAverage([
      subject({ name: "A", value: 19 }),
      subject({ name: "Sport", mandatory: false, coefficient: 5, value: 20 }),
    ]);
    expect(result).toMatchObject({ status: "complete", average: 20 });
  });

  it("arrondit au centième", () => {
    const result = computeSemesterAverage([
      subject({ name: "A", value: 10 }),
      subject({ name: "B", value: 11 }),
      subject({ name: "C", value: 11 }),
    ]);
    expect(result).toMatchObject({ average: 10.67 });
  });

  it("signale les matières obligatoires non notées au lieu de calculer", () => {
    expect(
      computeSemesterAverage([
        subject({ name: "A", value: 12 }),
        subject({ name: "B" }),
        subject({ name: "C" }),
      ]),
    ).toEqual({ status: "incomplete", missing: ["B", "C"] });
  });

  it("ne calcule rien sans matière obligatoire", () => {
    expect(computeSemesterAverage([subject({ mandatory: false, value: 18 })])).toEqual({
      status: "no_mandatory",
    });
    expect(computeSemesterAverage([])).toEqual({ status: "no_mandatory" });
  });
});

describe("note éliminatoire", () => {
  it("signale les matières obligatoires strictement sous leur note éliminatoire", () => {
    const result = computeSemesterAverage([
      subject({ name: "A", value: 18, coefficient: 3 }),
      subject({ name: "B", value: 4.5, eliminationThreshold: 5 }),
      subject({ name: "C", value: 5, eliminationThreshold: 5 }),
    ]);
    expect(result).toMatchObject({ status: "complete", eliminatedBy: ["B"] });
  });

  it("ne s'applique pas aux matières facultatives", () => {
    const result = computeSemesterAverage([
      subject({ name: "A", value: 12 }),
      subject({ name: "Sport", mandatory: false, value: 1, eliminationThreshold: 5 }),
    ]);
    expect(result).toMatchObject({ eliminatedBy: [] });
  });

  it("donne ÉCHEC au semestre quelle que soit la moyenne", () => {
    expect(semesterMention(15, true)).toBe("ECHEC");
    expect(semesterMention(15, false)).toBe("BIEN");
  });
});

describe("combineCcExam", () => {
  it("pondère contrôle continu et examen selon la part du CC", () => {
    expect(combineCcExam(10, 15, 40)).toBe(13); // 10 × 0,4 + 15 × 0,6
    expect(combineCcExam(12, 7, 50)).toBe(9.5);
    expect(combineCcExam(11, 13, 100)).toBe(11);
  });

  it("arrondit au centième", () => {
    expect(combineCcExam(10, 11, 33)).toBe(10.67);
  });
});

describe("validateGradingSettings", () => {
  const valid = {
    semester: "S1",
    coefficient: 2,
    bonusThreshold: 10,
    ccWeight: 40,
    eliminationThreshold: 5,
  };

  it("accepte des paramètres valides, semestre non précisé compris", () => {
    expect(validateGradingSettings(valid)).toBeNull();
    expect(validateGradingSettings({ ...valid, semester: null })).toBeNull();
  });

  it("refuse un semestre, un coefficient ou un seuil invalides", () => {
    expect(validateGradingSettings({ ...valid, semester: "S3" })).toMatch(/Semestre/);
    expect(validateGradingSettings({ ...valid, coefficient: 0 })).toMatch(/coefficient/);
    expect(validateGradingSettings({ ...valid, coefficient: Number.NaN })).toMatch(/coefficient/);
    expect(validateGradingSettings({ ...valid, bonusThreshold: -1 })).toMatch(/seuil/);
    expect(validateGradingSettings({ ...valid, ccWeight: 120 })).toMatch(/contrôle continu/);
    expect(validateGradingSettings({ ...valid, eliminationThreshold: 0 })).toMatch(/éliminatoire/);
    expect(validateGradingSettings({ ...valid, eliminationThreshold: null })).toBeNull();
  });
});
