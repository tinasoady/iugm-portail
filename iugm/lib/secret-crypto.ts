import crypto from "crypto";

// ---------------------------------------------------------------------------
// Chiffrement du mot de passe initial d'un étudiant (Student.initialPassword) :
// imprimé sur le reçu d'inscription pour être remis en main propre, puis
// effacé dès le premier changement de mot de passe (voir
// changer-mot-de-passe/actions.ts). Entre les deux, le stocker en clair
// exposerait le mot de passe de tous les comptes fraîchement créés en cas de
// fuite de la base — pas seulement leur hash, comme pour passwordHash.
//
// AES-256-GCM (chiffrement authentifié : une valeur altérée est détectée au
// déchiffrement, pas juste mal déchiffrée), clé dérivée d'AUTH_SECRET (seul
// secret déjà disponible côté serveur, voir lib/auth.ts) via scrypt — jamais
// AUTH_SECRET utilisé tel quel comme clé.
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // taille recommandée pour GCM

function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Configuration AUTH_SECRET manquante");
  // Sel fixe : il sépare cet usage des autres dérivations éventuelles
  // d'AUTH_SECRET, il n'a pas besoin d'être secret ni unique en soi.
  return crypto.scryptSync(secret, "iugm-initial-password-v1", 32);
}

// Renvoie "iv:authTag:ciphertext" (chaque partie en base64url)
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64url")).join(":");
}

// Format attendu d'une valeur chiffrée par encryptSecret : trois segments
// base64url séparés par ":". Un mot de passe initial en clair (matricule +
// suffixe généré par generateInitialPassword, ou mot de passe temporaire de
// generatePassword) ne contient jamais ":" — donc une valeur qui ne suit pas
// ce format vient forcément d'un dossier écrit avant l'introduction du
// chiffrement. On la renvoie telle quelle plutôt que de la faire disparaître
// de l'affichage (voir scripts/encrypt-legacy-initial-passwords.ts pour la
// migration qui rattrape ces valeurs).
const CIPHERTEXT_PATTERN = /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/;

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!CIPHERTEXT_PATTERN.test(value)) return value;
  const parts = value.split(":");

  try {
    const [ivB64, tagB64, cipherB64] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(cipherB64, "base64url")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}
