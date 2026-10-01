import crypto from "crypto";

// ---------------------------------------------------------------------------
// TOTP (RFC 6238) / HOTP (RFC 4226), sans dépendance : compatible avec Google
// Authenticator, Microsoft Authenticator, Authy, FreeOTP, etc. (SHA-1, 6
// chiffres, pas de 30 s — les valeurs par défaut de toutes ces applications).
// Fonctions pures : aucune lecture de la base ni de l'horloge cachée, pour
// pouvoir les tester avec les vecteurs officiels des RFC.
// ---------------------------------------------------------------------------

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

// Décode du base32 (insensible à la casse, espaces et "=" ignorés). Renvoie
// null si un caractère n'appartient pas à l'alphabet.
export function base32Decode(input: string): Buffer | null {
  const clean = input.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// Secret de 160 bits (taille recommandée par la RFC 4226 pour HMAC-SHA1)
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

// HOTP : HMAC-SHA1 du compteur (64 bits big-endian), troncature dynamique
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

// Numéro du pas de 30 s correspondant à un instant (ms Unix)
export function totpStep(nowMs: number, stepSeconds = TOTP_STEP_SECONDS): number {
  return Math.floor(nowMs / 1000 / stepSeconds);
}

export function totpAt(secretBase32: string, nowMs: number): string {
  const secret = base32Decode(secretBase32);
  if (!secret || secret.length === 0) throw new Error("Secret TOTP invalide");
  return hotp(secret, totpStep(nowMs));
}

export type VerifyTotpOptions = {
  nowMs?: number;
  // Tolérance en pas de 30 s de chaque côté (dérive d'horloge du téléphone)
  window?: number;
  // Dernier pas déjà accepté : un code de ce pas ou d'un pas antérieur est
  // refusé, pour qu'un code observé (épaule, hameçonnage) ne serve qu'une fois.
  lastStep?: number | null;
};

// Renvoie le pas validé si le code est correct et neuf, sinon null.
export function verifyTotp(
  secretBase32: string,
  code: string,
  { nowMs = Date.now(), window = 1, lastStep = null }: VerifyTotpOptions = {},
): number | null {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) return null;
  const secret = base32Decode(secretBase32);
  if (!secret || secret.length === 0) return null;

  const current = totpStep(nowMs);
  let matched: number | null = null;
  // On parcourt toute la fenêtre sans court-circuit : la durée de la
  // vérification ne dépend pas de la position du pas valide.
  for (let step = current - window; step <= current + window; step++) {
    if (step < 0) continue;
    const expected = Buffer.from(hotp(secret, step));
    const given = Buffer.from(code);
    if (crypto.timingSafeEqual(expected, given) && (lastStep === null || step > lastStep)) {
      if (matched === null || step > matched) matched = step;
    }
  }
  return matched;
}

// URI otpauth:// lue par les applications d'authentification (via QR code)
export function buildOtpAuthUri(params: {
  issuer: string;
  account: string;
  secret: string;
}): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.account)}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

// Diagnostic de configuration : le code saisi est-il celui d'un autre moment que
// maintenant ? Renvoie le décalage en secondes (négatif : l'appareil retarde,
// positif : il avance) si le code correspond à l'un des pas voisins, sinon null.
// À n'utiliser que pour aider quelqu'un qui configure SON propre secret : sur la
// connexion, indiquer qu'un code était « valide mais à un autre moment » serait
// une information inutile à un attaquant.
export function findTotpOffsetSeconds(
  secretBase32: string,
  code: string,
  { nowMs = Date.now(), maxSteps = 20 }: { nowMs?: number; maxSteps?: number } = {},
): number | null {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) return null;
  const secret = base32Decode(secretBase32);
  if (!secret || secret.length === 0) return null;

  const current = totpStep(nowMs);
  for (let offset = 1; offset <= maxSteps; offset++) {
    for (const sign of [-1, 1]) {
      const step = current + sign * offset;
      if (step >= 0 && hotp(secret, step) === code) return sign * offset * TOTP_STEP_SECONDS;
    }
  }
  return null;
}
