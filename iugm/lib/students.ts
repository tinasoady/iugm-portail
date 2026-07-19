import crypto from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "./prisma";
import { logAction } from "./audit";

export const STUDENT_EMAIL_DOMAIN = "student.iugm.edu";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Année universitaire d'inscription par défaut : 2026 -> "2026-2027"
export function defaultEnrollmentYear(): string {
  const y = new Date().getFullYear();
  return `${y}-${y + 1}`;
}

// Génère un matricule unique au format FI2026-1, FI2026-2...
// (FI + année de début de l'année universitaire + numéro séquentiel)
async function nextMatricule(academicYear?: string): Promise<string> {
  const startYear = (academicYear ?? defaultEnrollmentYear()).split("-")[0];
  const prefix = `FI${startYear}-`;
  const count = await prisma.student.count({ where: { matricule: { startsWith: prefix } } });
  for (let seq = count + 1; ; seq++) {
    const candidate = `${prefix}${seq}`;
    const exists = await prisma.student.findUnique({ where: { matricule: candidate } });
    if (!exists) return candidate;
  }
}

// Normalise un nom pour en faire un identifiant email : "RAKOTO Jean" -> "rakoto"
function emailLocalPart(fullName: string): string {
  const base = fullName
    .trim()
    .split(/\s+/)[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return base || "etudiant";
}

// Trouve un email pro libre : rakoto@..., puis rakoto2@..., rakoto3@...
async function availableStudentEmail(fullName: string): Promise<string> {
  const local = emailLocalPart(fullName);
  for (let i = 1; ; i++) {
    const email = i === 1 ? `${local}@${STUDENT_EMAIL_DOMAIN}` : `${local}${i}@${STUDENT_EMAIL_DOMAIN}`;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (!exists) return email;
  }
}

// Mot de passe initial lisible, sans caractères ambigus (0/O, 1/l/I)
export function generatePassword(length = 10): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (const byte of crypto.randomBytes(length)) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Workflow d'inscription
// ---------------------------------------------------------------------------

export type RegisterStudentInput = {
  academicYear: string; // ex "2026-2027"
  // 1. Renseignements sur l'étudiant
  lastName: string;
  firstName: string;
  nationality: string; // Malagasy | Étranger
  gender: string; // "M" | "F"
  birthDate: Date;
  birthPlace: string;
  cin?: string | null;
  cinIssueDate?: Date | null;
  cinIssuePlace?: string | null;
  phone: string;
  personalEmail?: string | null;
  address: string;
  maritalStatus: string; // Célibataire | Marié(e) | Salarié(e)
  // 2. Renseignements sur le baccalauréat
  baccNumber: string;
  baccSeries: string;
  baccMention: string;
  baccYear: string;
  baccCenter?: string | null;
  baccCountry?: string | null;
  previousSchool?: string | null;
  previousUniversity?: string | null;
  // 3. Renseignements sur les parents + personne à contacter d'urgence
  fatherName?: string | null;
  motherName?: string | null;
  parentsPhone?: string | null;
  parentsAddress?: string | null;
  parentsCity?: string | null;
  guardianName: string; // personne à contacter d'urgence (obligatoire)
  guardianPhone: string;
  guardianAddress?: string | null;
  // 4. Inscription : formation choisie + niveau d'entrée (L1, L2, L3, M1, M2)
  mention: string;
  level: string;
  // 5. Pièces du dossier
  docResidenceCert: boolean;
  docCinCopy: boolean;
  docParentCin: boolean;
  docPhotos: boolean;
  docPinkFolder: boolean;
  docPaymentSlip: boolean;
  docEngagementLetter: boolean;
};

// 1. Agent d'administration : enregistre un nouvel étudiant (inscription administrative).
//    Le matricule FI{année}-{n} est généré automatiquement.
export async function registerStudent(input: RegisterStudentInput, actorId: string) {
  if (!/^\d{4}-\d{4}$/.test(input.academicYear)) {
    throw new Error("Année universitaire invalide (format attendu : 2026-2027).");
  }
  if (!["M", "F"].includes(input.gender)) {
    throw new Error("Sexe invalide (M ou F).");
  }
  if (!input.guardianName || !input.guardianPhone) {
    throw new Error("La personne à contacter d'urgence est obligatoire.");
  }

  const matricule = await nextMatricule(input.academicYear);
  const fullName = `${input.lastName.toUpperCase()} ${input.firstName}`;

  const student = await prisma.student.create({
    data: {
      ...input,
      matricule,
      fullName,
      // Champ hérité, alimenté pour les filtres et listes existants
      program: input.mention,
    },
  });
  await logAction(
    "STUDENT_REGISTERED",
    `Dossier ${matricule} créé pour ${fullName} (${input.academicYear}) — formation ${input.mention}`,
    actorId,
  );
  return student;
}

// 2. Agent d'administration : vérifie le reçu bancaire
export async function verifyReceipt(studentId: string, receiptNumber: string, actorId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Dossier introuvable.");
  if (student.status !== "ENREGISTRE") {
    throw new Error("Le reçu de ce dossier a déjà été vérifié.");
  }

  const updated = await prisma.student.update({
    where: { id: studentId },
    data: { receiptNumber, status: "PAIEMENT_VERIFIE" },
  });
  await logAction(
    "RECEIPT_VERIFIED",
    `Reçu ${receiptNumber} vérifié pour ${student.fullName} (${student.matricule})`,
    actorId,
  );
  return updated;
}

// 3. Agent d'administration : valide l'inscription administrative
export async function validateAdminInscription(studentId: string, actorId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Dossier introuvable.");
  if (student.status !== "PAIEMENT_VERIFIE") {
    throw new Error("Le reçu bancaire doit d'abord être vérifié.");
  }

  const updated = await prisma.student.update({
    where: { id: studentId },
    data: { status: "ADMIN_VALIDEE" },
  });
  await logAction(
    "ADMIN_INSCRIPTION_VALIDATED",
    `Inscription administrative validée pour ${student.fullName} (${student.matricule})`,
    actorId,
  );
  return updated;
}

// 4. Agent pédagogique : valide l'inscription pédagogique.
//    Première inscription : le système crée automatiquement le compte étudiant.
//    Réinscription : le compte existant est conservé (password retourné null).
export async function validatePedagoInscription(studentId: string, actorId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Dossier introuvable.");
  if (student.status === "INSCRIT") {
    throw new Error("Ce dossier est déjà inscrit.");
  }
  if (student.status !== "ADMIN_VALIDEE") {
    throw new Error("L'inscription administrative n'a pas encore été faite pour ce dossier.");
  }

  // Réinscription d'un ancien étudiant : son compte existe déjà
  if (student.accountId) {
    const account = await prisma.user.findUnique({ where: { id: student.accountId } });
    await prisma.student.update({ where: { id: studentId }, data: { status: "INSCRIT" } });
    await logAction(
      "PEDAGO_INSCRIPTION_VALIDATED",
      `Réinscription pédagogique validée pour ${student.fullName} (${student.matricule}, ${student.academicYear ?? "année inconnue"}) — compte existant conservé`,
      actorId,
    );
    return { student, email: account?.email ?? "", password: null as string | null };
  }

  const email = await availableStudentEmail(student.fullName);
  // Le mot de passe initial est le numéro d'inscription (matricule) de l'étudiant
  const password = student.matricule;
  const passwordHash = await bcrypt.hash(password, 10);

  const account = await prisma.user.create({
    // Mot de passe initial prévisible (matricule) : changement forcé à la première connexion
    data: { email, fullName: student.fullName, role: "ETUDIANT", passwordHash, mustChangePassword: true },
  });
  await prisma.student.update({
    where: { id: studentId },
    // Le mot de passe initial est conservé pour être imprimé sur le reçu d'inscription
    data: { status: "INSCRIT", accountId: account.id, initialPassword: password },
  });

  await logAction(
    "PEDAGO_INSCRIPTION_VALIDATED",
    `Inscription pédagogique validée pour ${student.fullName} (${student.matricule})`,
    actorId,
  );
  await logAction("USER_CREATED", `Compte étudiant ${email} créé automatiquement`, actorId);

  // Le mot de passe en clair n'est retourné qu'une seule fois, pour être transmis à l'étudiant
  return { student, email, password: password as string | null };
}

// ---------------------------------------------------------------------------
// Réinscription des anciens étudiants
// ---------------------------------------------------------------------------

// Réinscrit un ancien étudiant (statut INSCRIT) pour une nouvelle année :
// l'année en cours est archivée, le dossier repart au début du workflow
// (paiement à vérifier), le matricule et le compte sont conservés.
// `level` : nouveau niveau (ex : L1 -> L2).
export async function reenrollStudent(
  studentId: string,
  input: { academicYear: string; level?: string | null },
  actorId: string,
) {
  if (!/^\d{4}-\d{4}$/.test(input.academicYear)) {
    throw new Error("Année universitaire invalide (format attendu : 2027-2028).");
  }

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Dossier introuvable.");
  if (student.status !== "INSCRIT") {
    throw new Error("Seul un étudiant dont l'inscription est finalisée peut être réinscrit.");
  }
  if (student.academicYear === input.academicYear) {
    throw new Error(`Cet étudiant est déjà inscrit pour ${input.academicYear}.`);
  }
  const alreadyArchived = await prisma.enrollmentHistory.findFirst({
    where: { studentId, academicYear: input.academicYear },
  });
  if (alreadyArchived) {
    throw new Error(`Cet étudiant a déjà une inscription archivée pour ${input.academicYear}.`);
  }

  // Archive l'année qui se termine (avec le niveau suivi cette année-là)
  await prisma.enrollmentHistory.create({
    data: {
      studentId,
      academicYear: student.academicYear ?? "inconnue",
      track: student.level ?? student.track,
      status: student.status,
      receiptNumber: student.receiptNumber,
    },
  });

  // Le dossier repart au début du workflow pour la nouvelle année
  const updated = await prisma.student.update({
    where: { id: studentId },
    data: {
      academicYear: input.academicYear,
      level: input.level?.trim() || student.level,
      status: "ENREGISTRE",
      receiptNumber: null,
    },
  });

  await logAction(
    "STUDENT_REENROLLED",
    `Réinscription de ${student.fullName} (${student.matricule}) : ${student.academicYear ?? "?"} → ${input.academicYear}${input.level ? ` — niveau ${input.level}` : ""}`,
    actorId,
  );
  return updated;
}

// ---------------------------------------------------------------------------
// Résultats académiques
// ---------------------------------------------------------------------------

export type MentionValue = "ECHEC" | "PASSABLE" | "ASSEZ_BIEN" | "BIEN" | "TRES_BIEN";

// Barème standard : la mention découle mécaniquement de la moyenne
export function mentionFromAverage(average: number): MentionValue {
  if (average < 10) return "ECHEC";
  if (average < 12) return "PASSABLE";
  if (average < 14) return "ASSEZ_BIEN";
  if (average < 16) return "BIEN";
  return "TRES_BIEN";
}

export type AssignResultInput = {
  studentId: string;
  academicYear: string; // ex: "2025-2026"
  semester: string; // ex: "S1"
  average: number; // moyenne sur 20
};

// Agent pédagogique : assigne (ou remplace) le résultat d'un étudiant inscrit
export async function assignAcademicResult(input: AssignResultInput, actorId: string) {
  const { studentId, academicYear, semester, average } = input;

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Dossier introuvable.");
  if (student.status !== "INSCRIT") {
    throw new Error("Seul un étudiant inscrit peut recevoir un résultat.");
  }
  if (!Number.isFinite(average) || average < 0 || average > 20) {
    throw new Error("La moyenne doit être comprise entre 0 et 20.");
  }
  if (!/^\d{4}-\d{4}$/.test(academicYear)) {
    throw new Error("Année universitaire invalide (format attendu : 2025-2026).");
  }

  const mention = mentionFromAverage(average);
  const result = await prisma.academicResult.upsert({
    where: { studentId_academicYear_semester: { studentId, academicYear, semester } },
    update: { average, mention },
    create: { studentId, academicYear, semester, average, mention },
  });

  await logAction(
    "RESULT_ASSIGNED",
    `Résultat ${academicYear} ${semester} de ${student.fullName} (${student.matricule}) : ${average}/20 — ${mention}`,
    actorId,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Recherche et listes filtrées
// ---------------------------------------------------------------------------

// `formation` : restreint aux dossiers de cette formation (secrétaire de formation)
export async function searchStudents(query?: string, formation?: string | null) {
  const q = query?.trim();
  const conditions: object[] = [];
  if (formation) {
    conditions.push({ OR: [{ mention: formation }, { program: formation }] });
  }
  if (q) {
    conditions.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { matricule: { contains: q, mode: "insensitive" } },
        { receiptNumber: { contains: q, mode: "insensitive" } },
        { program: { contains: q, mode: "insensitive" } },
        { department: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  return prisma.student.findMany({
    where: conditions.length > 0 ? { AND: conditions } : undefined,
    orderBy: { createdAt: "desc" },
    include: { account: { select: { email: true } } },
  });
}

export type InscritsFilters = {
  q?: string;
  program?: string;
  department?: string;
  mention?: string;
};

const VALID_MENTIONS: MentionValue[] = ["ECHEC", "PASSABLE", "ASSEZ_BIEN", "BIEN", "TRES_BIEN"];

// Liste des étudiants inscrits, filtrable par filière, département et mention.
// `formation` : périmètre imposé côté serveur (secrétaire de formation).
export async function listInscrits(filters: InscritsFilters = {}, formation?: string | null) {
  const q = filters.q?.trim();
  const mention = VALID_MENTIONS.includes(filters.mention as MentionValue)
    ? (filters.mention as MentionValue)
    : undefined;

  return prisma.student.findMany({
    where: {
      status: "INSCRIT",
      ...(formation ? { AND: [{ OR: [{ mention: formation }, { program: formation }] }] } : {}),
      ...(filters.program ? { program: filters.program } : {}),
      ...(filters.department ? { department: filters.department } : {}),
      ...(mention ? { results: { some: { mention } } } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { matricule: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { fullName: "asc" },
    include: {
      account: { select: { email: true } },
      results: { orderBy: [{ academicYear: "desc" }, { semester: "desc" }] },
    },
  });
}

// ---------------------------------------------------------------------------
// Liste générale des étudiants (recherche / tri / classement par année)
// ---------------------------------------------------------------------------

const SORTABLE_FIELDS = {
  nom: "fullName",
  matricule: "matricule",
  statut: "status",
  date: "createdAt",
} as const;

export type StudentSortKey = keyof typeof SORTABLE_FIELDS;

export type StudentListParams = {
  q?: string;
  year?: string; // année universitaire, ex "2026-2027"
  filiere?: string; // formation / mention
  niveau?: string; // L1, L2, L3, M1, M2
  sort?: string;
  dir?: string; // asc | desc
};

// `formation` : périmètre imposé côté serveur (secrétaire de formation)
export async function listStudents(params: StudentListParams = {}, formation?: string | null) {
  const q = params.q?.trim();
  const sortField = SORTABLE_FIELDS[(params.sort as StudentSortKey) ?? "nom"] ?? "fullName";
  const dir = params.dir === "desc" ? "desc" : "asc";

  // Conditions cumulées (AND) : chaque filtre peut contenir son propre OR
  const conditions: object[] = [];
  if (formation) {
    conditions.push({ OR: [{ mention: formation }, { program: formation }] });
  }
  if (params.year) conditions.push({ academicYear: params.year });
  if (params.filiere) {
    conditions.push({ OR: [{ mention: params.filiere }, { program: params.filiere }] });
  }
  if (params.niveau) {
    conditions.push({ OR: [{ level: params.niveau }, { track: params.niveau }] });
  }
  if (q) {
    conditions.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { matricule: { contains: q, mode: "insensitive" } },
        { cin: { contains: q, mode: "insensitive" } },
        { program: { contains: q, mode: "insensitive" } },
        { track: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return prisma.student.findMany({
    where: conditions.length > 0 ? { AND: conditions } : {},
    orderBy: { [sortField]: dir },
    include: {
      account: { select: { email: true } },
      // Nécessaire pour le classement par mention (dernier résultat en premier)
      results: { orderBy: [{ academicYear: "desc" }, { semester: "desc" }] },
    },
  });
}

// Valeurs distinctes pour les sélecteurs de filtres de la liste étudiants
export async function getStudentFilterValues() {
  const rows = await prisma.student.findMany({
    select: { mention: true, program: true, level: true },
  });
  const filieres = [
    ...new Set(rows.map((r) => r.mention ?? r.program).filter((f): f is string => !!f)),
  ].sort();
  const niveaux = [...new Set(rows.map((r) => r.level).filter((l): l is string => !!l))].sort();
  return { filieres, niveaux };
}

// Dossier complet d'un étudiant pour sa page de profil
export async function getStudentProfile(studentId: string) {
  return prisma.student.findUnique({
    where: { id: studentId },
    include: {
      account: { select: { email: true, createdAt: true } },
      results: { orderBy: [{ academicYear: "desc" }, { semester: "desc" }] },
      enrollmentHistory: { orderBy: { archivedAt: "desc" } },
    },
  });
}

// Années universitaires présentes en base, la plus récente en premier
export async function getAcademicYears(): Promise<string[]> {
  const rows = await prisma.student.findMany({
    where: { academicYear: { not: null } },
    select: { academicYear: true },
    distinct: ["academicYear"],
  });
  return rows
    .map((r) => r.academicYear)
    .filter((y): y is string => !!y)
    .sort()
    .reverse();
}

// Supprime définitivement un dossier étudiant, ses résultats (cascade)
// et son compte de connexion s'il existe
export async function deleteStudent(studentId: string, actorId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Dossier introuvable.");

  await prisma.student.delete({ where: { id: studentId } });
  if (student.accountId) {
    await prisma.user.delete({ where: { id: student.accountId } }).catch(() => {
      // compte déjà supprimé : sans incidence
    });
  }

  await logAction(
    "STUDENT_DELETED",
    `Dossier ${student.matricule} (${student.fullName}) supprimé${student.accountId ? ", compte de connexion inclus" : ""}`,
    actorId,
  );
  return student;
}

// ---------------------------------------------------------------------------
// Gestion de l'écolage
// ---------------------------------------------------------------------------

// Un dossier est considéré payé dès que le reçu bancaire a été vérifié
// (statut au-delà de ENREGISTRE)
export type EcolageStats = {
  total: number;
  paid: number;
  unpaid: number;
  byFormation: Array<{ formation: string; paid: number; total: number }>;
};

export async function getEcolageStats(year?: string): Promise<EcolageStats> {
  const students = await prisma.student.findMany({
    where: year ? { academicYear: year } : {},
    select: { status: true, mention: true, program: true },
  });

  const stats: EcolageStats = { total: students.length, paid: 0, unpaid: 0, byFormation: [] };
  const formations = new Map<string, { paid: number; total: number }>();

  for (const s of students) {
    const isPaid = s.status !== "ENREGISTRE";
    if (isPaid) stats.paid++;
    else stats.unpaid++;

    const formation = s.mention ?? s.program ?? "Formation non renseignée";
    if (!formations.has(formation)) formations.set(formation, { paid: 0, total: 0 });
    const f = formations.get(formation)!;
    f.total++;
    if (isPaid) f.paid++;
  }

  stats.byFormation = [...formations.entries()]
    .map(([formation, f]) => ({ formation, ...f }))
    .sort((a, b) => b.total - a.total);
  return stats;
}

// Dossiers dont l'écolage n'est pas encore payé (pour relance)
export async function listUnpaidStudents(year?: string) {
  return prisma.student.findMany({
    where: { status: "ENREGISTRE", ...(year ? { academicYear: year } : {}) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      matricule: true,
      fullName: true,
      phone: true,
      guardianPhone: true,
      mention: true,
      program: true,
      academicYear: true,
      createdAt: true,
    },
  });
}

// Valeurs distinctes pour alimenter les listes déroulantes de filtres
export async function getFilterOptions() {
  const rows = await prisma.student.findMany({
    where: { status: "INSCRIT" },
    select: { program: true, department: true },
    distinct: ["program", "department"],
  });
  const programs = [...new Set(rows.map((r) => r.program).filter((p): p is string => !!p))].sort();
  const departments = [...new Set(rows.map((r) => r.department).filter((d): d is string => !!d))].sort();
  return { programs, departments };
}

// ---------------------------------------------------------------------------
// Export / import CSV (solution de secours en cas de panne réseau)
// ---------------------------------------------------------------------------

const CSV_HEADER = [
  "matricule",
  "academicYear",
  "fullName",
  "birthDate",
  "phone",
  "personalEmail",
  "program",
  "level",
  "department",
  "receiptNumber",
  "status",
] as const;

const VALID_STATUSES = ["ENREGISTRE", "PAIEMENT_VERIFIE", "ADMIN_VALIDEE", "INSCRIT"] as const;
type StatusValue = (typeof VALID_STATUSES)[number];

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function exportStudentsCsv(actorId: string): Promise<string> {
  const students = await prisma.student.findMany({ orderBy: { matricule: "asc" } });
  const lines = [CSV_HEADER.join(",")];
  for (const s of students) {
    lines.push(
      [
        s.matricule,
        s.academicYear ?? "",
        s.fullName,
        s.birthDate ? s.birthDate.toISOString().slice(0, 10) : "",
        s.phone ?? "",
        s.personalEmail ?? "",
        s.program ?? "",
        s.level ?? "",
        s.department ?? "",
        s.receiptNumber ?? "",
        s.status,
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }
  await logAction("CSV_EXPORTED", `${students.length} dossier(s) exporté(s)`, actorId);
  return lines.join("\r\n");
}

// Découpe une ligne CSV en respectant les guillemets
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export type ImportResult = { created: number; updated: number; errors: string[] };

// Importe un CSV au même format que l'export. La clé d'identification est le matricule :
// - matricule connu -> mise à jour du dossier
// - matricule vide ou inconnu -> création (matricule généré si absent)
// L'import ne crée jamais de compte de connexion.
export async function importStudentsCsv(csv: string, actorId: string): Promise<ImportResult> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { created: 0, updated: 0, errors: ["Fichier vide ou sans ligne de données."] };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  if (idx("fullName") === -1) {
    return {
      created: 0,
      updated: 0,
      errors: ["Colonne obligatoire manquante : fullName."],
    };
  }

  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const get = (name: string) => {
      const j = idx(name);
      return j === -1 ? "" : (fields[j] ?? "").trim();
    };

    try {
      const fullName = get("fullName");
      if (!fullName) {
        result.errors.push(`Ligne ${i + 1} : fullName est obligatoire.`);
        continue;
      }

      const statusRaw = get("status");
      const status = VALID_STATUSES.includes(statusRaw as StatusValue)
        ? (statusRaw as StatusValue)
        : undefined;
      const birthDateRaw = get("birthDate");
      const birthDate = birthDateRaw ? new Date(birthDateRaw) : null;
      if (birthDate && Number.isNaN(birthDate.getTime())) {
        result.errors.push(`Ligne ${i + 1} : date de naissance invalide (${birthDateRaw}).`);
        continue;
      }

      const academicYearRaw = get("academicYear");
      const data = {
        fullName,
        academicYear: /^\d{4}-\d{4}$/.test(academicYearRaw) ? academicYearRaw : null,
        program: get("program") || null,
        level: get("level") || null,
        department: get("department") || null,
        birthDate,
        phone: get("phone") || null,
        personalEmail: get("personalEmail") || null,
        receiptNumber: get("receiptNumber") || null,
        ...(status ? { status } : {}),
      };

      const matricule = get("matricule");
      const existing = matricule
        ? await prisma.student.findUnique({ where: { matricule } })
        : null;

      if (existing) {
        await prisma.student.update({ where: { matricule }, data });
        result.updated++;
      } else {
        await prisma.student.create({
          data: { ...data, matricule: matricule || (await nextMatricule()) },
        });
        result.created++;
      }
    } catch (e) {
      result.errors.push(`Ligne ${i + 1} : ${e instanceof Error ? e.message : "erreur inconnue"}.`);
    }
  }

  await logAction(
    "CSV_IMPORTED",
    `Import CSV : ${result.created} créé(s), ${result.updated} mis à jour, ${result.errors.length} erreur(s)`,
    actorId,
  );
  return result;
}
