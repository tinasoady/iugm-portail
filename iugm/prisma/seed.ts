// L'import de load-env doit rester en premier : il charge .env.local
// avant que lib/prisma ne crée le pool de connexion PostgreSQL.
import "./load-env";
import bcrypt from "bcryptjs";
// On importe l'instance Prisma configurée avec l'adaptateur PostgreSQL v7
import { prisma } from "../lib/prisma";
import { generatePassword } from "../lib/students";

async function main() {
  console.log("⏳ Début du peuplement de la base de données...");

  const email = "admin@iugm.edu";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`ℹ️ Compte Superadmin déjà présent : ${email} (mot de passe inchangé)`);
    return;
  }

  // Mot de passe aléatoire à usage unique : jamais commité, affiché une seule
  // fois ici. Le compte est créé avec mustChangePassword pour forcer sa
  // définition par la personne qui se connecte réellement (voir lib/login.ts).
  const initialPassword = generatePassword(12);
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash(initialPassword, salt);

  const superadmin = await prisma.user.create({
    data: {
      email,
      fullName: "Super Administrateur IUGM",
      passwordHash: adminPasswordHash,
      role: "SUPERADMIN",
      mustChangePassword: true,
    },
  });

  console.log(`✅ Compte Superadmin créé : ${superadmin.email}`);
  console.log(`🔑 Mot de passe initial (à usage unique, ne sera plus jamais affiché) : ${initialPassword}`);
  console.log(`   Changement obligatoire à la première connexion.`);
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
