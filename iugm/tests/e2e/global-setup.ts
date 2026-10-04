import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

import { ACCOUNTS, PASSWORD, TFA_RECOVERY_CODE, TFA_SECRET } from "./fixtures";

// Prépare la base de TEST avant les scénarios : vide tout, puis crée les
// comptes et le dossier étudiant dont ils ont besoin. Tourne dans le processus
// de Playwright (pas dans le serveur web) : on importe donc Prisma ici, après
// avoir vérifié la base visée.
export default async function globalSetup() {
  if (!process.env.DATABASE_URL?.includes("iugm_scolarite_test_db")) {
    throw new Error(
      `Tests e2e refusés : DATABASE_URL ne pointe pas vers la base de test (${process.env.DATABASE_URL}).`,
    );
  }

  const { prisma } = await import("@/lib/prisma");
  const { tasksForRole } = await import("@/lib/permissions");
  const { encryptSecret } = await import("@/lib/secret-crypto");
  const { registerStudent } = await import("@/lib/students");

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);

  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  const root = await prisma.user.create({
    data: {
      email: ACCOUNTS.superadmin.username,
      fullName: "Super Admin E2E",
      passwordHash,
      role: "SUPERADMIN",
      permissions: tasksForRole("SUPERADMIN"),
    },
  });
  for (const [key, role] of [
    ["agentAdmin", "AGENT_ADMINISTRATION"],
    ["agentPedago", "AGENT_PEDAGOGIQUE"],
    ["resetUser", "AGENT_ADMINISTRATION"],
    ["recoveryUser", "AGENT_PEDAGOGIQUE"],
    ["twoDevices", "AGENT_ADMINISTRATION"],
  ] as const) {
    await prisma.user.create({
      data: {
        email: ACCOUNTS[key].username,
        fullName: `Agent ${key}`,
        passwordHash,
        role,
        permissions: tasksForRole(role),
      },
    });
  }

  await prisma.user.create({
    data: {
      email: ACCOUNTS.setupTwoFactor.username,
      fullName: "Super Admin Config 2FA",
      passwordHash,
      role: "SUPERADMIN",
      permissions: tasksForRole("SUPERADMIN"),
    },
  });

  // Compte avec double authentification déjà activée (secret et code de secours connus)
  await prisma.user.create({
    data: {
      email: ACCOUNTS.twoFactor.username,
      fullName: "Super Admin 2FA",
      passwordHash,
      role: "SUPERADMIN",
      totpEnabled: true,
      totpSecret: encryptSecret(TFA_SECRET),
      recoveryCodes: [createHash("sha256").update(TFA_RECOVERY_CODE.replace("-", "")).digest("hex")],
    },
  });

  await prisma.user.create({
    data: {
      email: ACCOUNTS.mustChange.username,
      fullName: "Etudiant Temporaire",
      passwordHash,
      role: "ETUDIANT",
      mustChangePassword: true,
    },
  });

  // 25 comptes étudiants pour le scénario « Voir plus » du tableau de bord
  for (let i = 1; i <= 25; i++) {
    await prisma.user.create({
      data: { email: `filler${i}@e2e.test`, fullName: `Filler ${i}`, passwordHash, role: "ETUDIANT" },
    });
  }

  // Dossier ENREGISTRE : point de départ du scénario d'inscription
  await registerStudent(
    {
      academicYear: "2026-2027",
      lastName: "RAKOTO",
      firstName: "Parcours",
      nationality: "Malagasy",
      gender: "M",
      birthDate: new Date("2005-01-01"),
      birthPlace: "Mahajanga",
      phone: "0341234567",
      address: "Lot 12 Mahajanga",
      maritalStatus: "Célibataire",
      baccNumber: "E2E-BACC-1",
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
    },
    root.id,
  );

  await prisma.$disconnect();
}
