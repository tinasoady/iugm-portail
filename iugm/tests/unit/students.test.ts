import { describe, expect, it } from "vitest";

import { buildStudentQuery, generateInitialPassword, generatePassword, mentionFromAverage } from "@/lib/students";

describe("mentionFromAverage", () => {
  it.each([
    [0, "ECHEC"],
    [9.99, "ECHEC"],
    [10, "PASSABLE"],
    [11.99, "PASSABLE"],
    [12, "ASSEZ_BIEN"],
    [13.99, "ASSEZ_BIEN"],
    [14, "BIEN"],
    [15.99, "BIEN"],
    [16, "TRES_BIEN"],
    [20, "TRES_BIEN"],
  ])("%s/20 -> %s", (average, expected) => {
    expect(mentionFromAverage(average)).toBe(expected);
  });
});

describe("generatePassword", () => {
  it("produces the requested length by default and on demand", () => {
    expect(generatePassword()).toHaveLength(10);
    expect(generatePassword(16)).toHaveLength(16);
  });

  it("never contains visually ambiguous characters (0/O, 1/l/I)", () => {
    // Beaucoup de tirages pour donner une vraie chance à chaque caractère ambigu d'apparaître
    const sample = Array.from({ length: 200 }, () => generatePassword(20)).join("");
    expect(sample).not.toMatch(/[0O1lI]/);
  });
});

describe("generateInitialPassword", () => {
  it("préfixe le mot de passe par le matricule", () => {
    const password = generateInitialPassword("FI2026-1");
    expect(password.startsWith("FI2026-1-")).toBe(true);
    // matricule + "-" + suffixe aléatoire de 5 caractères
    expect(password).toHaveLength("FI2026-1-".length + 5);
  });
});

describe("buildStudentQuery", () => {
  it("sans filtre : where vide, tri par nom croissant", () => {
    const { where, orderBy } = buildStudentQuery({});
    expect(where).toEqual({});
    expect(orderBy).toEqual({ fullName: "asc" });
  });

  it("un champ de tri inconnu retombe sur le nom", () => {
    const { orderBy } = buildStudentQuery({ sort: "n_importe_quoi" });
    expect(orderBy).toEqual({ fullName: "asc" });
  });

  it("respecte le champ de tri et la direction demandés", () => {
    const { orderBy } = buildStudentQuery({ sort: "matricule", dir: "desc" });
    expect(orderBy).toEqual({ matricule: "desc" });
  });

  it("le texte recherché s'applique sur plusieurs colonnes en OR, insensible à la casse", () => {
    const { where } = buildStudentQuery({ q: "rakoto" });
    expect(where).toMatchObject({
      AND: [
        {
          OR: expect.arrayContaining([
            { fullName: { contains: "rakoto", mode: "insensitive" } },
            { matricule: { contains: "rakoto", mode: "insensitive" } },
          ]),
        },
      ],
    });
  });

  it("le périmètre formation filtre sur mention OU program", () => {
    const { where } = buildStudentQuery({}, "Management");
    expect(where).toMatchObject({
      AND: [{ OR: [{ mention: "Management" }, { program: "Management" }] }],
    });
  });

  it("cumule plusieurs filtres actifs en même temps (AND de plusieurs OR)", () => {
    const { where } = buildStudentQuery({ year: "2026-2027", niveau: "L1" }, "Management");
    expect(where).toMatchObject({
      AND: [
        { OR: [{ mention: "Management" }, { program: "Management" }] },
        { academicYear: "2026-2027" },
        { OR: [{ level: "L1" }, { track: "L1" }] },
      ],
    });
  });
});
