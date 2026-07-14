// L'import de load-env doit rester en premier : il charge .env.local
// avant que lib/prisma ne crée le pool de connexion PostgreSQL.
import "./load-env";
import bcrypt from "bcryptjs";
// On importe l'instance Prisma configurée avec l'adaptateur PostgreSQL v7
import { prisma } from "../lib/prisma";

async function main() {
  console.log("⏳ Début du peuplement de la base de données...");

  // 1. Génération d'une empreinte sécurisée pour le mot de passe
  // Le chiffre 10 représente le "salt round" (la puissance de chiffrement)
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash("admin123", salt);

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

  console.log(`✅ Compte Superadmin créé : ${superadmin.email} (Mot de passe: admin123)`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur lors du seeding :", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Ferme le pool de connexions pour que le script se termine proprement
    await prisma.$disconnect();
  });
