import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parsePreselectionWorkbook } from "@/lib/preselection";

// Construit un classeur .xlsx en mémoire (une feuille, une ligne d'en-têtes
// puis les lignes de données fournies) pour tester le parsing sans dépendre
// d'un vrai fichier reçu de Mahajanga.
async function buildWorkbook(headers: string[], rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Présélection");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe("parsePreselectionWorkbook", () => {
  it("reconnaît les colonnes usuelles malgré accents/casse/ponctuation", async () => {
    const buffer = await buildWorkbook(
      ["Nom", "Prénom", "Sexe", "N° CIN", "Filière affectée", "Niveau"],
      [["RAKOTO", "Jean", "Masculin", "101 011 123", "Management", "L1"]],
    );

    const { rows, errors } = await parsePreselectionWorkbook(buffer);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      lastName: "RAKOTO",
      firstName: "Jean",
      fullName: "RAKOTO Jean",
      gender: "M",
      cin: "101 011 123",
      formation: "Management",
      level: "L1",
    });
  });

  it("scinde une colonne unique « Nom et prénom » en nom / prénom", async () => {
    const buffer = await buildWorkbook(
      ["Nom et prénom", "Sexe"],
      [["RABE Marie Claire", "F"]],
    );

    const { rows, errors } = await parsePreselectionWorkbook(buffer);
    expect(errors).toEqual([]);
    expect(rows[0].lastName).toBe("RABE");
    expect(rows[0].firstName).toBe("Marie Claire");
  });

  it("normalise le sexe depuis plusieurs libellés", async () => {
    const buffer = await buildWorkbook(
      ["Nom", "Prénom", "Sexe"],
      [
        ["RAKOTO", "Jean", "M"],
        ["RABE", "Marie", "Féminin"],
        ["RASOA", "Paul", "inconnu"],
      ],
    );

    const { rows } = await parsePreselectionWorkbook(buffer);
    expect(rows.map((r) => r.gender)).toEqual(["M", "F", null]);
  });

  it("lit une date au format jour/mois/année aussi bien qu'une vraie cellule date", async () => {
    const buffer = await buildWorkbook(
      ["Nom", "Prénom", "Date de naissance"],
      [
        ["RAKOTO", "Jean", "15/08/2005"],
        ["RABE", "Marie", new Date(2004, 5, 20)],
      ],
    );

    const { rows } = await parsePreselectionWorkbook(buffer);
    expect(rows[0].birthDate?.getFullYear()).toBe(2005);
    expect(rows[0].birthDate?.getMonth()).toBe(7); // août = index 7
    expect(rows[0].birthDate?.getDate()).toBe(15);
    expect(rows[1].birthDate?.getFullYear()).toBe(2004);
  });

  it("ignore les lignes complètement vides", async () => {
    const buffer = await buildWorkbook(
      ["Nom", "Prénom"],
      [
        ["RAKOTO", "Jean"],
        [null, null],
        ["RABE", "Marie"],
      ],
    );

    const { rows, errors } = await parsePreselectionWorkbook(buffer);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it("signale (sans planter) une ligne sans nom ni prénom", async () => {
    const buffer = await buildWorkbook(
      ["Nom", "Prénom", "Sexe"],
      [
        ["RAKOTO", "Jean", "M"],
        ["", "", "F"],
      ],
    );

    const { rows, errors } = await parsePreselectionWorkbook(buffer);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Ligne 3/);
  });

  it("renvoie une erreur explicite si aucune colonne de nom n'est reconnue", async () => {
    const buffer = await buildWorkbook(["Adresse", "Téléphone"], [["Lot 12", "0341234567"]]);

    const { rows, errors } = await parsePreselectionWorkbook(buffer);
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/Colonnes de nom introuvables/);
  });
});
