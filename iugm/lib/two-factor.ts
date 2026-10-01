import crypto from "crypto";

import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./secret-crypto";
import { generateTotpSecret, verifyTotp, buildOtpAuthUri, findTotpOffsetSeconds } from "./totp";

// ---------------------------------------------------------------------------
// Authentification à deux facteurs : configuration, vérification à la
// connexion, codes de secours, désactivation. Les fonctions pures (calcul du
// code) vivent dans lib/totp.ts ; ici, tout ce qui touche à la base.
// ---------------------------------------------------------------------------

export const TWO_FACTOR_ISSUER = "Portail IUGM";
export const RECOVERY_CODE_COUNT = 8;

// Alphabet sans caractères ambigus (0/O, 1/I/L) : 31 symboles, soit environ
// 49 bits d'entropie pour un code de 10 caractères
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_CODE_LENGTH = 10;

// Le 2FA est proposé au personnel (superadmin et agents), pas aux étudiants.
export function canUseTwoFactor(role: string): boolean {
  return role === "SUPERADMIN" || role === "AGENT_ADMINISTRATION" || role === "AGENT_PEDAGOGIQUE";
}

// Normalise ce que l'utilisateur a saisi : espaces et tirets retirés,
// majuscules (les codes de secours sont affichés "XXXXX-XXXXX").
export function normalizeTwoFactorInput(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

function hashRecoveryCode(normalized: string): string {
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    let raw = "";
    for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
      raw += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    }
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export type TwoFactorSetup = { secret: string; otpAuthUri: string };

// Étape 1 : génère un secret et le stocke (chiffré) SANS activer le 2FA.
// Tant que l'utilisateur n'a pas prouvé qu'il sait produire un code valide
// (confirmTwoFactorSetup), le compte reste protégé par le mot de passe seul —
// jamais verrouillé par un secret que personne n'a pu enregistrer.
export async function beginTwoFactorSetup(userId: string): Promise<TwoFactorSetup> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true, totpEnabled: true },
  });
  if (!user) throw new Error("Compte introuvable.");
  if (!canUseTwoFactor(user.role)) {
    throw new Error("L'authentification à deux facteurs n'est pas disponible pour ce compte.");
  }
  if (user.totpEnabled) throw new Error("L'authentification à deux facteurs est déjà activée.");

  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: encryptSecret(secret) } });
  return {
    secret,
    otpAuthUri: buildOtpAuthUri({ issuer: TWO_FACTOR_ISSUER, account: user.email, secret }),
  };
}

// Message d'aide quand le code saisi à la configuration est refusé : distingue un
// appareil mal réglé (le code est exact, mais d'un autre moment) d'une entrée
// qui n'est pas celle de ce QR code (ancien essai du même nom, autre compte).
export function explainRejectedSetupCode(secret: string, code: string): string {
  const offset = findTotpOffsetSeconds(secret, code);
  if (offset !== null) {
    const minutes = Math.round(Math.abs(offset) / 60);
    const gap = Math.abs(offset) >= 90 ? `environ ${minutes} minute(s)` : `${Math.abs(offset)} secondes`;
    const who = offset < 0 ? "retarde" : "avance";
    return `Ce code est exact, mais l'horloge de votre téléphone (ou du serveur) ${who} de ${gap}. Activez l'heure automatique sur le téléphone, puis réessayez avec le code affiché à cet instant.`;
  }
  return "Code incorrect ou expiré. Vérifiez que vous lisez l'entrée de l'application qui correspond à CE QR code (supprimez les anciennes entrées « Portail IUGM » d'essais précédents), et que l'heure du téléphone est automatique.";
}

// Étape 2 : l'utilisateur saisit le code affiché par son application. S'il est
// bon, le 2FA est activé et les codes de secours sont générés (renvoyés une
// seule fois, en clair — seules leurs empreintes sont conservées).
export async function confirmTwoFactorSetup(
  userId: string,
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user?.totpSecret) {
    return { ok: false, error: "Aucune configuration en cours : recommencez." };
  }
  if (user.totpEnabled) return { ok: false, error: "Déjà activée." };

  const secret = decryptSecret(user.totpSecret);
  if (!secret) {
    // La clé enregistrée est illisible (AUTH_SECRET modifiée depuis, ou valeur corrompue)
    return {
      ok: false,
      error: "La clé de configuration est illisible. Cliquez de nouveau sur « Activer la double authentification » pour en générer une nouvelle, puis rescannez le QR code.",
    };
  }
  const normalized = normalizeTwoFactorInput(code);
  const step = verifyTotp(secret, normalized);
  if (step === null) return { ok: false, error: explainRejectedSetupCode(secret, normalized) };

  const recoveryCodes = generateRecoveryCodes();
  // Compare-and-set sur totpEnabled=false : deux confirmations simultanées ne
  // génèrent pas deux jeux de codes de secours dont l'un serait déjà perdu.
  const updated = await prisma.user.updateMany({
    where: { id: userId, totpEnabled: false },
    data: {
      totpEnabled: true,
      totpLastStep: step,
      recoveryCodes: recoveryCodes.map((c) => hashRecoveryCode(normalizeTwoFactorInput(c))),
    },
  });
  if (updated.count !== 1) return { ok: false, error: "Déjà activée." };
  return { ok: true, recoveryCodes };
}

// Vérifie le second facteur à la connexion : code TOTP (6 chiffres) ou code de
// secours (usage unique). Chaque code n'est accepté qu'une fois, même si deux
// requêtes le présentent en même temps (mise à jour conditionnelle en base).
export async function verifyTwoFactorLogin(
  userId: string,
  rawCode: string,
): Promise<{ ok: true; usedRecoveryCode: boolean } | { ok: false }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true, totpLastStep: true },
  });
  if (!user?.totpEnabled || !user.totpSecret) return { ok: false };

  const code = normalizeTwoFactorInput(rawCode);

  if (/^\d{6}$/.test(code)) {
    const secret = decryptSecret(user.totpSecret);
    if (!secret) return { ok: false };
    const step = verifyTotp(secret, code, { lastStep: user.totpLastStep });
    if (step === null) return { ok: false };
    const claimed = await prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: { totpLastStep: step },
    });
    return claimed.count === 1 ? { ok: true, usedRecoveryCode: false } : { ok: false };
  }

  if (new RegExp(`^[${RECOVERY_ALPHABET}]{${RECOVERY_CODE_LENGTH}}$`).test(code)) {
    // array_remove + condition = ANY : retrait atomique, un code de secours
    // présenté deux fois en parallèle n'est accepté qu'une seule.
    const hash = hashRecoveryCode(code);
    const removed = await prisma.$executeRaw`
      UPDATE "User"
      SET "recoveryCodes" = array_remove("recoveryCodes", ${hash})
      WHERE "id" = ${userId} AND ${hash} = ANY("recoveryCodes")
    `;
    return removed === 1 ? { ok: true, usedRecoveryCode: true } : { ok: false };
  }

  return { ok: false };
}

export async function countRecoveryCodes(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { recoveryCodes: true },
  });
  return user?.recoveryCodes.length ?? 0;
}

// Nouveau jeu de codes de secours (remplace tous les précédents)
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  const updated = await prisma.user.updateMany({
    where: { id: userId, totpEnabled: true },
    data: { recoveryCodes: codes.map((c) => hashRecoveryCode(normalizeTwoFactorInput(c))) },
  });
  if (updated.count !== 1) throw new Error("L'authentification à deux facteurs n'est pas activée.");
  return codes;
}

// Désactive le 2FA et efface tout ce qui s'y rapporte. Les contrôles
// d'autorisation (mot de passe de l'intéressé, ou rôle superadmin) sont à la
// charge de l'appelant.
export async function disableTwoFactor(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, totpLastStep: null, recoveryCodes: [] },
  });
}
