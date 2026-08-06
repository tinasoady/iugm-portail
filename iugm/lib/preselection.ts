import ExcelJS from "exceljs";
import { Prisma, type PreselectionCategory } from "@prisma/client";

import { prisma } from "./prisma";
import { logAction } from "./audit";
import { createStudentFromExistingRecord } from "./students";
import { FORMATIONS } from "./formations";

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
//
// Format "par classe" (une feuille par niveau/filière, ex. le fichier reçu
// directement de l'IUGM) : chaque feuille nommée "L1 - PGI", "M2 - GRH"...
// porte un bandeau ministériel avant les colonnes (en-tête pas forcément en
// ligne 1) et n'a pas de colonne Niveau/Filière par ligne — ces deux valeurs
// se déduisent du nom de la feuille. parsePreselectionWorkbook et
// parseExistingRecordsFromFile (streaming, pour les gros fichiers) le
// détectent automatiquement (voir LEVEL_PREFIX_RE) ; à défaut, comportement
// historique : une seule feuille de données, en-têtes en ligne 1.
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
// Certaines variantes (ex. "DATEDELIVRABCE", "LIIEUDENAISSANCE") sont des
// coquilles observées telles quelles dans le fichier réel de l'IUGM.
const FIELD_ALIASES: Record<string, string[]> = {
  lastName: ["NOM"],
  firstName: ["PRENOM", "PRENOMS"],
  fullName: [
    "NOMETPRENOM",
    "NOMETPRENOMS",
    "NOMCOMPLET",
    "NOMPRENOM",
    "NOMPRENOMS",
    // Colonne d'aide à la saisie du modèle IUGM ("Coller ici le NOM et
    // PRENOMS de l'étudiant") : sert de repli quand NOM/PRENOMS ne sont pas
    // remplis séparément (voir la scission par espace plus bas).
    "COLLERICILENOMETPRENOMSDELETUDIANT",
  ],
  gender: ["SEXE", "GENRE"],
  birthDate: ["DATEDENAISSANCE", "DATENAISSANCE", "NE(E)LE", "NELE"],
  birthPlace: ["LIEUDENAISSANCE", "LIEUNAISSANCE", "NE(E)A", "NEA", "LIIEUDENAISSANCE"],
  nationality: ["NATIONALITE"],
  cin: ["CIN", "NCIN", "NUMEROCIN", "CARTEIDENTITENATIONALE"],
  cinIssueDate: ["DATEDELIVRANCECIN", "CINDELIVREELE", "DATEDELIVRANCE", "DATEDELIVRABCE"],
  cinIssuePlace: ["LIEUDELIVRANCECIN", "CINDELIVREEA", "LIEUDELIVRANCE", "LIEUDEDELIVRANCE"],
  phone: ["TELEPHONE", "TEL", "NUMEROTELEPHONE", "CONTACT"],
  personalEmail: ["EMAIL", "MAIL", "ADRESSEEMAIL", "ADRESSEMAIL"],
  address: ["ADRESSE", "ADRESSEEXACTE"],
  baccNumber: ["NUMEROBACC", "NBACC", "NUMERODUBACC", "NUMEROBACCALAUREAT"],
  baccSeries: ["SERIE", "SERIEBACC", "SERIEDUBACC"],
  baccMention: ["MENTIONBACC", "MENTIONAUBACC", "MENTIONDUBACC"],
  baccYear: ["ANNEEBACC", "ANNEEDOBTENTION", "ANNEEOBTENTIONBACC", "ANNEEDOBTENTIONDUBACC"],
  baccCenter: ["CENTRE", "CENTREDEXAMEN"],
  baccCountry: ["PAYS"],
  previousSchool: ["ETABLISSEMENTDORIGINE", "ETABLISSEMENT", "ECOLEDORIGINE"],
  fatherName: ["PERE", "NOMDUPERE"],
  motherName: ["MERE", "NOMDELAMERE", "NOMETPRENOMDEMERE"],
  parentsPhone: ["TELEPHONEDESPARENTS", "TELEPHONEPARENTS", "TELPARENTS"],
  parentsAddress: ["ADRESSEDESPARENTS", "ADRESSEPARENTS"],
  parentsCity: ["VILLEDESPARENTS", "VILLEPARENTS", "VILLE"],
  formation: ["FILIERE", "FILIEREAFFECTEE", "MENTIONAFFECTEE", "FORMATION", "FORMATIONAFFECTEE"],
  level: ["NIVEAU"],
};

type FieldKey = keyof typeof FIELD_ALIASES;

// Construit, pour une ligne d'en-têtes donnée, la correspondance
// "index de colonne -> champ du dossier" (une seule fois par feuille)
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

function hasUsableColumns(columns: Map<number, FieldKey>): boolean {
  const values = [...columns.values()];
  return (values.includes("lastName") && values.includes("firstName")) || values.includes("fullName");
}

// Feuille "par classe" : nom du type "L1 - PGI", "M2 - GRH"... Le niveau et
// le code de filière s'en déduisent ; le code est ensuite résolu vers le
// libellé officiel (lib/formations.ts) quand il y correspond, pour rester
// cohérent avec le reste de l'application (filtres, périmètre des
// secrétaires de formation) — sinon le code brut sert de repli.
const LEVEL_PREFIX_RE = /^([LM][1-3])\s*-\s*([A-Za-zÀ-ÖØ-öø-ÿ]+)/;

function levelAndFormationFromSheetName(name: string): { level: string | null; code: string | null } {
  const m = name.trim().match(LEVEL_PREFIX_RE);
  if (!m) return { level: null, code: null };
  return { level: m[1].toUpperCase(), code: m[2].toUpperCase() };
}

function formationLabelForCode(code: string): string {
  const known = FORMATIONS.find((f) => f.code === code);
  return known ? known.label : code;
}

// Convertit une valeur de cellule ExcelJS en date, qu'elle soit déjà un objet
// Date (colonne formatée "date" dans Excel) ou un texte "2026-08-15" / "15/08/2026".
// Un nombre brut (ex. 38577) est un numéro de série Excel — cas fréquent en
// lecture en flux (streaming), où la mise en forme "date" de la cellule
// n'est pas toujours appliquée avant que la valeur ne nous parvienne,
// contrairement au chargement complet (voir parseExistingRecordsFromFile).
function toDate(value: ExcelJS.CellValue): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    // Numéro de série Excel -> date : 25569 = écart (en jours) entre l'époque
    // Excel (1899-12-30, qui compense le faux 29 février 1900 d'Excel) et
    // l'époque Unix (1970-01-01). Formule standard, reprise de xlsx/SheetJS.
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
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

export function toText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return "";
  // Cellule "vide" formatée en flux (streaming) : ExcelJS peut renvoyer NaN
  // plutôt que null pour une cellule numérique/formule sans contenu réel —
  // fréquent sur les milliers de lignes mises en forme mais vides en bas des
  // feuilles "par classe" du fichier IUGM.
  if (typeof value === "number" && Number.isNaN(value)) return "";
  if (typeof value === "object") {
    if ("richText" in value) {
      return (value as { richText: Array<{ text?: string }> }).richText
        .map((run) => run.text ?? "")
        .join("")
        .trim();
    }
    if ("text" in value) return String((value as { text: unknown }).text ?? "").trim();
    if ("result" in value) {
      const result = (value as { result: unknown }).result;
      // `NaN ?? x` ne se déclenche pas (NaN n'est ni null ni undefined) : à
      // vérifier explicitement, sous peine de rendre "NaN" en texte (voir la
      // note plus haut — même symptôme, ici dans le résultat mis en cache
      // d'une formule plutôt que dans la valeur brute de la cellule).
      // Le résultat mis en cache peut lui-même être un objet (ex. une
      // formule dont le résultat est une erreur, `{ error: "#REF!" }") :
      // mêmes précautions que pour la valeur brute de la cellule, sous peine
      // de retomber dans "[object Object]" une couche plus loin.
      if (
        result === null ||
        result === undefined ||
        typeof result === "object" ||
        (typeof result === "number" && Number.isNaN(result))
      ) {
        return "";
      }
      return String(result).trim();
    }
    // Cellule-formule (souvent un VLOOKUP recopié sur des lignes de modèle
    // sans étudiant réel) dont le résultat n'a pas été mis en cache dans le
    // fichier : rien à en tirer, traitée comme une cellule vide plutôt que
    // de finir en "[object Object]".
    if ("formula" in value || "error" in value) return "";
    // Forme de cellule ExcelJS non reconnue (ex: cellule fusionnée, référence
    // partagée...) : impossible d'en extraire un texte fiable. Mieux vaut la
    // traiter comme vide que de stocker littéralement "[object Object]"
    // comme si c'était une vraie donnée (voir le bug historique qui a
    // corrompu des noms importés avant ce correctif).
    return "";
  }
  return String(value).trim();
}

// Texte trouvé tel quel dans le bandeau/légende des feuilles "par classe" du
// fichier IUGM (récapitulatif d'effectif, rappel des codes de redoublement) —
// jamais un vrai nom, même s'il tombe dans la colonne NOM après un décalage
// de mise en page en bas de feuille.
const NON_NAME_PATTERNS = [/^\[\s*\d+\s*\]$/, /^ARR[ÊE]T[ÉE]/i, /^N\s*\(NOUVEAU\)/i, /^R\s*\(REDOUBLANT\)/i, /^T\+?\s*\(TRIPLANT/i];

function looksLikeRealName(value: string): boolean {
  return value.length > 0 && value.toUpperCase() !== "NAN" && !NON_NAME_PATTERNS.some((re) => re.test(value));
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

// Construit une PreselectionRow à partir des valeurs de cellules déjà
// mappées aux champs (voir mapColumns) ; `sheetLevel`/`sheetFormation`
// servent de repli quand la ligne elle-même n'a pas ces colonnes (format
// "par classe" : niveau et filière déduits du nom de la feuille, voir
// levelAndFormationFromSheetName). Partagé par parsePreselectionWorkbook
// (classeurs classiques, chargement complet) et parseExistingRecordsFromFile
// (fichiers volumineux "par classe", lecture en flux).
function buildPreselectionRow(
  values: Partial<Record<FieldKey, ExcelJS.CellValue>>,
  rowLabel: string,
  sheetLevel: string | null,
  sheetFormation: string | null,
): { row: PreselectionRow } | { error: string } | { skip: true } {
  // Une date est une vraie valeur même si toText() la rend en "" (elle est
  // gérée séparément, voir birthDate/cinIssueDate plus bas) ; tout le reste
  // suit la même notion de "vide" que le texte affiché (couvre NaN, les
  // cellules-formule sans résultat mis en cache, etc. — voir toText).
  const isBlankCell = (v: ExcelJS.CellValue) => !(v instanceof Date) && toText(v) === "";
  const allEmpty = Object.values(values).every(isBlankCell);
  if (allEmpty) return { skip: true };

  let lastName = toText(values.lastName);
  let firstName = toText(values.firstName);
  if (!lastName && values.fullName) {
    const full = toText(values.fullName);
    const parts = full.split(/\s+/).filter(Boolean);
    lastName = lastName || parts[0] || "";
    firstName = firstName || parts.slice(1).join(" ") || "";
  }
  // Légende ou bandeau récapitulatif du modèle IUGM ("[ 1 ] [ 2 ] ..." sous
  // l'en-tête, "ARRÊTÉ AU NOMBRE DE:", rappel des codes de redoublement en
  // bas de feuille) : ni une ligne vide ni un vrai nom.
  if (lastName && !looksLikeRealName(lastName)) return { skip: true };

  if (!lastName) return { error: `${rowLabel} : nom obligatoire.` };

  const genderRaw = toText(values.gender);
  return {
    row: {
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
      formation: toText(values.formation) || sheetFormation,
      level: toText(values.level) || sheetLevel,
    },
  };
}

export type ParsePreselectionResult = {
  rows: PreselectionRow[];
  errors: string[];
};

// Lit le classeur Excel et transforme chaque ligne en PreselectionRow. Ne
// touche pas à la base : voir importPreselectionFile. Deux modes, détectés
// automatiquement :
//  - une ou plusieurs feuilles nommées "L1 - PGI", "M2 - GRH"... (format "par
//    classe") : chacune est lue, en-tête cherché dans ses ~20 premières
//    lignes (bandeau ministériel avant), niveau/filière déduits du nom ;
//  - sinon, comportement historique : la première feuille du classeur,
//    en-têtes en ligne 1.
export async function parsePreselectionWorkbook(buffer: Buffer): Promise<ParsePreselectionResult> {
  const workbook = new ExcelJS.Workbook();
  // Cast : exceljs référence un `Buffer` ambiant résolu via la copie de
  // @types/node imbriquée dans sa dépendance fast-csv, distincte (pour le
  // typeur) du Buffer<ArrayBufferLike> de notre propre @types/node — même
  // objet à l'exécution, seule l'identité de type diffère.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const matchingSheets = workbook.worksheets.filter((ws) => LEVEL_PREFIX_RE.test(ws.name.trim()));
  const sheetsToParse = matchingSheets.length > 0 ? matchingSheets : workbook.worksheets.slice(0, 1);

  const rows: PreselectionRow[] = [];
  const errors: string[] = [];
  let anyHeaderFound = false;

  for (const sheet of sheetsToParse) {
    if (sheet.rowCount < 2) continue;

    const maxScan = Math.min(20, sheet.rowCount);
    let headerRowNumber = -1;
    let columns: Map<number, FieldKey> = new Map();
    for (let r = 1; r <= maxScan; r++) {
      const headerCells: string[] = [];
      sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headerCells[colNumber - 1] = toText(cell.value);
      });
      const candidate = mapColumns(headerCells);
      if (hasUsableColumns(candidate)) {
        headerRowNumber = r;
        columns = candidate;
        break;
      }
    }
    if (headerRowNumber === -1) continue;
    anyHeaderFound = true;

    const { level: sheetLevel, code: sheetCode } = levelAndFormationFromSheetName(sheet.name);
    const sheetFormation = sheetCode ? formationLabelForCode(sheetCode) : null;

    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      if (row.cellCount === 0) continue;

      const values: Partial<Record<FieldKey, ExcelJS.CellValue>> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const field = columns.get(colNumber - 1);
        if (field) values[field] = cell.value;
      });

      const result = buildPreselectionRow(values, `${sheet.name} — ligne ${rowNumber}`, sheetLevel, sheetFormation);
      if ("error" in result) errors.push(result.error);
      else if ("row" in result) rows.push(result.row);
    }
  }

  if (!anyHeaderFound) {
    return {
      rows: [],
      errors: [
        "Colonnes de nom introuvables : le fichier doit contenir des colonnes « Nom » et « Prénom » (ou une colonne « Nom et prénom »).",
      ],
    };
  }

  return { rows, errors };
}

// Variante en flux (streaming), pour les fichiers "par classe" trop
// volumineux pour tenir en mémoire avec un chargement complet (voir
// parsePreselectionWorkbook) — au-delà de la limite d'upload web (10 Mo,
// voir app/admin/base-donnees/actions.ts), réservée à un import en ligne de
// commande (voir scripts/). Lit directement un fichier sur disque plutôt
// qu'un Buffer, pour ne jamais avoir la totalité du classeur en mémoire.
export async function parseExistingRecordsFromFile(filePath: string): Promise<ParsePreselectionResult> {
  const options = {
    entries: "emit",
    sharedStrings: "cache",
    styles: "cache",
    hyperlinks: "ignore",
    worksheets: "emit",
  } as const;
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, options);

  const rows: PreselectionRow[] = [];
  const errors: string[] = [];
  let anyHeaderFound = false;

  for await (const worksheetReader of reader) {
    // `.name` existe bel et bien à l'exécution (voir exceljs/lib/stream/xlsx/worksheet-reader.js)
    // mais manque des types publiés du paquet — cast ciblé, pas une vraie incertitude de type.
    const sheetName = (worksheetReader as unknown as { name: string }).name.trim();
    if (!LEVEL_PREFIX_RE.test(sheetName)) continue;

    const { level: sheetLevel, code: sheetCode } = levelAndFormationFromSheetName(sheetName);
    const sheetFormation = sheetCode ? formationLabelForCode(sheetCode) : null;

    let columns: Map<number, FieldKey> | null = null;
    let rowNumber = 0;
    let dataRows = 0;

    for await (const row of worksheetReader) {
      rowNumber++;
      if (!columns) {
        if (rowNumber > 20) break; // pas d'en-tête reconnu dans le bandeau : feuille ignorée
        const headerCells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          headerCells[colNumber - 1] = toText(cell.value);
        });
        const candidate = mapColumns(headerCells);
        if (hasUsableColumns(candidate)) {
          columns = candidate;
          anyHeaderFound = true;
        }
        continue;
      }

      dataRows++;
      // Garde-fou : très largement au-dessus d'un effectif réel de classe —
      // au-delà, il ne reste que des lignes vides mises en forme jusqu'en
      // bas de la feuille (source du poids du fichier).
      if (dataRows > 20000) break;

      const values: Partial<Record<FieldKey, ExcelJS.CellValue>> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const field = columns!.get(colNumber - 1);
        if (field) values[field] = cell.value;
      });

      const result = buildPreselectionRow(
        values,
        `${sheetName} — ligne ${rowNumber}`,
        sheetLevel,
        sheetFormation,
      );
      if ("error" in result) errors.push(result.error);
      else if ("row" in result) rows.push(result.row);
    }
  }

  if (!anyHeaderFound) {
    return {
      rows: [],
      errors: [
        "Aucune feuille reconnue : le format attendu est une feuille par niveau/filière, nommée par exemple « L1 - PGI », avec des colonnes Nom/Prénom.",
      ],
    };
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

// Enregistre en base un lot de PreselectionRow déjà extrait (voir
// parsePreselectionWorkbook / parseExistingRecordsFromFile ci-dessus) pour
// une année universitaire et une catégorie : remplace le lot précédent de
// cette année ET catégorie (les fiches déjà utilisées pour inscrire un
// étudiant sont conservées, pour ne jamais casser un dossier déjà créé) puis
// insère les nouvelles lignes. Scoper aussi par catégorie évite qu'un
// ré-import des dossiers existants n'efface la présélection de la même année
// (et vice-versa).
export async function importPreselectionRows(
  rows: PreselectionRow[],
  academicYear: string,
  actorId: string,
  category: PreselectionCategory,
  parseErrors: string[] = [],
): Promise<ImportPreselectionResult> {
  if (!/^\d{4}-\d{4}$/.test(academicYear)) {
    throw new Error("Année universitaire invalide (format attendu : 2026-2027).");
  }
  if (rows.length === 0) {
    return {
      created: 0,
      errors: parseErrors.length > 0 ? parseErrors : ["Aucune ligne exploitable dans le fichier."],
    };
  }

  const errors = [...parseErrors];

  await prisma.$transaction(
    async (tx) => {
      // Les fiches déjà liées à un dossier créé restent en base : seules les
      // fiches non utilisées de cette année et catégorie sont remplacées.
      await tx.preselectionCandidate.deleteMany({
        where: { academicYear, category, usedByStudentId: null },
      });
      await tx.preselectionCandidate.createMany({
        data: rows.map((row) => ({ ...row, academicYear, category, importedById: actorId })),
      });
    },
    { timeout: 120_000 },
  );

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
        try {
          await prisma.preselectionCandidate.update({
            where: { id: c.id },
            data: { usedByStudentId: student.id, usedAt: new Date() },
          });
        } catch (updateError) {
          // `usedByStudentId` est unique (une fiche = un dossier, voir
          // schema.prisma) : si `existing` était déjà vrai, c'est qu'une
          // AUTRE fiche (un import précédent) revendique déjà ce dossier —
          // exactement le cas d'un ré-import corrigé de la même personne. Ce
          // n'est pas une erreur : le dossier ne doit pas être dupliqué, et
          // cette fiche redondante reste simplement non liée (elle sera
          // remplacée au prochain import, ou supprimable via le bouton de
          // nettoyage — Base de données). Toute autre cause d'échec reste
          // une vraie erreur.
          const isRedundantDuplicate =
            existing &&
            updateError instanceof Prisma.PrismaClientKnownRequestError &&
            updateError.code === "P2002";
          if (!isRedundantDuplicate) throw updateError;
        }
        // Comptés seulement une fois la liaison réellement écrite (ou
        // reconnue redondante) : sinon une ligne dont l'update échoue pour
        // une autre raison se retrouverait à la fois dans le résumé de
        // succès et dans la liste d'erreurs.
        if (existing) studentsMatched++;
        else studentsCreated++;
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

// Importe le fichier Excel (classeur classique, chargement complet — voir
// parsePreselectionWorkbook) pour une année universitaire et une catégorie.
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
  return importPreselectionRows(rows, academicYear, actorId, category, errors);
}

// Nombre de fiches actuellement en base par année et par catégorie (pour
// l'écran d'import du superadmin — permet de voir d'un coup d'oeil ce qui est
// déjà chargé avant de ré-importer).
export async function getPreselectionBatchSummary() {
  // Deux comptages séparés : le total (affiché tel quel) et les fiches
  // encore non utilisées (celles qu'un éventuel nettoyage peut supprimer
  // sans jamais toucher un dossier étudiant déjà créé — voir deletePreselectionBatch).
  const [totals, unused] = await Promise.all([
    prisma.preselectionCandidate.groupBy({
      by: ["academicYear", "category"],
      _count: { _all: true },
    }),
    prisma.preselectionCandidate.groupBy({
      by: ["academicYear", "category"],
      where: { usedByStudentId: null },
      _count: { _all: true },
    }),
  ]);
  const unusedByKey = new Map(unused.map((r) => [`${r.academicYear}|${r.category}`, r._count._all]));
  return totals
    .map((r) => ({
      academicYear: r.academicYear,
      category: r.category,
      count: r._count._all,
      unusedCount: unusedByKey.get(`${r.academicYear}|${r.category}`) ?? 0,
    }))
    .sort((a, b) => b.academicYear.localeCompare(a.academicYear) || a.category.localeCompare(b.category));
}

// Supprime les fiches NON utilisées d'un lot (année + catégorie). Les fiches
// déjà reliées à un dossier étudiant (usedByStudentId non nul) sont toujours
// conservées, jamais touchées ici : supprimer un lot n'affecte donc jamais un
// dossier étudiant déjà créé, même s'il a été créé à partir d'une fiche
// corrompue (voir la note sur toText() plus haut).
export async function deletePreselectionBatch(
  academicYear: string,
  category: PreselectionCategory,
  actorId: string,
): Promise<number> {
  const { count } = await prisma.preselectionCandidate.deleteMany({
    where: { academicYear, category, usedByStudentId: null },
  });
  if (count > 0) {
    const categoryLabel = category === "EXISTING" ? "Dossiers existants" : "Présélection";
    await logAction(
      "PRESELECTION_BATCH_DELETED",
      `${categoryLabel} ${academicYear} : ${count} fiche(s) non utilisée(s) supprimée(s)`,
      actorId,
    );
  }
  return count;
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
