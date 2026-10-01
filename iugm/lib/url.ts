import { headers } from "next/headers";

// Origine absolue du site courant, déduite des en-têtes de la requête (host +
// éventuel en-tête posé par un proxy inverse) — nécessaire pour construire une
// URL complète à encoder dans un QR code : un lien relatif ne veut rien dire
// une fois affiché hors du navigateur (appareil photo d'un téléphone, etc.).
//
// NE JAMAIS l'utiliser pour un lien envoyé par e-mail : l'en-tête Host est
// fourni par le client, un attaquant pourrait faire pointer le lien vers son
// propre site (voir getTrustedAppOrigin).
export async function getAppOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Origine configurée côté serveur, utilisable dans un e-mail : variable APP_URL
// (ex : "https://portail.iugm.mg"), à défaut le domaine de production fourni
// par Vercel. En développement uniquement, on retombe sur la requête courante.
// Renvoie null si rien de fiable n'est disponible : l'appelant n'envoie alors
// pas de lien plutôt que d'en fabriquer un à partir d'un en-tête falsifiable.
export async function getTrustedAppOrigin(): Promise<string | null> {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  if (process.env.NODE_ENV !== "production") return getAppOrigin();
  return null;
}
