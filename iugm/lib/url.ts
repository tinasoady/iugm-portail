import { headers } from "next/headers";

// Origine absolue du site courant, déduite des en-têtes de la requête (host +
// éventuel en-tête posé par un proxy inverse) — nécessaire pour construire une
// URL complète à encoder dans un QR code : un lien relatif ne veut rien dire
// une fois affiché hors du navigateur (appareil photo d'un téléphone, etc.).
export async function getAppOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
