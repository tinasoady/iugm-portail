import crypto from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "./prisma";
import { logAction } from "./audit";
import {
  sendMail,
  isMailConfigured,
  isValidEmailAddress,
  explainMailError,
} from "./mailer";
import {
  recoveryEmailConfirmationEmail,
  recoveryEmailChangedNotice,
  type Branding,
} from "./email-templates";
import { getSettings } from "./settings";

// ---------------------------------------------------------------------------
// Adresse e-mail VÉRIFIÉE d'un compte (personnel ou étudiant).
//
// L'identifiant de connexion n'est plus une adresse e-mail : l'adresse réelle est
// un champ à part, qui reçoit le lien « mot de passe oublié ». Le personnel la
// fournit à son invitation (voir lib/invitations.ts) ; les étudiants l'ajoutent
// depuis Mon compte après leur première connexion. Ce module sert à la CHANGER
// (ou à l'ajouter) ensuite, avec la même vérification.
//
// Sécurité :
//  - on ne l'enregistre qu'APRÈS vérification : un lien est envoyé à la nouvelle
//    adresse, et seule l'ouverture de ce lien la rend effective. Sans cela,
//    une session laissée ouverte permettrait de rediriger les futures
//    réinitialisations vers la boîte d'un tiers ;
//  - la demande exige le mot de passe actuel ;
//  - l'ancienne adresse est prévenue de tout remplacement ou retrait ;
//  - jeton de 256 bits, empreinte seule stockée, usage unique, 24 h.
// ---------------------------------------------------------------------------

export const RECOVERY_TOKEN_VALID_HOURS = 24;
const MAX_REQUESTS_PER_HOUR = 5;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// « jean.rakoto@gmail.com » → « j***o@gmail.com » : assez pour reconnaître son
// adresse, pas assez pour la livrer à quelqu'un qui regarde l'écran.
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : "";
  return `${head}***${tail}@${domain}`;
}

async function getBranding(origin: string | null): Promise<Branding> {
  const settings = await getSettings();
  return {
    institutionName: settings.institutionName,
    institutionAcronym: settings.institutionAcronym,
    portalUrl: origin,
  };
}

export type RequestResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string; hint?: string };

export async function requestRecoveryEmail(params: {
  userId: string;
  newEmail: string;
  password: string;
  origin: string | null;
}): Promise<RequestResult> {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { fullName: true, active: true, passwordHash: true, recoveryEmail: true },
  });
  if (!user || !user.active) return { ok: false, error: "Compte introuvable." };

  if (!params.password || !(await bcrypt.compare(params.password, user.passwordHash))) {
    return { ok: false, error: "Mot de passe incorrect." };
  }

  const newEmail = params.newEmail.trim().toLowerCase();
  if (!isValidEmailAddress(newEmail)) return { ok: false, error: "Adresse e-mail invalide." };
  if (newEmail === user.recoveryEmail) {
    return { ok: false, error: "C'est déjà votre adresse de récupération." };
  }

  if (!isMailConfigured()) {
    return {
      ok: false,
      error: "L'envoi d'e-mails n'est pas configuré sur ce portail : impossible de vérifier cette adresse.",
      hint: "Demandez au superadmin de configurer l'envoi (Paramètres → Envoi d'e-mails).",
    };
  }
  if (!params.origin) {
    return {
      ok: false,
      error: "L'adresse publique du portail est inconnue : impossible d'écrire le lien de confirmation.",
      hint: "Le superadmin doit définir la variable APP_URL.",
    };
  }

  const since = new Date(Date.now() - 60 * 60_000);
  const recent = await prisma.recoveryEmailToken.count({
    where: { userId: params.userId, createdAt: { gte: since } },
  });
  if (recent >= MAX_REQUESTS_PER_HOUR) {
    return { ok: false, error: "Trop de demandes récentes. Réessayez dans une heure." };
  }

  // Ménage opportuniste (pas de tâche planifiée dans ce projet)
  await purgeExpiredRecoveryTokens().catch(() => {});

  const token = crypto.randomBytes(32).toString("base64url");
  const created = await prisma.$transaction(async (tx) => {
    // Une nouvelle demande annule les précédentes en attente (marquées utilisées
    // plutôt que supprimées : elles servent au comptage ci-dessus)
    await tx.recoveryEmailToken.updateMany({
      where: { userId: params.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return tx.recoveryEmailToken.create({
      data: {
        userId: params.userId,
        newEmail,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RECOVERY_TOKEN_VALID_HOURS * 3600_000),
      },
    });
  });

  const email = recoveryEmailConfirmationEmail(await getBranding(params.origin), {
    fullName: user.fullName,
    confirmUrl: `${params.origin}/confirmer-adresse?token=${encodeURIComponent(token)}`,
    validForHours: RECOVERY_TOKEN_VALID_HOURS,
  });
  const result = await sendMail({ to: newEmail, ...email });
  if (!result.ok) {
    await prisma.recoveryEmailToken.delete({ where: { id: created.id } }).catch(() => {});
    await logAction(
      "NOTIFICATION_FAILED",
      `Échec d'envoi du lien de confirmation d'adresse de récupération (${maskEmail(newEmail)}) : ${result.error}`,
      params.userId,
    );
    return {
      ok: false,
      error: "Le message de confirmation n'a pas pu être envoyé à cette adresse.",
      hint: explainMailError(result.error, result.code) ?? "Vérifiez l'adresse saisie, puis réessayez.",
    };
  }

  await logAction(
    "RECOVERY_EMAIL_REQUESTED",
    `Vérification de l'adresse de récupération ${maskEmail(newEmail)} demandée`,
    params.userId,
  );
  return { ok: true, sentTo: newEmail };
}

// Le jeton est-il utilisable ? Renvoie l'adresse (masquée) qu'il confirmerait.
export async function inspectRecoveryToken(
  token: string,
): Promise<{ usable: false } | { usable: true; maskedEmail: string }> {
  if (!token) return { usable: false };
  const row = await prisma.recoveryEmailToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { newEmail: true, usedAt: true, expiresAt: true, user: { select: { active: true } } },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date() || !row.user.active) {
    return { usable: false };
  }
  return { usable: true, maskedEmail: maskEmail(row.newEmail) };
}

export type ConfirmResult = { ok: true; maskedEmail: string } | { ok: false; error: string };

const INVALID_LINK_ERROR = "Ce lien est invalide ou a expiré. Refaites la demande depuis « Mon compte ».";

export async function confirmRecoveryEmail(token: string): Promise<ConfirmResult> {
  if (!token) return { ok: false, error: INVALID_LINK_ERROR };

  const row = await prisma.recoveryEmailToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, fullName: true, active: true, recoveryEmail: true } } },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date() || !row.user.active) {
    return { ok: false, error: INVALID_LINK_ERROR };
  }

  const previous = row.user.recoveryEmail;
  const applied = await prisma.$transaction(async (tx) => {
    // Revendication atomique : si le lien est ouvert deux fois en même temps
    // (double clic, antivirus de messagerie), une seule application l'emporte.
    const claimed = await tx.recoveryEmailToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: row.user.id }, data: { recoveryEmail: row.newEmail } });
    await tx.recoveryEmailToken.updateMany({
      where: { userId: row.user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return true;
  });
  if (!applied) return { ok: false, error: INVALID_LINK_ERROR };

  await logAction(
    "RECOVERY_EMAIL_CONFIRMED",
    `Adresse de récupération confirmée : ${maskEmail(row.newEmail)}`,
    row.user.id,
  );

  // L'ancienne adresse est prévenue : si ce n'est pas voulu, c'est une alerte
  if (previous && previous !== row.newEmail && isMailConfigured()) {
    const notice = recoveryEmailChangedNotice(await getBranding(null), {
      fullName: row.user.fullName,
      change: "replaced",
      newEmailMasked: maskEmail(row.newEmail),
    });
    await sendMail({ to: previous, ...notice }).catch(() => {});
  }

  return { ok: true, maskedEmail: maskEmail(row.newEmail) };
}

export type RemoveResult = { ok: true } | { ok: false; error: string };

// Retire l'adresse de récupération : les réinitialisations repartent vers
// l'identifiant du compte. Exige le mot de passe, prévient l'ancienne adresse.
export async function removeRecoveryEmail(userId: string, password: string): Promise<RemoveResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, active: true, passwordHash: true, recoveryEmail: true },
  });
  if (!user || !user.active) return { ok: false, error: "Compte introuvable." };
  if (!user.recoveryEmail) return { ok: false, error: "Aucune adresse de récupération à retirer." };
  if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
    return { ok: false, error: "Mot de passe incorrect." };
  }

  const previous = user.recoveryEmail;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { recoveryEmail: null } }),
    // Plus aucune demande de confirmation en attente ne doit pouvoir la rétablir
    prisma.recoveryEmailToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
  await logAction("RECOVERY_EMAIL_REMOVED", `Adresse de récupération ${maskEmail(previous)} retirée`, userId);

  if (isMailConfigured()) {
    const notice = recoveryEmailChangedNotice(await getBranding(null), {
      fullName: user.fullName,
      change: "removed",
    });
    await sendMail({ to: previous, ...notice }).catch(() => {});
  }
  return { ok: true };
}

// Jetons périmés depuis plus d'un jour, ou utilisés depuis plus d'un jour
export async function purgeExpiredRecoveryTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const { count } = await prisma.recoveryEmailToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] },
  });
  return count;
}
