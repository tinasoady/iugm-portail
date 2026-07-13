import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import bcrypt from "bcryptjs";
// On importe l'instance Prisma configurée avec l'adaptateur PostgreSQL v7
import { prisma } from "../lib/prisma";

// Sécurité : On s'assure que le script standalone charge bien les variables de .env.local
if (existsSync(".env.local")) {
  loadEnvFile(".env.local");
}

async function main() {
  console.log("⏳ Début du peuplement de la base de données...");

  // 1. Génération d'une empreinte sécurisée pour le mot de passe
  // Le chiffre 10 représente le "salt round" (la puissance de chiffrement)
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash("admin123", salt);
  const studentPasswordHash = await bcrypt.hash("etudiant123", salt);

  // 2. Création du compte SUPERADMIN
  // L'opération 'upsert' évite les doublons : elle met à jour si l'email existe déjà, sinon elle le crée.
  const superadmin = await prisma.user.upsert({
    where: { email: "admin@iugm.edu" },
    update: {},
    create: {
      email: "admin@iugm.edu",
      fullName: "Super Administrateur IUGM",
      passwordHash: adminPasswordHash,
      role: "SUPERADMIN",
    },
  });

  // 3. Création d'un compte ÉTUDIANT test
  const etudiant = await prisma.user.upsert({
    where: { email: "student@iugm.edu" },
    update: {},
    create: {
      email: "student@iugm.edu",
      fullName: "Jean Dupont",
      passwordHash: studentPasswordHash,
      role: "ETUDIANT",
    },
  });

  console.log(`✅ Compte Superadmin créé : ${superadmin.email} (Mot de passe: admin123)`);
  console.log(`✅ Compte Étudiant créé : ${etudiant.email} (Mot de passe: etudiant123)`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur lors du seeding :", e);
    process.exit(1);
  });