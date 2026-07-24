import "./load-test-env";
import { prisma } from "@/lib/prisma";

// Garde-fou : si jamais .env.test n'a pas été chargé (mauvais ordre d'import),
// mieux vaut planter que de tronquer silencieusement la base de développement.
if (!process.env.DATABASE_URL?.includes("iugm_scolarite_test_db")) {
  throw new Error(
    `resetDb() refuse de continuer : DATABASE_URL ne pointe pas vers la base de test (${process.env.DATABASE_URL}).`,
  );
}

// Vide toutes les tables applicatives entre deux tests, sans recréer le schéma
// à chaque fois (trop lent). Découverte dynamique des tables plutôt qu'une
// liste en dur : reste correcte si le schéma évolue sans qu'on pense à ce fichier.
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
