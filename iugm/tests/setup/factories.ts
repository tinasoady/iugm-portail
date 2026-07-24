import { prisma } from "@/lib/prisma";
import type { RegisterStudentInput } from "@/lib/students";

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

// Dossier d'inscription minimal mais valide vis-à-vis des règles de
// registerStudent (année au format AAAA-AAAA, sexe M/F, personne à contacter
// d'urgence obligatoire...).
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
