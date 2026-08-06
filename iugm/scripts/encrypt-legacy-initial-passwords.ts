// Migration de rattrapage, à lancer UNE FOIS en production juste après le
// déploiement qui introduit le chiffrement de Student.initialPassword (voir
// lib/secret-crypto.ts) : chiffre les mots de passe initiaux déjà en clair en
// base (dossiers créés avant ce déploiement). Sans danger à relancer
// plusieurs fois (idempotent — une valeur déjà chiffrée est ignorée) ni à
// lancer si personne n'a de mot de passe initial en clair.
//
// Usage :
//   npx tsx scripts/encrypt-legacy-initial-passwords.ts
import "../prisma/load-env";
import { prisma } from "../lib/prisma";
import { encryptSecret, decryptSecret } from "../lib/secret-crypto";

// Un mot de passe initial en clair ne contient jamais ":" (voir
// generateInitialPassword/generatePassword dans lib/students.ts) — c'est
// exactement le test que fait decryptSecret pour distinguer les deux formats.
function isAlreadyEncrypted(value: string): boolean {
  return decryptSecret(value) !== value;
}

async function main() {
  const students = await prisma.student.findMany({
    where: { initialPassword: { not: null } },
    select: { id: true, matricule: true, initialPassword: true },
  });

  let migrated = 0;
  for (const s of students) {
    if (!s.initialPassword || isAlreadyEncrypted(s.initialPassword)) continue;
    await prisma.student.update({
      where: { id: s.id },
      data: { initialPassword: encryptSecret(s.initialPassword) },
    });
    migrated++;
    console.log(`Chiffré : ${s.matricule}`);
  }

  console.log(`Terminé : ${migrated} mot(s) de passe migré(s) sur ${students.length} dossier(s) concerné(s).`);
}

main()
  .catch((e) => {
    console.error("Erreur lors de la migration :", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
