import crypto from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "./prisma";
import { logAction } from "./audit";

export const STUDENT_EMAIL_DOMAIN = "student.iugm.edu";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Génère un matricule lisible et unique, ex: IUGM-2026-0007
async function nextMatricule(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `IUGM-${year}-`;
  const count = await prisma.student.count({ where: { matricule: { startsWith: prefix } } });
  for (let seq = count + 1; ; seq++) {
    const candidate = `${prefix}${String(seq).padStart(4, "0")}`;
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
  fullName: string;
  program: string;
  level: string;
  department?: string | null;
  birthDate?: Date | null;
  phone?: string | null;
  personalEmail?: string | null;
};

// 1. Agent d'administration : enregistre un nouvel étudiant
export async function registerStudent(input: RegisterStudentInput, actorId: string) {
  const matricule = await nextMatricule();
  const student = await prisma.student.create({
    data: { ...input, matricule },
  });
  await logAction("STUDENT_REGISTERED", `Dossier ${matricule} créé pour ${input.fullName}`, actorId);
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
//    Le système crée automatiquement le compte étudiant (email pro + mot de passe).
export async function validatePedagoInscription(studentId: string, actorId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Dossier introuvable.");
  if (student.status === "INSCRIT") {
    throw new Error("Ce dossier est déjà inscrit.");
  }
  if (student.status !== "ADMIN_VALIDEE") {
    throw new Error("L'inscription administrative n'a pas encore été faite pour ce dossier.");
  }

  const email = await availableStudentEmail(student.fullName);
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const account = await prisma.user.create({
    data: { email, fullName: student.fullName, role: "ETUDIANT", passwordHash },
  });
  await prisma.student.update({
    where: { id: studentId },
    data: { status: "INSCRIT", accountId: account.id },
  });

  await logAction(
    "PEDAGO_INSCRIPTION_VALIDATED",
    `Inscription pédagogique validée pour ${student.fullName} (${student.matricule})`,
    actorId,
  );
  await logAction("USER_CREATED", `Compte étudiant ${email} créé automatiquement`, actorId);

  // Le mot de passe en clair n'est retourné qu'une seule fois, pour être transmis à l'étudiant
  return { student, email, password };
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

export async function searchStudents(query?: string) {
  const q = query?.trim();
  return prisma.student.findMany({
    where: q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { matricule: { contains: q, mode: "insensitive" } },
            { receiptNumber: { contains: q, mode: "insensitive" } },
            { program: { contains: q, mode: "insensitive" } },
            { department: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
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

// Liste des étudiants inscrits, filtrable par filière, département et mention
export async function listInscrits(filters: InscritsFilters = {}) {
  const q = filters.q?.trim();
  const mention = VALID_MENTIONS.includes(filters.mention as MentionValue)
    ? (filters.mention as MentionValue)
    : undefined;

  return prisma.student.findMany({
    where: {
      status: "INSCRIT",
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

// Valeurs distinctes pour alimenter les listes déroulantes de filtres
export async function getFilterOptions() {
  const rows = await prisma.student.findMany({
    where: { status: "INSCRIT" },
    select: { program: true, department: true },
    distinct: ["program", "department"],
  });
  const programs = [...new Set(rows.map((r) => r.program))].sort();
  const departments = [...new Set(rows.map((r) => r.department).filter((d): d is string => !!d))].sort();
  return { programs, departments };
}

// ---------------------------------------------------------------------------
// Export / import CSV (solution de secours en cas de panne réseau)
// ---------------------------------------------------------------------------

const CSV_HEADER = [
  "matricule",
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
        s.fullName,
        s.birthDate ? s.birthDate.toISOString().slice(0, 10) : "",
        s.phone ?? "",
        s.personalEmail ?? "",
        s.program,
        s.level,
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
  if (idx("fullName") === -1 || idx("program") === -1 || idx("level") === -1) {
    return {
      created: 0,
      updated: 0,
      errors: ["Colonnes obligatoires manquantes : fullName, program, level."],
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
      const program = get("program");
      const level = get("level");
      if (!fullName || !program || !level) {
        result.errors.push(`Ligne ${i + 1} : fullName, program et level sont obligatoires.`);
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

      const data = {
        fullName,
        program,
        level,
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
