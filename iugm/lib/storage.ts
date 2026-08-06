import { put, del } from "@vercel/blob";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Stockage de fichiers (logo, photos de profil) sur Vercel Blob : le disque
// serveur de Vercel étant en lecture seule et éphémère (environnement
// serverless), il n'était pas possible d'écrire durablement sous
// public/uploads en production. Les mêmes signatures que la version
// précédente sont conservées, donc aucun appelant n'a besoin de changer.
// ---------------------------------------------------------------------------

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export type StoredFile = { url: string };

// Enregistre un fichier envoyé par un utilisateur sous un nom aléatoire
// et renvoie l'URL publique Vercel Blob à stocker en base.
export async function saveUploadedFile(
  buffer: Buffer,
  mimeType: string,
  subdir: string,
): Promise<StoredFile> {
  const extension = EXTENSION_BY_MIME[mimeType];
  if (!extension) throw new Error(`Type de fichier non supporté : ${mimeType}`);

  const filename = `${subdir}/${crypto.randomUUID()}.${extension}`;
  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
  });

  return { url: blob.url };
}

// Supprime un fichier précédemment enregistré sur Vercel Blob, à partir de
// l'URL stockée en base. Tolérant : une URL absente, ou une ancienne URL
// locale ("/uploads/...") d'avant la migration, est simplement ignorée.
export async function deleteUploadedFile(url: string | null | undefined): Promise<void> {
  if (!url || !url.includes(".public.blob.vercel-storage.com/")) return;

  await del(url).catch(() => {
    // fichier déjà absent : sans incidence
  });
}