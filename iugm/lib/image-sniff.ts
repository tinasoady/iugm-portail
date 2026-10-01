// Contrôle du CONTENU réel d'une image envoyée (photo de profil, logo) : le type
// déclaré par le navigateur (`file.type`) est fourni par le client et ne prouve
// rien. On lit donc les premiers octets (signature du format).

export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buffer: Uint8Array, bytes: number[], offset = 0): boolean {
  return bytes.every((b, i) => buffer[offset + i] === b);
}

// Renvoie le format réellement détecté, ou null s'il ne s'agit d'aucun format accepté.
export function detectImageType(buffer: Uint8Array): ImageMime | null {
  if (buffer.length >= 8 && startsWith(buffer, PNG_SIGNATURE)) return "image/png";
  if (buffer.length >= 3 && startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // WebP : "RIFF" + taille (4 octets) + "WEBP"
  if (
    buffer.length >= 12 &&
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

// Un SVG est du XML pouvant contenir des scripts. Affiché via <img> ils ne
// s'exécutent pas, mais le fichier est aussi joignable directement par son
// adresse : on refuse tout SVG qui contient un élément ou un attribut actif.
const UNSAFE_SVG_PATTERNS = [
  /<\s*script/i,
  /<\s*foreignObject/i,
  /<\s*iframe/i,
  /<\s*embed/i,
  /<\s*object/i,
  /\bon[a-z]+\s*=/i, // onload=, onclick=...
  /javascript\s*:/i,
  /data\s*:\s*text\/html/i,
  /<!ENTITY/i, // entités externes (XXE, « billion laughs »)
  /xlink:href\s*=\s*["']\s*(?!#)[a-z]+:/i, // références externes
];

export function isSafeSvg(buffer: Uint8Array): boolean {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!/<\s*svg[\s>]/i.test(text)) return false;
  return !UNSAFE_SVG_PATTERNS.some((pattern) => pattern.test(text));
}

// Type effectif d'un fichier image accepté, ou null (à refuser). `allowSvg` :
// réservé au logo de l'établissement, que seul le superadmin peut envoyer.
export function resolveImageType(
  buffer: Uint8Array,
  { allowSvg = false }: { allowSvg?: boolean } = {},
): ImageMime | null {
  const detected = detectImageType(buffer);
  if (detected) return detected;
  if (allowSvg && isSafeSvg(buffer)) return "image/svg+xml";
  return null;
}
