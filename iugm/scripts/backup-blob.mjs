// Stockage des sauvegardes chiffrées dans Vercel Blob (utilisé par le workflow
// .github/workflows/backup.yml, et à la main pour consulter ou récupérer).
//
//   node scripts/backup-blob.mjs upload <fichier.dump.enc>   envoie, vérifie la taille, purge les anciennes
//   node scripts/backup-blob.mjs list                        liste les sauvegardes (date, taille)
//   node scripts/backup-blob.mjs download <sortie> [chemin]  télécharge la plus récente (ou le chemin donné)
//
// Jeton : variable BACKUP_BLOB_TOKEN (ou, à défaut, BLOB_READ_WRITE_TOKEN).
//
// ⚠ Le magasin Blob du projet est PUBLIC : toute sauvegarde y est joignable par son
// adresse. Elle n'y est donc déposée que CHIFFRÉE (AES-256, phrase aléatoire), sous
// un nom à suffixe aléatoire, et l'adresse n'est jamais affichée dans les journaux.
// Voir docs/SAUVEGARDE.md pour passer à un magasin privé.
import fs from "node:fs";
import path from "node:path";
import { put, list, del, head } from "@vercel/blob";

const PREFIX = "backups/iugm/";
// 0 est une valeur légitime (purge maximale, dans la limite du filet ci-dessous) : on ne
// remplace par la valeur par défaut que si la variable est absente ou invalide.
const requestedDays = process.env.BACKUP_KEEP_DAYS === undefined ? Number.NaN : Number(process.env.BACKUP_KEEP_DAYS);
const KEEP_DAYS = Number.isFinite(requestedDays) && requestedDays >= 0 ? requestedDays : 35;
// Filet de sécurité : la purge ne descend jamais sous ce nombre de sauvegardes,
// même si l'horloge ou les dates étaient fausses.
const KEEP_AT_LEAST = 7;

const token = process.env.BACKUP_BLOB_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("Jeton manquant : définissez BACKUP_BLOB_TOKEN.");
  process.exit(2);
}

async function allBackups() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, token, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs.sort((a, b) => b.uploadedAt - a.uploadedAt); // plus récente d'abord
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} Mo`;

async function upload(file) {
  if (!file || !fs.existsSync(file)) throw new Error(`Fichier introuvable : ${file}`);
  const body = fs.readFileSync(file);
  if (body.length === 0) throw new Error("Fichier vide : rien n'est envoyé.");

  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const pathname = `${PREFIX}${now.getUTCFullYear()}/${month}/iugm-${stamp}.dump.enc`;

  const blob = await put(pathname, body, {
    access: "public",
    token,
    addRandomSuffix: true,
    contentType: "application/octet-stream",
  });

  // Relecture : l'objet existe et a exactement la taille du fichier envoyé
  const meta = await head(blob.url, { token });
  if (meta.size !== body.length) {
    throw new Error(`Taille distante (${meta.size}) différente de la taille locale (${body.length}).`);
  }
  console.log(`Sauvegarde envoyée : ${blob.pathname} (${mb(body.length)})`);

  // Purge : au-delà de KEEP_DAYS jours, en gardant toujours au moins KEEP_AT_LEAST sauvegardes
  const backups = await allBackups();
  const cutoff = Date.now() - KEEP_DAYS * 24 * 3600_000;
  const candidates = backups.slice(KEEP_AT_LEAST).filter((b) => b.uploadedAt.getTime() < cutoff);
  if (candidates.length > 0) {
    await del(candidates.map((b) => b.url), { token });
    for (const b of candidates) console.log(`  ancienne sauvegarde supprimée : ${b.pathname}`);
  }
  console.log(`${backups.length - candidates.length} sauvegarde(s) conservée(s) (${KEEP_DAYS} jours).`);
}

async function show() {
  const backups = await allBackups();
  if (backups.length === 0) return console.log("Aucune sauvegarde.");
  for (const b of backups) {
    console.log(`${b.uploadedAt.toISOString()}  ${mb(b.size).padStart(10)}  ${b.pathname}`);
  }
}

async function download(output, wanted) {
  if (!output) throw new Error("Usage : download <fichier de sortie> [chemin]");
  const backups = await allBackups();
  const target = wanted ? backups.find((b) => b.pathname === wanted) : backups[0];
  if (!target) throw new Error(wanted ? `Sauvegarde introuvable : ${wanted}` : "Aucune sauvegarde.");
  const response = await fetch(target.url);
  if (!response.ok) throw new Error(`Téléchargement refusé (HTTP ${response.status}).`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length !== target.size) {
    throw new Error(`Téléchargement incomplet : ${data.length} octets sur ${target.size}.`);
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, data);
  console.log(`Téléchargé : ${target.pathname} (${mb(data.length)}) → ${output}`);
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "upload") await upload(args[0]);
  else if (command === "list") await show();
  else if (command === "download") await download(args[0], args[1]);
  else {
    console.error("Usage : upload <fichier> | list | download <sortie> [chemin]");
    process.exit(2);
  }
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
