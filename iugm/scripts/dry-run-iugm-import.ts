// Script ponctuel : parse (sans écrire en base) le fichier "BASE IUGM
// Mahajanga 2025-2026.xlsx" via parseExistingRecordsFromFile, et affiche un
// résumé (comptes par feuille/niveau, filières non reconnues, erreurs,
// échantillon de lignes) pour validation avant un import réel.
// Usage : npx tsx scripts/dry-run-iugm-import.ts <chemin-du-fichier>
import "../prisma/load-env";
import path from "path";
import { parseExistingRecordsFromFile } from "../lib/preselection";
import { FORMATIONS } from "../lib/formations";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx scripts/dry-run-iugm-import.ts <chemin-du-fichier.xlsx>");
    process.exit(1);
  }
  const resolved = path.resolve(filePath);
  console.log(`Lecture (streaming) de ${resolved}...`);

  const start = Date.now();
  const { rows, errors } = await parseExistingRecordsFromFile(resolved);
  const seconds = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\nTerminé en ${seconds}s — ${rows.length} ligne(s) exploitable(s), ${errors.length} erreur(s).\n`);

  const byLevel = new Map<string, number>();
  const byFormation = new Map<string, number>();
  for (const r of rows) {
    const level = r.level ?? "(sans niveau)";
    byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
    const formation = r.formation ?? "(sans filière)";
    byFormation.set(formation, (byFormation.get(formation) ?? 0) + 1);
  }

  console.log("=== Répartition par niveau ===");
  for (const [level, count] of [...byLevel.entries()].sort()) {
    console.log(`  ${level}: ${count}`);
  }

  console.log("\n=== Répartition par filière ===");
  for (const [formation, count] of [...byFormation.entries()].sort()) {
    const flag = FORMATIONS.some((f) => f.label === formation) ? "" : "  ⚠ non reconnue dans FORMATIONS";
    console.log(`  ${formation}: ${count}${flag}`);
  }

  console.log(`\n=== Total : ${rows.length} étudiant(s) ===`);

  if (errors.length > 0) {
    console.log(`\n=== Erreurs (${errors.length}, 10 premières) ===`);
    for (const e of errors.slice(0, 10)) console.log(`  - ${e}`);
  }

  // Vérifie les doublons de nom complet DANS le fichier lui-même (avant
  // même la comparaison avec la base) : signale mais ne bloque pas.
  const nameCounts = new Map<string, number>();
  for (const r of rows) nameCounts.set(r.fullName, (nameCounts.get(r.fullName) ?? 0) + 1);
  const duplicates = [...nameCounts.entries()].filter(([, c]) => c > 1);
  if (duplicates.length > 0) {
    console.log(`\n=== ${duplicates.length} nom(s) en double dans le fichier (10 premiers) ===`);
    for (const [name, count] of duplicates.slice(0, 10)) console.log(`  - ${name} (${count}x)`);
  }

  console.log("\n=== Échantillon (5 premières lignes) ===");
  for (const r of rows.slice(0, 5)) {
    console.log(JSON.stringify(r, null, 2));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
