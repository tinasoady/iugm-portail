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
    expect(errors[0]).toMatch(/ligne 3/i);
  });

  it("renvoie une erreur explicite si aucune colonne de nom n'est reconnue", async () => {
    const buffer = await buildWorkbook(["Adresse", "Téléphone"], [["Lot 12", "0341234567"]]);

    const { rows, errors } = await parsePreselectionWorkbook(buffer);
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/Colonnes de nom introuvables/);
  });
});

// Reproduit le format "par classe" du fichier reçu de l'IUGM : une feuille
// par niveau/filière (nom "L1 - PGI"...), un bandeau avant les colonnes
// (en-tête pas en ligne 1), une ligne de légende "[ 1 ] [ 2 ] ..." juste
// après l'en-tête, niveau/filière absents des colonnes (déduits du nom de
// la feuille).
async function buildClassSheetWorkbook(
  sheetName: string,
  headers: (string | null)[],
  legendRow: (string | null)[],
  rows: unknown[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow([]); // ligne 1 : vide
  sheet.addRow([null, null, "MINISTERE DE L'ENSEIGNEMENT SUPERIEUR"]); // ligne 2 : bandeau
  sheet.addRow([]); // ligne 3
  sheet.addRow([null, null, "LISTE DES ÉTUDIANTS AU TITRE DE L'ANNEE 2025-2026"]); // ligne 4
  sheet.addRow(headers); // ligne 5 : en-tête réel
  sheet.addRow(legendRow); // ligne 6 : légende "[ 1 ] [ 2 ] ..."
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe("parsePreselectionWorkbook — format « par classe » (une feuille par niveau/filière)", () => {
  it("trouve l'en-tête au-delà de la ligne 1 et déduit niveau/filière du nom de la feuille", async () => {
    const buffer = await buildClassSheetWorkbook(
      "L1 - PGI",
      [null, "NOM", "PRENOMS", "SEXE"],
      [null, "[ 1 ]", "[ 2 ]", "[ 3 ]"],
      [[null, "RAZAFY", "Marie", "F"]],
    );

    const { rows, errors } = await parsePreselectionWorkbook(buffer);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      lastName: "RAZAFY",
      firstName: "Marie",
      level: "L1",
      formation: "Progiciel de Gestion Intégrée (Informatique de gestion)",
    });
  });

  it("agrège plusieurs feuilles « niveau - filière » et ignore les feuilles hors format", async () => {
    const workbook = new ExcelJS.Workbook();
    const l1 = workbook.addWorksheet("L1 - MGT");
    l1.addRow([null, null, "bandeau"]);
    l1.addRow([null, "NOM", "PRENOMS"]);
    l1.addRow([null, "[ 1 ]", "[ 2 ]"]);
    l1.addRow([null, "RAKOTO", "Jean"]);

    const m2 = workbook.addWorksheet("M2 - GRH");
    m2.addRow([null, null, "bandeau"]);
    m2.addRow([null, "NOM", "PRENOMS"]);
    m2.addRow([null, "[ 1 ]", "[ 2 ]"]);
    m2.addRow([null, "RABE", "Marie"]);

    const summary = workbook.addWorksheet("Sommaire"); // ne suit pas "L1 - ..." : ignorée
    summary.addRow(["Table des matières"]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { rows, errors } = await parsePreselectionWorkbook(buffer);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.fullName, r.level, r.formation]).sort()).toEqual([
      ["RABE Marie", "M2", "Gestion des Ressources Humaines"],
      ["RAKOTO Jean", "L1", "Management"],
    ]);
  });

  it("un code de filière inconnu retombe sur le code brut", async () => {
    const buffer = await buildClassSheetWorkbook(
      "M1 - CCA",
      [null, "NOM", "PRENOMS"],
      [null, "[ 1 ]", "[ 2 ]"],
      [[null, "RASOA", "Paul"]],
    );

    const { rows } = await parsePreselectionWorkbook(buffer);
    expect(rows[0].formation).toBe("CCA");
    expect(rows[0].level).toBe("M1");
  });
});
