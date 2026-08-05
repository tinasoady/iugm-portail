import ExcelJS from "exceljs";

import type { StudentWithAccountAndResults } from "@/lib/students";
import { GENDER_LABELS, REPEAT_LABELS, STATUS_LABELS } from "@/app/ui/student-status";

// ---------------------------------------------------------------------------
// Export Excel de la liste étudiants (bouton "Exporter" sur /etudiants), au
// même modèle que le fichier officiel reçu de l'IUGM ("BASE IUGM Mahajanga") :
// bandeau ministériel, bloc d'identification (université, institution,
// domaine, mention, parcours), en-tête de colonnes en gras sur fond coloré —
// pour que le fichier téléchargé suive la même présentation que les
// documents administratifs habituels et que les agents ne s'y perdent pas.
// Ne remplace pas la vue imprimable (/etudiants/imprimer), volontairement
// laissée telle quelle.
// ---------------------------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

const COLUMN_HEADERS = [
  "Matricule",
  "Nom",
  "Prénoms",
  "Sexe",
  "Date de naissance",
  "Lieu de naissance",
  "CIN",
  "Date de délivrance CIN",
  "Lieu de délivrance CIN",
  "Nationalité",
  "Année bacc",
  "Série bacc",
  "Code de redoublement",
  "Adresse",
  "Téléphone",
  "Email",
  "Statut",
  "Date d'inscription",
] as const;

const COLUMN_WIDTHS = [14, 20, 18, 8, 14, 16, 16, 16, 16, 12, 10, 10, 18, 22, 14, 24, 22, 14];

// Couleur d'en-tête reprise de la charge graphique de l'application (bouton
// primaire, sidebar active) — cohérence visuelle entre le portail et le
// fichier téléchargé, faute de connaître la couleur exacte du modèle papier
// d'origine (non récupérable depuis le fichier source, en lecture en flux).
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 12 };
const SUBTITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 13 };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const HAIR_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "hair" },
  left: { style: "hair" },
  bottom: { style: "hair" },
  right: { style: "hair" },
};

type ClassInfo = {
  mention: string | null;
  level: string | null;
  domain: string | null;
  trainingType: string | null;
};

function addLetterhead(
  sheet: ExcelJS.Worksheet,
  settings: Record<string, string>,
  academicYear: string | null,
  info: ClassInfo,
) {
  const lastCol = COLUMN_HEADERS.length;

  const centerMergedRow = (text: string, font: Partial<ExcelJS.Font>) => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, lastCol);
    const cell = row.getCell(1);
    cell.font = font;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    return row;
  };

  centerMergedRow("MINISTÈRE DE L'ENSEIGNEMENT SUPÉRIEUR ET DE LA RECHERCHE SCIENTIFIQUE", TITLE_FONT);
  sheet.addRow([]);
  centerMergedRow(`LISTE DES ÉTUDIANTS AU TITRE DE L'ANNÉE ${academicYear ?? "—"}`, SUBTITLE_FONT);
  sheet.addRow([]);

  const infoLine = (label: string, value?: string | null) => {
    if (!value) return;
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  };

  infoLine("Université / École / Institut :", settings.institutionName);
  infoLine("Localisation :", settings.city);
  infoLine("Institution :", settings.institutionName);
  infoLine("Domaine :", info.domain);
  infoLine("Mention :", info.mention);
  infoLine("Type de formation :", info.trainingType);
  sheet.addRow([]);
}

function addHeaderRow(sheet: ExcelJS.Worksheet) {
  const row = sheet.addRow([...COLUMN_HEADERS]);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN_BORDER;
  });
  row.height = 28;
}

function addDataRow(sheet: ExcelJS.Worksheet, s: StudentWithAccountAndResults) {
  const row = sheet.addRow([
    s.matricule,
    s.lastName ?? s.fullName,
    s.firstName ?? "",
    s.gender ? (GENDER_LABELS[s.gender] ?? s.gender) : "",
    s.birthDate ? dateFmt.format(s.birthDate) : "",
    s.birthPlace ?? "",
    s.cin ?? "",
    s.cinIssueDate ? dateFmt.format(s.cinIssueDate) : "",
    s.cinIssuePlace ?? "",
    s.nationality ?? "",
    s.baccYear ?? "",
    s.baccSeries ?? "",
    s.repeatCode ? (REPEAT_LABELS[s.repeatCode] ?? s.repeatCode) : "",
    s.address ?? "",
    s.phone ?? "",
    s.personalEmail ?? s.account?.email ?? "",
    STATUS_LABELS[s.status] ?? s.status,
    dateFmt.format(s.createdAt),
  ]);
  row.eachCell((cell) => {
    cell.border = HAIR_BORDER;
    cell.alignment = { vertical: "middle" };
  });
}

// Regroupe par (niveau, filière) — même clé que l'affichage "Classer par
// Filière / Niveau" (voir group-students.ts) — pour générer une feuille par
// classe quand l'export couvre plusieurs filières/niveaux, comme le fichier
// officiel reçu de l'IUGM (une feuille par "Niveau - Filière").
function groupByClass(
  students: StudentWithAccountAndResults[],
): Array<[string, ClassInfo & { students: StudentWithAccountAndResults[] }]> {
  const map = new Map<string, ClassInfo & { students: StudentWithAccountAndResults[] }>();
  for (const s of students) {
    const mention = s.mention ?? s.program ?? null;
    const level = s.level ?? s.track ?? null;
    const key = `${level ?? "Niveau ?"} - ${mention ?? "Filière ?"}`;
    if (!map.has(key)) {
      map.set(key, { mention, level, domain: s.domain, trainingType: s.trainingType, students: [] });
    }
    map.get(key)!.students.push(s);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// Noms de feuille Excel : 31 caractères max, sans / \ ? * [ ] :
function safeSheetName(name: string): string {
  return name.replace(/[/\\?*[\]:]/g, "-").slice(0, 31) || "Feuille";
}

export async function buildStudentsExportWorkbook(
  students: StudentWithAccountAndResults[],
  settings: Record<string, string>,
  academicYear: string | null,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = settings.institutionAcronym || "IUGM";
  workbook.created = new Date();

  const groups = groupByClass(students);
  const usedNames = new Set<string>();
  const nextSheetName = (base: string) => {
    let name = safeSheetName(base);
    let suffix = 2;
    while (usedNames.has(name)) name = safeSheetName(`${base} (${suffix++})`);
    usedNames.add(name);
    return name;
  };

  if (groups.length === 0) {
    const sheet = workbook.addWorksheet(nextSheetName("Étudiants"));
    sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));
    addLetterhead(sheet, settings, academicYear, { mention: null, level: null, domain: null, trainingType: null });
    addHeaderRow(sheet);
  }

  for (const [key, group] of groups) {
    const sheet = workbook.addWorksheet(nextSheetName(key), {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });
    sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));
    addLetterhead(sheet, settings, academicYear, group);
    addHeaderRow(sheet);
    for (const s of group.students) addDataRow(sheet, s);
  }

  return workbook.xlsx.writeBuffer();
}
