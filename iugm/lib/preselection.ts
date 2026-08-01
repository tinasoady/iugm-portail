import ExcelJS from "exceljs";
import type { PreselectionCategory } from "@prisma/client";

import { prisma } from "./prisma";
import { logAction } from "./audit";
import { createStudentFromExistingRecord } from "./students";

// ---------------------------------------------------------------------------
// Base de données : fiches importées en lot pour pré-remplir l'inscription
//
// Deux origines possibles (voir PreselectionCategory dans le schéma) :
//  - PRESELECTION : résultats de présélection des nouveaux L1, envoyés par
//    l'Université de Mahajanga sous forme de fichier Excel.
//  - EXISTING : dossiers d'étudiants déjà sur place à l'université (tout
//    niveau, L1 à M2) mais pas encore saisis dans ce portail — pour éviter de
//    ressaisir entièrement leurs informations le jour de leur inscription et
//    limiter la file d'attente.
// Le superadmin importe le fichier ici (voir importPreselectionFile) : chaque
// ligne devient une PreselectionCandidate, utilisée uniquement pour
// pré-remplir le formulaire d'inscription (recherche par nom, voir
// searchPreselectionCandidates) — la création du dossier étudiant lui-même
// reste toujours registerStudent (lib/students.ts), l'agent vérifie les
// pièces et valide comme d'habitude.
// ---------------------------------------------------------------------------

// Normalise un texte pour comparer des en-têtes de colonnes sans se soucier
// des accents, de la casse ni de la ponctuation : "N° CIN", "Numéro CIN" et
// "cin" désignent tous la même colonne une fois normalisés.
function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Alias acceptés (déjà normalisés) pour chaque champ du dossier — le fichier
// reçu de Mahajanga peut nommer ses colonnes différemment d'une année à
// l'autre, d'où une liste large plutôt qu'un unique nom de colonne attendu.
const FIELD_ALIASES: Record<string, string[]> = {
  lastName: ["NOM"],
  firstName: ["PRENOM", "PRENOMS"],
  fullName: ["NOMETPRENOM", "NOMETPRENOMS", "NOMCOMPLET", "NOMPRENOM", "NOMPRENOMS"],
  gender: ["SEXE", "GENRE"],
  birthDate: ["DATEDENAISSANCE", "DATENAISSANCE", "NE(E)LE", "NELE"],
  birthPlace: ["LIEUDENAISSANCE", "LIEUNAISSANCE", "NE(E)A", "NEA"],
  nationality: ["NATIONALITE"],
  cin: ["CIN", "NCIN", "NUMEROCIN", "CARTEIDENTITENATIONALE"],
  cinIssueDate: ["DATEDELIVRANCECIN", "CINDELIVREELE", "DATEDELIVRANCE"],
  cinIssuePlace: ["LIEUDELIVRANCECIN", "CINDELIVREEA", "LIEUDELIVRANCE"],
  phone: ["TELEPHONE", "TEL", "NUMEROTELEPHONE", "CONTACT"],
  personalEmail: ["EMAIL", "MAIL", "ADRESSEEMAIL"],
  address: ["ADRESSE", "ADRESSEEXACTE"],
  baccNumber: ["NUMEROBACC", "NBACC", "NUMERODUBACC", "NUMEROBACCALAUREAT"],
  baccSeries: ["SERIE", "SERIEBACC", "SERIEDUBACC"],
  baccMention: ["MENTIONBACC", "MENTIONAUBACC", "MENTIONDUBACC"],
  baccYear: ["ANNEEBACC", "ANNEEDOBTENTION", "ANNEEOBTENTIONBACC"],
  baccCenter: ["CENTRE", "CENTREDEXAMEN"],
  baccCountry: ["PAYS"],
  previousSchool: ["ETABLISSEMENTDORIGINE", "ETABLISSEMENT", "ECOLEDORIGINE"],
  fatherName: ["PERE", "NOMDUPERE"],
  motherName: ["MERE", "NOMDELAMERE"],
  parentsPhone: ["TELEPHONEDESPARENTS", "TELEPHONEPARENTS", "TELPARENTS"],
  parentsAddress: ["ADRESSEDESPARENTS", "ADRESSEPARENTS"],
  parentsCity: ["VILLEDESPARENTS", "VILLEPARENTS", "VILLE"],
  formation: ["FILIERE", "FILIEREAFFECTEE", "MENTIONAFFECTEE", "FORMATION", "FORMATIONAFFECTEE"],
  level: ["NIVEAU"],
};

type FieldKey = keyof typeof FIELD_ALIASES;

// Construit, pour une ligne d'en-têtes donnée, la correspondance
// "index de colonne -> champ du dossier" (une seule fois par import)
function mapColumns(headerCells: string[]): Map<number, FieldKey> {
  const columns = new Map<number, FieldKey>();
  headerCells.forEach((raw, i) => {
    if (!raw) return;
    const normalized = normalizeHeader(raw);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(normalized)) {
        columns.set(i, field as FieldKey);
        break;
      }
    }
  });
  return columns;
}

// Convertit une valeur de cellule ExcelJS en date, qu'elle soit déjà un objet
// Date (colonne formatée "date" dans Excel) ou un texte "2026-08-15" / "15/08/2026"
function toDate(value: ExcelJS.CellValue): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    const isoLike = new Date(trimmed);
    if (!Number.isNaN(isoLike.getTime())) return isoLike;
    // Format jour/mois/année, courant dans les fichiers malgaches
    const m = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function toText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return "";
  if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text ?? "").trim();
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "").trim();
  return String(value).trim();
}

const GENDER_ALIASES: Record<string, string> = {
  M: "M",
  MASCULIN: "M",
  HOMME: "M",
  H: "M",
  F: "F",
  FEMININ: "F",
  FÉMININ: "F",
  FEMME: "F",
};

function toGender(value: string): string | null {
  return GENDER_ALIASES[value.trim().toUpperCase()] ?? null;
}

export type PreselectionRow = {
  lastName: string;
  firstName: string;
  fullName: string;
  gender: string | null;
  birthDate: Date | null;
  birthPlace: string | null;
  nationality: string | null;
  cin: string | null;
  cinIssueDate: Date | null;
  cinIssuePlace: string | null;
  phone: string | null;
  personalEmail: string | null;
  address: string | null;
  baccNumber: string | null;
  baccSeries: string | null;
  baccMention: string | null;
  baccYear: string | null;
  baccCenter: string | null;
  baccCountry: string | null;
  previousSchool: string | null;
  fatherName: string | null;
  motherName: string | null;
  parentsPhone: string | null;
  parentsAddress: string | null;
  parentsCity: string | null;
  formation: string | null;
  level: string | null;
};

export type ParsePreselectionResult = {
  rows: PreselectionRow[];
  errors: string[];
};

// Lit le classeur Excel (1ère feuille) et transforme chaque ligne en
// PreselectionRow. Ne touche pas à la base : voir importPreselectionFile.
export async function parsePreselectionWorkbook(buffer: Buffer): Promise<ParsePreselectionResult> {
  const workbook = new ExcelJS.Workbook();
  // Cast : exceljs référence un `Buffer` ambiant résolu via la copie de
  // @types/node imbriquée dans sa dépendance fast-csv, distincte (pour le
  // typeur) du Buffer<ArrayBufferLike> de notre propre @types/node — même
  // objet à l'exécution, seule l'identité de type diffère.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    return { rows: [], errors: ["Feuille vide ou sans ligne de données."] };
  }

  const headerRow = sheet.getRow(1);
  const headerCells: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headerCells[colNumber - 1] = toText(cell.value);
  });
  const columns = mapColumns(headerCells);

  const hasNameColumns =
    [...columns.values()].includes("lastName") && [...columns.values()].includes("firstName");
  const hasFullNameColumn = [...columns.values()].includes("fullName");
  if (!hasNameColumns && !hasFullNameColumn) {
    return {
      rows: [],
      errors: [
        "Colonnes de nom introuvables : le fichier doit contenir des colonnes « Nom » et « Prénom » (ou une colonne « Nom et prénom »).",
      ],
    };
  }

  const rows: PreselectionRow[] = [];
  const errors: string[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const values: Partial<Record<FieldKey, ExcelJS.CellValue>> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const field = columns.get(colNumber - 1);
      if (field) values[field] = cell.value;
    });

    const allEmpty = Object.values(values).every((v) => v === null || v === undefined || v === "");
    if (allEmpty) continue;

    let lastName = toText(values.lastName);
    let firstName = toText(values.firstName);
    if (!lastName && values.fullName) {
      const full = toText(values.fullName);
      const parts = full.split(/\s+/).filter(Boolean);
      lastName = lastName || parts[0] || "";
      firstName = firstName || parts.slice(1).join(" ") || "";
    }
    // Le prénom seul peut manquer (courant à Madagascar) : seul le nom est
    // vraiment obligatoire pour identifier la ligne.
    if (!lastName) {
      errors.push(`Ligne ${rowNumber} : nom obligatoire.`);
      continue;
    }

    const genderRaw = toText(values.gender);
    rows.push({
      lastName,
      firstName,
      fullName: `${lastName.toUpperCase()} ${firstName}`.trim(),
      gender: genderRaw ? toGender(genderRaw) : null,
      birthDate: values.birthDate !== undefined ? toDate(values.birthDate) : null,
      birthPlace: toText(values.birthPlace) || null,
      nationality: toText(values.nationality) || null,
      cin: toText(values.cin) || null,
      cinIssueDate: values.cinIssueDate !== undefined ? toDate(values.cinIssueDate) : null,
      cinIssuePlace: toText(values.cinIssuePlace) || null,
      phone: toText(values.phone) || null,
      personalEmail: toText(values.personalEmail) || null,
      address: toText(values.address) || null,
      baccNumber: toText(values.baccNumber) || null,
      baccSeries: toText(values.baccSeries) || null,
      baccMention: toText(values.baccMention) || null,
      baccYear: toText(values.baccYear) || null,
      baccCenter: toText(values.baccCenter) || null,
      baccCountry: toText(values.baccCountry) || null,
      previousSchool: toText(values.previousSchool) || null,
      fatherName: toText(values.fatherName) || null,
      motherName: toText(values.motherName) || null,
      parentsPhone: toText(values.parentsPhone) || null,
      parentsAddress: toText(values.parentsAddress) || null,
      parentsCity: toText(values.parentsCity) || null,
      formation: toText(values.formation) || null,
      level: toText(values.level) || null,
    });
  }

  return { rows, errors };
}

export type ImportPreselectionResult = {
  created: number;
  errors: string[];
  // Uniquement pour la catégorie "dossiers existants" (voir plus bas) : ces
  // fiches deviennent directement des dossiers "Enregistré", pas seulement
  // des candidats en attente de recherche.
  studentsCreated?: number;
  studentsMatched?: number;
};

// Importe le fichier Excel pour une année universitaire et une catégorie
// (présélection ou dossiers existants) : remplace le lot précédent de cette
// année ET catégorie (les fiches déjà utilisées pour inscrire un étudiant
// sont conservées, pour ne jamais casser un dossier déjà créé) puis insère
// les nouvelles lignes. Scoper aussi par catégorie évite qu'un ré-import des
// dossiers existants n'efface la présélection de la même année (et vice-versa).
export async function importPreselectionFile(
  buffer: Buffer,
  academicYear: string,
  actorId: string,
  category: PreselectionCategory = "PRESELECTION",
): Promise<ImportPreselectionResult> {
  if (!/^\d{4}-\d{4}$/.test(academicYear)) {
    throw new Error("Année universitaire invalide (format attendu : 2026-2027).");
  }

  const { rows, errors } = await parsePreselectionWorkbook(buffer);
  if (rows.length === 0) {
    return { created: 0, errors: errors.length > 0 ? errors : ["Aucune ligne exploitable dans le fichier."] };
  }

  await prisma.$transaction(async (tx) => {
    // Les fiches déjà liées à un dossier créé restent en base : seules les
    // fiches non utilisées de cette année et catégorie sont remplacées.
    await tx.preselectionCandidate.deleteMany({
      where: { academicYear, category, usedByStudentId: null },
    });
    await tx.preselectionCandidate.createMany({
      data: rows.map((row) => ({ ...row, academicYear, category, importedById: actorId })),
    });
  });

  // "Dossiers existants" : ces personnes sont déjà à l'université, pas
  // besoin de repasser par le guichet d'inscription — chaque fiche devient
  // directement un dossier "Enregistré" (createStudentFromExistingRecord),
  // visible tout de suite dans "Dossiers étudiants" pour que l'agent
  // complète les infos manquantes, vérifie l'écolage, valide et crée le
  // compte, comme pour n'importe quel dossier. Un nom déjà présent pour
  // cette année est relié au dossier existant plutôt que dupliqué, pour
  // qu'un ré-import (fichier corrigé) ne crée pas deux fois le même dossier.
  let studentsCreated = 0;
  let studentsMatched = 0;
  if (category === "EXISTING") {
    const pending = await prisma.preselectionCandidate.findMany({
      where: { academicYear, category, usedByStudentId: null },
    });
    for (const c of pending) {
      try {
        const existing = await prisma.student.findFirst({
          where: { academicYear, fullName: { equals: c.fullName, mode: "insensitive" } },
        });
        const student =
          existing ??
          (await createStudentFromExistingRecord(
            {
              academicYear,
              lastName: c.lastName,
              firstName: c.firstName,
              nationality: c.nationality,
              gender: c.gender,
              birthDate: c.birthDate,
              birthPlace: c.birthPlace,
              cin: c.cin,
              cinIssueDate: c.cinIssueDate,
              cinIssuePlace: c.cinIssuePlace,
              phone: c.phone,
              personalEmail: c.personalEmail,
              address: c.address,
              baccNumber: c.baccNumber,
              baccSeries: c.baccSeries,
              baccMention: c.baccMention,
              baccYear: c.baccYear,
              baccCenter: c.baccCenter,
              baccCountry: c.baccCountry,
              previousSchool: c.previousSchool,
              fatherName: c.fatherName,
              motherName: c.motherName,
              parentsPhone: c.parentsPhone,
              parentsAddress: c.parentsAddress,
              parentsCity: c.parentsCity,
              mention: c.formation,
              level: c.level,
            },
            actorId,
          ));
        if (existing) studentsMatched++;
        else studentsCreated++;
        await prisma.preselectionCandidate.update({
          where: { id: c.id },
          data: { usedByStudentId: student.id, usedAt: new Date() },
        });
      } catch (e) {
        errors.push(
          `${c.fullName} : dossier non créé (${e instanceof Error ? e.message : "erreur inconnue"}).`,
        );
      }
    }
  }

  const categoryLabel = category === "EXISTING" ? "Dossiers existants" : "Présélection";
  const studentsNote =
    category === "EXISTING"
      ? `, ${studentsCreated} dossier(s) créé(s)${studentsMatched ? `, ${studentsMatched} déjà existant(s) relié(s)` : ""}`
      : "";
  await logAction(
    "PRESELECTION_IMPORTED",
    `${categoryLabel} importée pour ${academicYear} : ${rows.length} candidat(s)${studentsNote}${errors.length ? `, ${errors.length} ligne(s) ignorée(s)` : ""}`,
    actorId,
  );

  return { created: rows.length, errors, studentsCreated, studentsMatched };
}

// Nombre de fiches actuellement en base par année et par catégorie (pour
// l'écran d'import du superadmin — permet de voir d'un coup d'oeil ce qui est
// déjà chargé avant de ré-importer).
export async function getPreselectionBatchSummary() {
  const rows = await prisma.preselectionCandidate.groupBy({
    by: ["academicYear", "category"],
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ academicYear: r.academicYear, category: r.category, count: r._count._all }))
    .sort((a, b) => b.academicYear.localeCompare(a.academicYear) || a.category.localeCompare(b.category));
}

export type PreselectionSearchResult = {
  id: string;
  fullName: string;
  academicYear: string;
  category: PreselectionCategory;
  cin: string | null;
  baccNumber: string | null;
  formation: string | null;
  level: string | null;
  used: boolean;
  usedMatricule: string | null;
};

// Recherche par nom pour la barre de recherche du formulaire d'inscription.
// Résultats triés : candidats pas encore utilisés d'abord, puis par nom.
export async function searchPreselectionCandidates(
  query: string,
  limit = 8,
): Promise<PreselectionSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await prisma.preselectionCandidate.findMany({
    where: { fullName: { contains: q, mode: "insensitive" } },
    select: {
      id: true,
      fullName: true,
      academicYear: true,
      category: true,
      cin: true,
      baccNumber: true,
      formation: true,
      level: true,
      usedByStudentId: true,
      usedByStudent: { select: { matricule: true } },
    },
    take: 30,
  });

  rows.sort((a, b) => {
    if (!!a.usedByStudentId !== !!b.usedByStudentId) return a.usedByStudentId ? 1 : -1;
    return a.fullName.localeCompare(b.fullName);
  });

  return rows.slice(0, limit).map((r) => ({
    id: r.id,
    fullName: r.fullName,
    academicYear: r.academicYear,
    category: r.category,
    cin: r.cin,
    baccNumber: r.baccNumber,
    formation: r.formation,
    level: r.level,
    used: !!r.usedByStudentId,
    usedMatricule: r.usedByStudent?.matricule ?? null,
  }));
}

// Fiche complète d'un candidat présélectionné, pour pré-remplir le formulaire
// d'inscription une fois choisi dans la recherche.
export async function getPreselectionCandidate(id: string) {
  return prisma.preselectionCandidate.findUnique({ where: { id } });
}

// Marque une fiche de présélection comme utilisée par le dossier venant
// d'être créé — appelée juste après registerStudent (voir actions.ts). Une
// fiche déjà utilisée ne peut pas resservir : l'agent doit alors passer par
// « Inscrire un étudiant » (saisie manuelle) pour un cas particulier.
export async function markPreselectionUsed(id: string, studentId: string, actorId: string) {
  const { count } = await prisma.preselectionCandidate.updateMany({
    where: { id, usedByStudentId: null },
    data: { usedByStudentId: studentId, usedAt: new Date() },
  });
  if (count === 0) return; // déjà utilisée entre-temps (ou id invalide) : sans conséquence sur l'inscription elle-même
  await logAction("PRESELECTION_USED", `Fiche de présélection ${id} liée au dossier ${studentId}`, actorId);
}
