// Import réel (écrit en base) du fichier "BASE IUGM Mahajanga" — une feuille
// par niveau/filière (ex. "L1 - PGI"). Réutilise exactement le même chemin
// que l'écran Base de données > Import (catégorie « Dossiers existants ») :
// chaque ligne devient une PreselectionCandidate puis, pour cette catégorie,
// un dossier « Enregistré » (createStudentFromExistingRecord) — voir
// lib/preselection.ts. Seule la lecture du fichier diffère (streaming,
// nécessaire pour un fichier de cette taille — voir parseExistingRecordsFromFile).
//
// Usage :
//   npx tsx scripts/import-iugm-existing.ts <chemin-du-fichier.xlsx> <annee> [email-superadmin]
// Exemple :
//   npx tsx scripts/import-iugm-existing.ts "../BASE IUGM Mahajanga 2025-2026.xlsx" 2025-2026 admin@iugm.edu
//
// Sans risque de double import : un ré-import remplace les fiches non
// utilisées de la même année (les dossiers déjà créés/utilisés restent
// intacts) — voir importPreselectionRows.
import "../prisma/load-env";
import path from "path";
import { prisma } from "../lib/prisma";
import { parseExistingRecordsFromFile, importPreselectionRows } from "../lib/preselection";

async function main() {
  const [, , filePathArg, academicYear, actorEmail] = process.argv;
  if (!filePathArg || !academicYear) {
    console.error(
      "Usage: npx tsx scripts/import-iugm-existing.ts <chemin-du-fichier.xlsx> <annee 2025-2026> [email-superadmin]",
    );
    process.exit(1);
  }
  if (!/^\d{4}-\d{4}$/.test(academicYear)) {
    console.error("Année invalide (format attendu : 2025-2026).");
    process.exit(1);
  }

  const actor = actorEmail
    ? await prisma.user.findUnique({ where: { email: actorEmail } })
    : await prisma.user.findFirst({ where: { role: "SUPERADMIN" } });
  if (!actor) {
    console.error(
      actorEmail
        ? `Aucun utilisateur avec l'email ${actorEmail}.`
        : "Aucun compte SUPERADMIN trouvé — précisez un email en 3e argument.",
    );
    process.exit(1);
  }

  const resolved = path.resolve(filePathArg);
  console.log(`Lecture (streaming) de ${resolved}...`);
  const { rows, errors: parseErrors } = await parseExistingRecordsFromFile(resolved);
  console.log(`${rows.length} ligne(s) exploitable(s), ${parseErrors.length} erreur(s) de lecture.`);

  if (rows.length === 0) {
    console.error("Aucune ligne exploitable, import annulé.");
    process.exit(1);
  }

  console.log(`\nÉcriture en base pour l'année ${academicYear} (acteur : ${actor.email})...`);
  const result = await importPreselectionRows(rows, academicYear, actor.id, "EXISTING", parseErrors);

  console.log(`\n=== Résultat ===`);
  console.log(`Fiches enregistrées : ${result.created}`);
  console.log(`Dossiers créés : ${result.studentsCreated ?? 0}`);
  console.log(`Dossiers déjà existants reliés (pas de doublon) : ${result.studentsMatched ?? 0}`);
  if (result.errors.length > 0) {
    console.log(`\nErreurs/lignes ignorées (${result.errors.length}) :`);
    for (const e of result.errors.slice(0, 20)) console.log(`  - ${e}`);
    if (result.errors.length > 20) console.log(`  ... et ${result.errors.length - 20} autre(s).`);
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
