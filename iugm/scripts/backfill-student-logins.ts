// Migration de rattrapage, à lancer UNE FOIS en production après le déploiement
// qui introduit les identifiants « prenom.nom » : donne un identifiant lisible à
// chaque compte étudiant existant et garde l'ancien (« …@student.iugm.edu »)
// valide en alias. Idempotent ; sans effet sur le personnel.
//
// Usage :
//   npx tsx scripts/backfill-student-logins.ts            # applique
//   npx tsx scripts/backfill-student-logins.ts --dry-run  # compte seulement
import "../prisma/load-env";
import { prisma } from "../lib/prisma";
import { backfillStudentLogins } from "../lib/student-login-backfill";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const summary = await backfillStudentLogins({ dryRun });
  console.log(
    `${dryRun ? "[simulation] " : ""}Comptes étudiants examinés : ${summary.scanned} — ` +
      `${dryRun ? "à migrer" : "migrés"} : ${summary.migrated} — échecs : ${summary.failed}`,
  );
  if (summary.failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("❌ Erreur :", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
