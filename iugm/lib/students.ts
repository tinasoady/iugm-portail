import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { logAction } from "./audit";
import {
  getLevelFinancialInfoOne,
  getLevelFinancialInfos,
  registrationMinimum,
  annualTuition,
  FOREIGN_NATIONALITY,
} from "./finance";

export const STUDENT_EMAIL_DOMAIN = "student.iugm.edu";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Année universitaire d'inscription par défaut : 2026 -> "2026-2027"
export function defaultEnrollmentYear(): string {
  const y = new Date().getFullYear();
  return `${y}-${y + 1}`;
}

// Vrai si l'erreur est un conflit d'unicité sur la colonne matricule.
// Avec l'adaptateur pg de Prisma 7, `meta.target` (nom de colonne) n'est pas
// toujours renseigné de façon fiable : le code P2002 suffit ici, puisque
// `matricule` est le seul champ unique fourni à la création du Student.
function isMatriculeConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// Crée un enregistrement dont le matricule est généré séquentiellement
// (FI + année de début de l'année universitaire + numéro), en réessayant avec
// le numéro suivant en cas de conflit : deux inscriptions lancées en même
// temps ne peuvent plus se disputer le même matricule (la contrainte unique
// de la base est l'arbitre final, pas le compteur lu en mémoire).
async function createWithGeneratedMatricule<T>(
  academicYear: string | undefined,
  create: (matricule: string) => Promise<T>,
): Promise<T> {
  const startYear = (academicYear ?? defaultEnrollmentYear()).split("-")[0];
  const prefix = `FI${startYear}-`;
  const startSeq =
    (await prisma.student.count({ where: { matricule: { startsWith: prefix } } })) + 1;

  const maxAttempts = 20;
  for (let seq = startSeq; seq < startSeq + maxAttempts; seq++) {
    try {
      return await create(`${prefix}${seq}`);
    } catch (e) {
      if (!isMatriculeConflict(e)) throw e;
      // Un autre agent vient de prendre ce numéro : on retente avec le suivant
    }
  }
  throw new Error("Impossible de générer un matricule unique après plusieurs tentatives, réessayez.");
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

// Mot de passe initial d'un étudiant : matricule + suffixe aléatoire.
// Le matricule seul est prévisible (numéroté séquentiellement et déjà affiché
// partout en clair) ; y accoler un suffixe aléatoire garde le mot de passe
// facile à imprimer/communiquer tout en le rendant impossible à deviner à
// partir du seul matricule public. Reste soumis au changement obligatoire à
// la première connexion.
export function generateInitialPassword(matricule: string): string {
  return `${matricule}-${generatePassword(5)}`;
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

  // .trim() : certaines personnes n'ont pas de prénom (courant à Madagascar,
  // le prénom n'est plus obligatoire à l'inscription) — sans quoi un prénom
  // vide laisserait un espace final dans le nom affiché.
  const fullName = `${input.lastName.toUpperCase()} ${input.firstName}`.trim();

  const student = await createWithGeneratedMatricule(input.academicYear, (matricule) =>
    prisma.student.create({
      data: {
        ...input,
        matricule,
        fullName,
        // Champ hérité, alimenté pour les filtres et listes existants
        program: input.mention,
        // Un dossier fraîchement créé est par définition un nouvel étudiant
        // (un redoublant a déjà un dossier existant réutilisé via reenrollStudent)
        repeatCode: "N",
      },
    }),
  );
  await logAction(
    "STUDENT_REGISTERED",
    `Dossier ${student.matricule} créé pour ${fullName} (${input.academicYear}) — formation ${input.mention}`,
    actorId,
  );
  return student;
}

// Champs d'un dossier d'étudiant déjà présent à l'université (import "Dossiers
// existants", voir lib/preselection.ts) : contrairement à RegisterStudentInput
// (saisie au guichet, dossier toujours complet), ces données viennent d'un
// fichier externe potentiellement incomplet — seuls le nom et l'année sont
// exigés, le reste se complète ensuite via la fiche de modification comme
// pour n'importe quel dossier.
export type ExistingStudentInput = {
  academicYear: string;
  lastName: string;
  firstName?: string | null;
  nationality?: string | null;
  gender?: string | null;
  birthDate?: Date | null;
  birthPlace?: string | null;
  cin?: string | null;
  cinIssueDate?: Date | null;
  cinIssuePlace?: string | null;
  phone?: string | null;
  personalEmail?: string | null;
  address?: string | null;
  maritalStatus?: string | null;
  baccNumber?: string | null;
  baccSeries?: string | null;
  baccMention?: string | null;
  baccYear?: string | null;
  baccCenter?: string | null;
  baccCountry?: string | null;
  previousSchool?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
  parentsPhone?: string | null;
  parentsAddress?: string | null;
  parentsCity?: string | null;
  mention?: string | null; // formation
  level?: string | null;
};

// Crée directement un dossier "Enregistré" à partir d'une fiche déjà
// existante à l'université (import en lot par le superadmin) : l'étudiant
// n'a pas besoin de repasser par le guichet d'inscription, son dossier
// apparaît tout de suite dans "Dossiers étudiants" pour que l'agent complète
// les infos manquantes, vérifie l'écolage, valide et crée le compte —
// exactement les mêmes démarches qu'après une inscription classique.
export async function createStudentFromExistingRecord(input: ExistingStudentInput, actorId: string) {
  if (!/^\d{4}-\d{4}$/.test(input.academicYear)) {
    throw new Error("Année universitaire invalide (format attendu : 2026-2027).");
  }
  if (!input.lastName.trim()) {
    throw new Error("Nom obligatoire.");
  }
  const gender = input.gender && ["M", "F"].includes(input.gender) ? input.gender : null;
  const fullName = `${input.lastName.toUpperCase()} ${input.firstName ?? ""}`.trim();

  const student = await createWithGeneratedMatricule(input.academicYear, (matricule) =>
    prisma.student.create({
      data: {
        academicYear: input.academicYear,
        matricule,
        fullName,
        lastName: input.lastName,
        firstName: input.firstName || null,
        nationality: input.nationality || null,
        gender,
        birthDate: input.birthDate ?? null,
        birthPlace: input.birthPlace || null,
        cin: input.cin || null,
        cinIssueDate: input.cinIssueDate ?? null,
        cinIssuePlace: input.cinIssuePlace || null,
        phone: input.phone || null,
        personalEmail: input.personalEmail || null,
        address: input.address || null,
        maritalStatus: input.maritalStatus || null,
        baccNumber: input.baccNumber || null,
        baccSeries: input.baccSeries || null,
        baccMention: input.baccMention || null,
        baccYear: input.baccYear || null,
        baccCenter: input.baccCenter || null,
        baccCountry: input.baccCountry || null,
        previousSchool: input.previousSchool || null,
        fatherName: input.fatherName || null,
        motherName: input.motherName || null,
        parentsPhone: input.parentsPhone || null,
        parentsAddress: input.parentsAddress || null,
        parentsCity: input.parentsCity || null,
        mention: input.mention || null,
        // Champ hérité, alimenté pour les filtres et listes existants
        program: input.mention || null,
        level: input.level || null,
        repeatCode: "N",
        status: "ENREGISTRE",
      },
    }),
  );

  await logAction(
    "STUDENT_REGISTERED",
    `Dossier ${student.matricule} créé pour ${fullName} depuis un import de dossiers existants (${input.academicYear})`,
    actorId,
  );
  return student;
}

// ---------------------------------------------------------------------------
// Carte étudiante numérique (QR code)
// ---------------------------------------------------------------------------

// Champs affichés sur la carte publique (page scannée) : identité et cursus
// uniquement, jamais les données sensibles du dossier (CIN, adresse,
// téléphone, contacts des parents...) — la page n'exige pas de connexion.
const QR_CARD_SELECT = {
  matricule: true,
  fullName: true,
  academicYear: true,
  program: true,
  mention: true,
  level: true,
  track: true,
  status: true,
} as const;

export type StudentQrCard = Prisma.StudentGetPayload<{ select: typeof QR_CARD_SELECT }>;

function generateQrToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

// Jeton opaque de la carte étudiante : créé au premier affichage plutôt qu'à
// l'inscription, pour que les dossiers déjà existants (créés avant cette
// fonctionnalité) en obtiennent un sans migration de données à part.
export async function getOrCreateStudentQrToken(studentId: string): Promise<string> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { qrToken: true },
  });
  if (student.qrToken) return student.qrToken;

  const token = generateQrToken();
  await prisma.student.update({ where: { id: studentId }, data: { qrToken: token } });
  return token;
}

// Invalide l'ancien code (ex : capture d'écran partagée par erreur) et en
// délivre un nouveau — l'ancien QR imprimé/enregistré cesse aussitôt de fonctionner.
export async function regenerateStudentQrToken(studentId: string, actorId: string): Promise<string> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { matricule: true },
  });
  const token = generateQrToken();
  await prisma.student.update({ where: { id: studentId }, data: { qrToken: token } });
  await logAction(
    "QR_TOKEN_REGENERATED",
    `Carte étudiante régénérée pour ${student.matricule}`,
    actorId,
  );
  return token;
}

// Résout un jeton de QR code vers les informations publiques de la carte.
// `select` explicite (plutôt qu'un `include` du dossier complet) : même si le
// code d'affichage change plus tard, cette fonction ne peut techniquement pas
// renvoyer un champ sensible qu'on aurait oublié de filtrer.
export async function getStudentByQrToken(token: string): Promise<StudentQrCard | null> {
  if (!token) return null;
  return prisma.student.findUnique({ where: { qrToken: token }, select: QR_CARD_SELECT });
}

// ---------------------------------------------------------------------------
// Écolage : versements par tranche semestrielle ou en totalité
// ---------------------------------------------------------------------------

export type EcolagePaymentTypeValue = "TRANCHE_S1" | "TRANCHE_S2" | "TOTALITE";

export const ECOLAGE_PAYMENT_LABELS: Record<EcolagePaymentTypeValue, string> = {
  TRANCHE_S1: "1ère tranche (semestre 1)",
  TRANCHE_S2: "2e tranche (semestre 2)",
  TOTALITE: "Totalité de l'année",
};

// 2. Agent d'administration : enregistre un versement d'écolage pour l'année
// en cours du dossier. Le montant annuel de référence vient des
// renseignements financiers du niveau du dossier (lib/finance.ts, local ou
// étranger selon Student.nationality) — moitié de ce montant pour une
// tranche, montant plein pour un versement total, sauf `explicitAmount`
// fourni (montant réellement versé, saisi par l'agent — voir
// verifyRegistrationPayment ci-dessous, pour le tout premier versement de
// l'année). Le tout premier versement débloque la suite du workflow
// (validation administrative) ; les versements suivants (2e tranche) ne font
// qu'ajouter une ligne d'historique, le dossier étant déjà débloqué.
export async function recordEcolagePayment(
  studentId: string,
  type: EcolagePaymentTypeValue,
  receiptNumber: string,
  actorId: string,
  explicitAmount?: number,
) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Dossier introuvable.");
  if (!student.academicYear) {
    throw new Error("Ce dossier n'a pas d'année universitaire définie.");
  }
  if (!student.level) {
    throw new Error(
      "Ce dossier n'a pas de niveau défini : impossible de déterminer le montant attendu.",
    );
  }

  const info = await getLevelFinancialInfoOne(student.level);
  const annualAmount = annualTuition(info, student.nationality === FOREIGN_NATIONALITY);

  const existing = await prisma.ecolagePayment.findMany({
    where: { studentId, academicYear: student.academicYear },
    select: { type: true },
  });
  const existingTypes = new Set(existing.map((p) => p.type));

  if (existingTypes.has(type)) {
    throw new Error(`${ECOLAGE_PAYMENT_LABELS[type]} déjà enregistrée pour cette année.`);
  }
  if (existingTypes.has("TOTALITE")) {
    throw new Error("L'écolage de cette année a déjà été payé en totalité.");
  }
  if (type === "TOTALITE" && existingTypes.size > 0) {
    throw new Error(
      "Des tranches sont déjà enregistrées pour cette année : impossible de basculer sur un versement total.",
    );
  }
  if (type === "TRANCHE_S2" && !existingTypes.has("TRANCHE_S1")) {
    throw new Error("La 1ère tranche doit être enregistrée avant la 2e.");
  }

  const amount = explicitAmount ?? (type === "TOTALITE" ? annualAmount : Math.round(annualAmount / 2));

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.ecolagePayment.create({
      data: {
        studentId,
        academicYear: student.academicYear!,
        type,
        amount,
        receiptNumber,
        verifiedById: actorId,
      },
    });
    if (student.status === "ENREGISTRE") {
      await tx.student.update({
        where: { id: studentId },
        data: { status: "PAIEMENT_VERIFIE", receiptNumber, receiptVerifiedAt: new Date() },
      });
    }
    return created;
  });

  await logAction(
    "ECOLAGE_PAYMENT_RECORDED",
    `${ECOLAGE_PAYMENT_LABELS[type]} enregistrée pour ${student.fullName} (${student.matricule}) — reçu ${receiptNumber}, ${amount} Ar`,
    actorId,
  );
  return payment;
}

// Vérification du paiement à l'inscription (dossier au statut ENREGISTRE) :
// l'agent saisit le montant réellement versé (plus de tranche calculée
// automatiquement) ; le dossier n'est débloqué que si ce montant couvre au
// moins les frais généraux (droit d'inscription + assurance + polo) et le
// premier versement du niveau du dossier — voir registrationMinimum dans
// lib/finance.ts. Le type de versement enregistré est déduit du montant :
// au moins le tarif annuel plein => versement total, sinon 1ère tranche.
export async function verifyRegistrationPayment(
  studentId: string,
  receiptNumber: string,
  amountPaid: number,
  actorId: string,
) {
  if (!Number.isInteger(amountPaid) || amountPaid < 0) {
    throw new Error("Montant invalide.");
  }
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new Error("Dossier introuvable.");
  if (student.status !== "ENREGISTRE") {
    throw new Error("Ce dossier n'est plus en attente de vérification du paiement.");
  }
  if (!student.level) {
    throw new Error(
      "Ce dossier n'a pas de niveau défini : impossible de déterminer le montant attendu.",
    );
  }

  const info = await getLevelFinancialInfoOne(student.level);
  const foreign = student.nationality === FOREIGN_NATIONALITY;
  const minimum = registrationMinimum(info, foreign);

  if (amountPaid < minimum) {
    throw new Error(
      `Montant insuffisant : ${minimum.toLocaleString("fr-FR")} Ar minimum requis (droit d'inscription + assurance + polo + premier versement), il manque ${(minimum - amountPaid).toLocaleString("fr-FR")} Ar.`,
    );
  }

  const type: EcolagePaymentTypeValue =
    amountPaid >= annualTuition(info, foreign) ? "TOTALITE" : "TRANCHE_S1";
  return recordEcolagePayment(studentId, type, receiptNumber, actorId, amountPaid);
}

// Versements déjà enregistrés pour l'année en cours d'un dossier + le
// prochain type de versement possible (null si l'année est déjà soldée) —
// utilisé pour piloter le formulaire de versement (quels boutons proposer).
export async function getEcolagePaymentState(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { academicYear: true },
  });
  if (!student?.academicYear) {
    return { payments: [], nextTypes: [] as EcolagePaymentTypeValue[] };
  }
  const payments = await prisma.ecolagePayment.findMany({
    where: { studentId, academicYear: student.academicYear },
    orderBy: { verifiedAt: "asc" },
  });
  const types = new Set(payments.map((p) => p.type));

  let nextTypes: EcolagePaymentTypeValue[] = [];
  if (types.has("TOTALITE") || (types.has("TRANCHE_S1") && types.has("TRANCHE_S2"))) {
    nextTypes = [];
  } else if (types.has("TRANCHE_S1")) {
    nextTypes = ["TRANCHE_S2"];
  } else {
    nextTypes = ["TRANCHE_S1", "TOTALITE"];
  }
  return { payments, nextTypes };
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
    const updatedStudent = await prisma.student.update({
      where: { id: studentId },
      data: { status: "INSCRIT", pedagoValidatedAt: new Date() },
    });
    await logAction(
      "PEDAGO_INSCRIPTION_VALIDATED",
      `Réinscription pédagogique validée pour ${student.fullName} (${student.matricule}, ${student.academicYear ?? "année inconnue"}) — compte existant conservé`,
      actorId,
    );
    return { student: updatedStudent, email: account?.email ?? "", password: null as string | null };
  }

  const email = await availableStudentEmail(student.fullName);
  // Mot de passe initial : matricule + suffixe aléatoire (le matricule seul
  // serait prévisible, puisqu'il est déjà affiché en clair partout)
  const password = generateInitialPassword(student.matricule);
  const passwordHash = await bcrypt.hash(password, 10);

  // Création du compte + mise à jour du dossier dans une seule transaction :
  // si l'une des deux écritures échoue, l'autre est annulée (pas de compte
  // orphelin ni de dossier "à moitié" inscrit).
  const updatedStudent = await prisma.$transaction(async (tx) => {
    const acc = await tx.user.create({
      // Mot de passe initial imprimé sur papier : changement forcé à la première connexion
      data: {
        email,
        fullName: student.fullName,
        role: "ETUDIANT",
        passwordHash,
        mustChangePassword: true,
      },
    });
    // Retournée directement : c'est cette version à jour (status INSCRIT,
    // accountId, pedagoValidatedAt) que la fonction doit renvoyer à l'appelant,
    // pas l'instantané `student` capturé avant la transaction.
    return tx.student.update({
      where: { id: studentId },
      // Le mot de passe initial est conservé pour être imprimé sur le reçu d'inscription
      data: {
        status: "INSCRIT",
        accountId: acc.id,
        initialPassword: password,
        pedagoValidatedAt: new Date(),
      },
    });
  });

  await logAction(
    "PEDAGO_INSCRIPTION_VALIDATED",
    `Inscription pédagogique validée pour ${student.fullName} (${student.matricule})`,
    actorId,
  );
  await logAction("USER_CREATED", `Compte étudiant ${email} créé automatiquement`, actorId);

  // Le mot de passe en clair n'est retourné qu'une seule fois, pour être transmis à l'étudiant
  return { student: updatedStudent, email, password: password as string | null };
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

  const nextLevel = input.level?.trim() || student.level;
  // Redoublement = même niveau qu'avant la réinscription ; passage au niveau
  // supérieur = étudiant "passant", codé N comme un nouvel étudiant. Un
  // redoublement du redoublement (même niveau, déjà R) passe à T (triplant).
  const repeatCode =
    nextLevel !== student.level
      ? "N"
      : student.repeatCode === "R" || student.repeatCode === "T"
        ? "T"
        : "R";

  // Archivage de l'année qui se termine + remise à zéro du dossier : les deux
  // écritures doivent réussir ensemble, sinon on perdrait l'historique ou on
  // le dupliquerait à la prochaine tentative.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.enrollmentHistory.create({
      data: {
        studentId,
        academicYear: student.academicYear ?? "inconnue",
        track: student.level ?? student.track,
        status: student.status,
        receiptNumber: student.receiptNumber,
        receiptVerifiedAt: student.receiptVerifiedAt,
        pedagoValidatedAt: student.pedagoValidatedAt,
      },
    });

    // Le dossier repart au début du workflow pour la nouvelle année
    return tx.student.update({
      where: { id: studentId },
      data: {
        academicYear: input.academicYear,
        level: nextLevel,
        status: "ENREGISTRE",
        receiptNumber: null,
        receiptVerifiedAt: null,
        pedagoValidatedAt: null,
        repeatCode,
      },
    });
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
// `year` : restreint à cette année universitaire (sélecteur global de l'en-tête)
// `level` : restreint à ce niveau (sélecteur global de l'en-tête)
export async function searchStudents(
  query?: string,
  formation?: string | null,
  year?: string | null,
  level?: string | null,
) {
  const q = query?.trim();
  const conditions: object[] = [];
  if (formation) {
    conditions.push({ OR: [{ mention: formation }, { program: formation }] });
  }
  if (year) {
    conditions.push({ academicYear: year });
  }
  if (level) {
    conditions.push({ level });
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
  year?: string | null;
  level?: string | null;
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
      ...(filters.year ? { academicYear: filters.year } : {}),
      ...(filters.level ? { level: filters.level } : {}),
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
  page?: number; // page affichée (1-indexée)
};

export const STUDENT_PAGE_SIZE = 50;

// Forme partagée par listStudents (paginé) ET getAllFilteredStudents (export
// CSV / vue imprimable) : les deux utilisent le même `include`, donc le même
// tableau peut être groupé en blocs (filière/niveau/année...) par la même
// fonction — voir app/etudiants/group-students.ts.
export type StudentWithAccountAndResults = Prisma.StudentGetPayload<{
  include: {
    account: { select: { email: true } };
    results: true;
  };
}>;

export type StudentListResult = {
  students: StudentWithAccountAndResults[];
  total: number;
  page: number;
  totalPages: number;
};

// Construit les conditions WHERE + le tri communs à l'affichage paginé, à
// l'export CSV et à la vue imprimable — une seule définition du filtrage,
// pour que les trois vues montrent toujours exactement le même ensemble.
export function buildStudentQuery(params: StudentListParams, formation?: string | null) {
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

  return {
    where: conditions.length > 0 ? { AND: conditions } : {},
    orderBy: { [sortField]: dir } as const,
  };
}

// `formation` : périmètre imposé côté serveur (secrétaire de formation).
// Toujours paginé (STUDENT_PAGE_SIZE par page) : sur un grand établissement,
// charger tous les dossiers en mémoire à chaque affichage ne passe pas à
// l'échelle. Le classement par blocs (filière/niveau/année...) s'applique à
// la page courante, pas à l'ensemble des dossiers.
export async function listStudents(
  params: StudentListParams = {},
  formation?: string | null,
): Promise<StudentListResult> {
  const { where, orderBy } = buildStudentQuery(params, formation);
  const page = Math.max(1, params.page ?? 1);

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy,
      skip: (page - 1) * STUDENT_PAGE_SIZE,
      take: STUDENT_PAGE_SIZE,
      include: {
        account: { select: { email: true } },
        // Nécessaire pour le classement par mention (dernier résultat en premier)
        results: { orderBy: [{ academicYear: "desc" }, { semester: "desc" }] },
      },
    }),
    prisma.student.count({ where }),
  ]);

  return { students, total, page, totalPages: Math.max(1, Math.ceil(total / STUDENT_PAGE_SIZE)) };
}

// Variante non paginée : renvoie TOUS les dossiers correspondant aux mêmes
// filtres/tri que listStudents. Réservée aux actions volontaires et bornées
// dans le temps (export CSV, vue imprimable) — jamais à l'affichage courant,
// qui reste paginé pour rester scalable.
export async function getAllFilteredStudents(
  params: StudentListParams = {},
  formation?: string | null,
) {
  const { where, orderBy } = buildStudentQuery(params, formation);
  return prisma.student.findMany({
    where,
    orderBy,
    include: {
      account: { select: { email: true } },
      results: { orderBy: [{ academicYear: "desc" }, { semester: "desc" }] },
    },
  });
}

// Valeurs distinctes pour les sélecteurs de filtres de la liste étudiants
// `year` : restreint aux options pertinentes pour cette année universitaire
export async function getStudentFilterValues(year?: string | null) {
  const rows = await prisma.student.findMany({
    where: year ? { academicYear: year } : undefined,
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

  // Suppression du dossier + du compte lié dans une seule transaction : si la
  // suppression du compte échoue pour une raison réelle (pas juste "déjà
  // supprimé"), le dossier n'est pas supprimé non plus (pas de compte orphelin).
  await prisma.$transaction(async (tx) => {
    await tx.student.delete({ where: { id: studentId } });
    if (student.accountId) {
      try {
        await tx.user.delete({ where: { id: student.accountId } });
      } catch (e) {
        const alreadyGone =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
        if (!alreadyGone) throw e; // compte déjà supprimé : sans incidence, sinon on annule tout
      }
    }
  });

  await logAction(
    "STUDENT_DELETED",
    `Dossier ${student.matricule} (${student.fullName}) supprimé${student.accountId ? ", compte de connexion inclus" : ""}`,
    actorId,
  );
  return student;
}

// Champs modifiables après enregistrement (matricule, statut, année universitaire,
// reçu, compte et conduite restent gérés par leurs actions dédiées)
export type UpdateStudentInput = {
  lastName: string;
  firstName: string;
  gender: string; // "M" | "F"
  birthDate: Date;
  birthPlace: string;
  motherName?: string | null;
  fatherName?: string | null;
  nationality: string;
  maritalStatus: string;
  cin?: string | null;
  cinIssueDate?: Date | null;
  cinIssuePlace?: string | null;
  baccNumber: string;
  baccSeries: string;
  baccMention: string;
  baccYear: string;
  baccCenter?: string | null;
  baccCountry?: string | null;
  previousSchool?: string | null;
  previousUniversity?: string | null;
  repeatCode?: string | null;
  address: string;
  phone: string;
  personalEmail?: string | null;
  parentsPhone?: string | null;
  parentsAddress?: string | null;
  parentsCity?: string | null;
  guardianName: string;
  guardianPhone: string;
  guardianAddress?: string | null;
  domain?: string | null;
  mention: string;
  track?: string | null;
  trainingType?: string | null;
  level: string;
  docResidenceCert: boolean;
  docCinCopy: boolean;
  docParentCin: boolean;
  docPhotos: boolean;
  docPinkFolder: boolean;
  docPaymentSlip: boolean;
  docEngagementLetter: boolean;
};

// Agent d'administration : modifie un dossier existant (hors statut, année
// universitaire, reçu, compte et conduite — chacun a son propre workflow)
export async function updateStudent(
  studentId: string,
  input: UpdateStudentInput,
  actorId: string,
) {
  const existing = await prisma.student.findUnique({ where: { id: studentId } });
  if (!existing) throw new Error("Dossier introuvable.");
  if (!["M", "F"].includes(input.gender)) {
    throw new Error("Sexe invalide (M ou F).");
  }
  if (!input.guardianName || !input.guardianPhone) {
    throw new Error("La personne à contacter d'urgence est obligatoire.");
  }

  // .trim() : certaines personnes n'ont pas de prénom (courant à Madagascar,
  // le prénom n'est plus obligatoire à l'inscription) — sans quoi un prénom
  // vide laisserait un espace final dans le nom affiché.
  const fullName = `${input.lastName.toUpperCase()} ${input.firstName}`.trim();
  const updated = await prisma.student.update({
    where: { id: studentId },
    data: {
      ...input,
      fullName,
      // Champ hérité, gardé en cohérence avec la formation pour les filtres et le périmètre par formation
      program: input.mention,
    },
  });

  await logAction(
    "STUDENT_UPDATED",
    `Dossier ${updated.matricule} (${fullName}) modifié`,
    actorId,
  );
  return updated;
}

// ---------------------------------------------------------------------------
// Gestion de l'écolage
// ---------------------------------------------------------------------------

// Un dossier est "payé" (FULL) dès que l'écolage de son année en cours est
// intégralement réglé (versement TOTALITE, ou les deux tranches S1+S2) ;
// "PARTIAL" s'il ne manque que la 2e tranche ; "UNPAID" si rien n'a encore
// été versé. Les versements d'une année déjà archivée (réinscription) ne
// comptent pas : seule l'année de rattachement ACTUELLE du dossier importe.
export type EcolagePaymentStatus = "UNPAID" | "PARTIAL" | "FULL";

function paymentStatusOf(types: Set<EcolagePaymentTypeValue>): EcolagePaymentStatus {
  if (types.has("TOTALITE") || (types.has("TRANCHE_S1") && types.has("TRANCHE_S2"))) return "FULL";
  if (types.size > 0) return "PARTIAL";
  return "UNPAID";
}

// Regroupe les versements par dossier, en ne gardant que ceux de l'année de
// rattachement actuelle de chaque dossier (voir paymentStatusOf ci-dessus).
async function paymentTypesByStudent(
  students: Array<{ id: string; academicYear: string | null }>,
): Promise<Map<string, Set<EcolagePaymentTypeValue>>> {
  const yearById = new Map(students.map((s) => [s.id, s.academicYear]));
  const payments = await prisma.ecolagePayment.findMany({
    where: { studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true, academicYear: true, type: true },
  });
  const byStudent = new Map<string, Set<EcolagePaymentTypeValue>>();
  for (const p of payments) {
    if (yearById.get(p.studentId) !== p.academicYear) continue;
    if (!byStudent.has(p.studentId)) byStudent.set(p.studentId, new Set());
    byStudent.get(p.studentId)!.add(p.type);
  }
  return byStudent;
}

export type EcolageStats = {
  total: number;
  full: number;
  partial: number;
  unpaid: number;
  byFormation: Array<{ formation: string; full: number; partial: number; unpaid: number; total: number }>;
};

export async function getEcolageStats(year?: string, level?: string): Promise<EcolageStats> {
  const where = { ...(year ? { academicYear: year } : {}), ...(level ? { level } : {}) };
  const students = await prisma.student.findMany({
    where,
    select: { id: true, academicYear: true, mention: true, program: true },
  });
  const typesByStudent = await paymentTypesByStudent(students);

  const stats: EcolageStats = { total: students.length, full: 0, partial: 0, unpaid: 0, byFormation: [] };
  const formations = new Map<string, { full: number; partial: number; unpaid: number; total: number }>();

  for (const s of students) {
    const status = paymentStatusOf(typesByStudent.get(s.id) ?? new Set());
    const key = status === "FULL" ? "full" : status === "PARTIAL" ? "partial" : "unpaid";
    stats[key]++;

    const formation = s.mention ?? s.program ?? "Formation non renseignée";
    if (!formations.has(formation)) formations.set(formation, { full: 0, partial: 0, unpaid: 0, total: 0 });
    const f = formations.get(formation)!;
    f.total++;
    f[key]++;
  }

  stats.byFormation = [...formations.entries()]
    .map(([formation, f]) => ({ formation, ...f }))
    .sort((a, b) => b.total - a.total);
  return stats;
}

export type EcolageDueEntry = {
  id: string;
  matricule: string;
  fullName: string;
  phone: string | null;
  guardianPhone: string | null;
  mention: string | null;
  program: string | null;
  academicYear: string | null;
  createdAt: Date;
  paymentStatus: "UNPAID" | "PARTIAL";
  amountDue: number | null; // null si le dossier n'a pas de niveau défini
};

// Dossiers dont l'écolage de l'année en cours n'est pas intégralement réglé
// (rien versé, ou seulement la 1ère tranche) — pour relance.
export async function listStudentsWithBalanceDue(
  year?: string,
  level?: string,
): Promise<EcolageDueEntry[]> {
  const students = await prisma.student.findMany({
    where: { ...(year ? { academicYear: year } : {}), ...(level ? { level } : {}) },
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
      level: true,
      nationality: true,
    },
  });
  if (students.length === 0) return [];

  const typesByStudent = await paymentTypesByStudent(students);
  const infoByLevel = new Map((await getLevelFinancialInfos()).map((i) => [i.level, i]));

  const due: EcolageDueEntry[] = [];
  for (const s of students) {
    const status = paymentStatusOf(typesByStudent.get(s.id) ?? new Set());
    if (status === "FULL") continue;

    const info = s.level ? infoByLevel.get(s.level) : undefined;
    const annualAmount = info ? annualTuition(info, s.nationality === FOREIGN_NATIONALITY) : undefined;
    const amountDue =
      annualAmount === undefined
        ? null
        : status === "PARTIAL"
          ? Math.round(annualAmount / 2) // il ne reste que la 2e tranche
          : annualAmount; // rien versé : l'année entière est due

    due.push({
      id: s.id,
      matricule: s.matricule,
      fullName: s.fullName,
      phone: s.phone,
      guardianPhone: s.guardianPhone,
      mention: s.mention,
      program: s.program,
      academicYear: s.academicYear,
      createdAt: s.createdAt,
      paymentStatus: status,
      amountDue,
    });
  }
  return due;
}

export type StudentBalanceDue = {
  status: EcolagePaymentStatus;
  academicYear: string | null;
  annualAmount: number | null; // frais de formation annuel du niveau ; null si niveau non défini
  paidAmount: number; // déjà versé pour l'année de rattachement actuelle
  amountDue: number | null; // reste à payer ; null si niveau non défini, 0 si soldé
};

// Reste à payer d'UN dossier pour son année de rattachement actuelle — sert à
// l'avertir sur son profil (voir listStudentsWithBalanceDue ci-dessus pour la
// version "liste de relance" côté agent, même logique de calcul).
export async function getStudentBalanceDue(studentId: string): Promise<StudentBalanceDue> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { academicYear: true, level: true, nationality: true },
  });

  const payments = student.academicYear
    ? await prisma.ecolagePayment.findMany({
        where: { studentId, academicYear: student.academicYear },
      })
    : [];
  const status = paymentStatusOf(new Set(payments.map((p) => p.type)));
  const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  const annualAmount = student.level
    ? annualTuition(await getLevelFinancialInfoOne(student.level), student.nationality === FOREIGN_NATIONALITY)
    : null;

  const amountDue =
    status === "FULL" ? 0 : annualAmount === null ? null : Math.max(annualAmount - paidAmount, 0);

  return { status, academicYear: student.academicYear, annualAmount, paidAmount, amountDue };
}

// Valeurs distinctes pour alimenter les listes déroulantes de filtres
// `year` : restreint aux options pertinentes pour cette année universitaire
export async function getFilterOptions(year?: string | null) {
  const rows = await prisma.student.findMany({
    where: { status: "INSCRIT", ...(year ? { academicYear: year } : {}) },
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
      } else if (matricule) {
        await prisma.student.create({ data: { ...data, matricule } });
        result.created++;
      } else {
        await createWithGeneratedMatricule(undefined, (m) =>
          prisma.student.create({ data: { ...data, matricule: m } }),
        );
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
