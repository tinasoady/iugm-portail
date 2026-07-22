import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Stockage de fichiers (logo, photos de profil) sur le disque du serveur,
// sous public/uploads — servi directement par Next.js (fichier statique,
// avec ses en-têtes de cache), plutôt qu'en base64 dans PostgreSQL : la base
// ne gonfle plus, et chaque affichage d'avatar ne fait plus un aller-retour
// SQL pour récupérer une image entière.
//
// Implémentée comme une petite façade (saveUploadedFile / deleteUploadedFile)
// pour que les appelants ne connaissent jamais le mécanisme de stockage :
// migrer plus tard vers un stockage objet (S3, R2, Vercel Blob) pour un
// déploiement multi-instances/serverless ne changera que ce fichier.
// ---------------------------------------------------------------------------

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const URL_PREFIX = "/uploads";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export type StoredFile = { url: string };

// Enregistre un fichier envoyé par un utilisateur sous un nom aléatoire
// (jamais le nom d'origine, ni un nom dérivé d'une entrée utilisateur : ça
// évite tout risque de traversée de chemin ou de collision) et renvoie l'URL
// publique à stocker en base (ex: "/uploads/avatars/<uuid>.jpg").
export async function saveUploadedFile(
  buffer: Buffer,
  mimeType: string,
  subdir: string,
): Promise<StoredFile> {
  const extension = EXTENSION_BY_MIME[mimeType];
  if (!extension) throw new Error(`Type de fichier non supporté : ${mimeType}`);

  const dir = path.join(UPLOAD_ROOT, subdir);
  await mkdir(dir, { recursive: true });
  const filename = `${crypto.randomUUID()}.${extension}`;
  await writeFile(path.join(dir, filename), buffer);

  return { url: `${URL_PREFIX}/${subdir}/${filename}` };
}

// Supprime un fichier précédemment enregistré, à partir de l'URL stockée en
// base. Tolérant : une URL absente, déjà supprimée, ou qui ne pointe pas vers
// notre dossier d'uploads (ex. une ancienne data URL avant migration) est
// simplement ignorée plutôt que de faire échouer l'opération appelante.
export async function deleteUploadedFile(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith(`${URL_PREFIX}/`)) return;

  const relative = url.slice(URL_PREFIX.length + 1);
  // Neutralise toute tentative de sortir du dossier uploads (ex: "../../etc")
  const safeSegments = relative.split("/").filter((seg) => seg && seg !== "..");
  if (safeSegments.length === 0) return;

  await unlink(path.join(UPLOAD_ROOT, ...safeSegments)).catch(() => {
    // fichier déjà absent : sans incidence
  });
}
