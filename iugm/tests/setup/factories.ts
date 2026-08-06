import { prisma } from "@/lib/prisma";
import type { RegisterStudentInput, UpdateStudentInput } from "@/lib/students";
import { FINANCIAL_INFO_DEFAULTS, type FinancialInfoFields } from "@/lib/finance";

// Compteur simple pour des valeurs uniques (email, n° bacc...) sans dépendre
// de Math.random()/Date.now() dans les tests — juste un compteur de process.
let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}

type ActorRole = "SUPERADMIN" | "AGENT_ADMINISTRATION" | "AGENT_PEDAGOGIQUE";

// AuditLog.actorId est une vraie clé étrangère vers User : logAction() avale
// ses erreurs (voir lib/audit.ts), donc un actorId inventé ne ferait pas
// planter le test, mais masquerait silencieusement une vraie régression.
// Toujours passer un acteur créé par cette fonction.
export async function createActor(role: ActorRole = "SUPERADMIN") {
  return prisma.user.create({
    data: {
      email: `${unique("actor")}@test.local`,
      passwordHash: "not-a-real-hash",
      role,
      fullName: "Acteur de test",
    },
  });
}

// Renseignements financiers d'un niveau — requis par recordEcolagePayment /
// verifyRegistrationPayment (le montant de chaque tranche est calculé depuis
// le tarif annuel du niveau, jamais saisi librement pour la 2e tranche).
// "L1" correspond au niveau par défaut de validRegisterInput ci-dessous. Sans
// appel à cette factory, les valeurs par défaut de lib/finance.ts
// s'appliquent déjà (aucune configuration n'est requise pour un niveau
// standard) : ne l'utiliser que pour tester avec des montants précis.
export async function createLevelFinancialInfo(
  level = "L1",
  overrides: Partial<FinancialInfoFields> = {},
) {
  const data = { ...FINANCIAL_INFO_DEFAULTS, ...overrides };
  return prisma.levelFinancialInfo.upsert({
    where: { level },
    update: data,
    create: { level, ...data },
  });
}

export function validRegisterInput(
  overrides: Partial<RegisterStudentInput> = {},
): RegisterStudentInput {
  return {
    academicYear: "2026-2027",
    lastName: "RAKOTO",
    firstName: "Jean",
    nationality: "Malagasy",
    gender: "M",
    birthDate: new Date("2005-01-01"),
    birthPlace: "Mahajanga",
    phone: "0341234567",
    address: "Lot 12 Mahajanga",
    maritalStatus: "Célibataire",
    baccNumber: unique("BACC"),
    baccSeries: "D",
    baccMention: "Passable",
    baccYear: "2024",
    guardianName: "RAKOTO Paul",
    guardianPhone: "0341112233",
    mention: "Management",
    level: "L1",
    docResidenceCert: true,
    docCinCopy: true,
    docParentCin: false,
    docPhotos: true,
    docPinkFolder: true,
    docPaymentSlip: true,
    docEngagementLetter: true,
    ...overrides,
  };
}

export function validUpdateInput(overrides: Partial<UpdateStudentInput> = {}): UpdateStudentInput {
  return {
    lastName: "RAKOTO",
    firstName: "Jean",
    nationality: "Malagasy",
    gender: "M",
    birthDate: new Date("2005-01-01"),
    birthPlace: "Mahajanga",
    phone: "0341234567",
    address: "Lot 12 Mahajanga",
    maritalStatus: "Célibataire",
    baccNumber: unique("BACC"),
    baccSeries: "D",
    baccMention: "Passable",
    baccYear: "2024",
    guardianName: "RAKOTO Paul",
    guardianPhone: "0341112233",
    mention: "Management",
    level: "L1",
    docResidenceCert: true,
    docCinCopy: true,
    docParentCin: false,
    docPhotos: true,
    docPinkFolder: true,
    docPaymentSlip: true,
    docEngagementLetter: true,
    ...overrides,
  };
}
