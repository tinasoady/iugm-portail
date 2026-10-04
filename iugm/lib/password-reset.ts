import crypto from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "./prisma";
import { logAction } from "./audit";
import { sendMail, isMailConfigured, isValidEmailAddress } from "./mailer";
import { passwordResetEmail } from "./email-templates";
import { getSettings } from "./settings";
import { validatePasswordStrength } from "./password-policy";
import { normalizeLogin } from "./identifiers";

// ---------------------------------------------------------------------------
// « Mot de passe oublié » : lien à usage unique envoyé par e-mail.
//
// - Le jeton (256 bits aléatoires) n'est jamais stocké : seule son empreinte
//   SHA-256 l'est (voir PasswordResetToken), une fuite de la base ne donne
//   donc aucun lien exploitable.
// - Valable 60 min, une seule utilisation, et un nouveau lien annule les
//   précédents.
// - La réponse à l'utilisateur est identique que le compte existe ou non
//   (pas d'énumération de comptes) : tout est décidé ici, sans rien révéler.
// - Réinitialiser le mot de passe NE désactive PAS la double authentification :
//   quelqu'un qui n'aurait accès qu'à la boîte mail ne passe pas le 2FA.
// ---------------------------------------------------------------------------

export const RESET_TOKEN_VALID_MINUTES = 60;
// Au plus 3 demandes par heure et par compte : évite d'inonder une boîte mail
const MAX_REQUESTS_PER_HOUR = 3;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export type ResetRequestOutcome =
  | { sent: true }
  | { sent: false; reason: "unknown-account" | "inactive" | "no-address" | "throttled" | "no-origin" | "not-configured" | "send-failed" };

// Adresse où envoyer le lien : UNIQUEMENT l'adresse e-mail VÉRIFIÉE du compte, pour
// tous les rôles. L'identifiant de connexion n'est plus une adresse, et l'adresse
// saisie par un agent dans le dossier d'un étudiant n'a jamais été confirmée : une
// faute de frappe y enverrait un lien de réinitialisation à un inconnu, donc la clé
// du compte. Sans adresse vérifiée, la personne s'adresse à l'administration.
export function recipientFor(user: { recoveryEmail?: string | null }): string | null {
  return isValidEmailAddress(user.recoveryEmail) ? user.recoveryEmail : null;
}

type ResetTarget = {
  id: string;
  email: string;
  fullName: string | null;
  active: boolean;
  pendingActivation: boolean;
  recoveryEmail: string | null;
};

const TARGET_SELECT = {
  id: true,
  email: true,
  fullName: true,
  active: true,
  pendingActivation: true,
  recoveryEmail: true,
} as const;

// Comptes visés par une demande. La saisie normale est l'ADRESSE E-MAIL vérifiée du
// compte ; on accepte aussi l'identifiant de connexion (nom d'utilisateur, « prenom.nom »
// ou ancien identifiant étudiant) pour qui ne se souvient que de lui. Plusieurs comptes
// peuvent partager une même adresse (frères et sœurs, par exemple) : chacun reçoit son lien.
async function findTargets(input: string): Promise<ResetTarget[]> {
  return prisma.user.findMany({
    where: {
      OR: [
        { email: input },
        { legacyLogin: input },
        { recoveryEmail: { equals: input, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 10, // borne : une adresse partagée par des dizaines de comptes n'a pas de sens
    select: TARGET_SELECT,
  });
}

// À appeler HORS du chemin de réponse (voir after() dans l'action) : le temps
// de traitement ne doit pas révéler si le compte existe.
export async function requestPasswordReset(
  rawInput: string,
  origin: string | null,
): Promise<ResetRequestOutcome> {
  const input = normalizeLogin(rawInput);
  if (!input) return { sent: false, reason: "unknown-account" };

  const targets = await findTargets(input);
  if (targets.length === 0) return { sent: false, reason: "unknown-account" };

  const outcomes: ResetRequestOutcome[] = [];
  for (const user of targets) outcomes.push(await sendResetLink(user, origin, targets.length > 1));
  return outcomes.find((o) => o.sent) ?? outcomes[0];
}

async function sendResetLink(
  user: ResetTarget,
  origin: string | null,
  shared: boolean,
): Promise<ResetRequestOutcome> {
  // Un compte invité mais pas activé n'a rien à réinitialiser : son lien d'invitation
  // (ou son renvoi par le superadmin) est le seul chemin.
  if (!user.active || user.pendingActivation) return { sent: false, reason: "inactive" };

  const recipient = recipientFor(user);
  if (!recipient) {
    await logAction(
      "PASSWORD_RESET_REQUESTED",
      `Demande pour ${user.email} sans adresse e-mail utilisable — contacter l'administration`,
      user.id,
    );
    return { sent: false, reason: "no-address" };
  }
  if (!origin) return { sent: false, reason: "no-origin" };
  if (!isMailConfigured()) return { sent: false, reason: "not-configured" };

  const since = new Date(Date.now() - 60 * 60_000);
  const recent = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: since } },
  });
  if (recent >= MAX_REQUESTS_PER_HOUR) return { sent: false, reason: "throttled" };

  // Ménage opportuniste (pas de tâche planifiée dans ce projet)
  await purgeExpiredResetTokens().catch(() => {});

  const token = crypto.randomBytes(32).toString("base64url");
  const created = await prisma.$transaction(async (tx) => {
    // Un nouveau lien annule les précédents non utilisés. On les marque comme
    // utilisés plutôt que de les supprimer : leurs lignes servent au comptage
    // des demandes de l'heure (limite ci-dessus).
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_VALID_MINUTES * 60_000),
      },
    });
  });

  const settings = await getSettings();
  const email = passwordResetEmail(
    {
      institutionName: settings.institutionName,
      institutionAcronym: settings.institutionAcronym,
      portalUrl: origin,
    },
    {
      fullName: user.fullName,
      // Le nom d'utilisateur n'est rappelé que si l'adresse est partagée : il faut alors
      // savoir quel lien correspond à quel compte
      username: shared ? user.email : null,
      resetUrl: `${origin}/reinitialiser-mot-de-passe?token=${encodeURIComponent(token)}`,
      validForMinutes: RESET_TOKEN_VALID_MINUTES,
    },
  );
  const result = await sendMail({ to: recipient, ...email });
  if (!result.ok) {
    // Lien inutilisable puisque jamais reçu : on ne laisse pas traîner le jeton
    await prisma.passwordResetToken.delete({ where: { id: created.id } }).catch(() => {});
    await logAction(
      "NOTIFICATION_FAILED",
      `Échec d'envoi du lien de réinitialisation à ${user.email} : ${result.error}`,
      user.id,
    );
    return { sent: false, reason: "send-failed" };
  }

  await logAction("PASSWORD_RESET_REQUESTED", `Lien de réinitialisation envoyé pour ${user.email}`, user.id);
  return { sent: true };
}

// Le jeton est-il (encore) utilisable ? Sert à choisir entre le formulaire et
// un message d'erreur sur la page de réinitialisation.
export async function isResetTokenUsable(token: string): Promise<boolean> {
  if (!token) return false;
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { usedAt: true, expiresAt: true },
  });
  return Boolean(row && !row.usedAt && row.expiresAt > new Date());
}

export type ResetResult = { ok: true } | { ok: false; error: string };

const INVALID_LINK_ERROR = "Ce lien est invalide ou a expiré. Refaites une demande de réinitialisation.";

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<ResetResult> {
  if (!token) return { ok: false, error: INVALID_LINK_ERROR };

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          active: true,
          studentFile: { select: { id: true, matricule: true } },
        },
      },
    },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date() || !row.user.active) {
    return { ok: false, error: INVALID_LINK_ERROR };
  }

  const weakness = validatePasswordStrength(newPassword, {
    email: row.user.email,
    matricule: row.user.studentFile?.matricule,
  });
  if (weakness) return { ok: false, error: weakness };

  const passwordHash = await bcrypt.hash(newPassword, 10);

  const used = await prisma.$transaction(async (tx) => {
    // Revendication atomique : si deux requêtes présentent le même lien, une seule l'emporte
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return false;

    await tx.user.update({
      where: { id: row.user.id },
      // sessionsValidAfter : toutes les sessions ouvertes (dont celle d'un
      // éventuel intrus) sont fermées ; mustChangePassword levé puisque
      // l'intéressé vient de choisir lui-même son mot de passe.
      data: { passwordHash, mustChangePassword: false, sessionsValidAfter: new Date() },
    });
    if (row.user.studentFile) {
      await tx.student.update({
        where: { id: row.user.studentFile.id },
        data: { initialPassword: null },
      });
    }
    // Les autres liens en attente n'ont plus lieu d'être
    await tx.passwordResetToken.updateMany({
      where: { userId: row.user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return true;
  });
  if (!used) return { ok: false, error: INVALID_LINK_ERROR };

  await logAction(
    "PASSWORD_RESET_COMPLETED",
    `Mot de passe réinitialisé par lien e-mail pour ${row.user.email}`,
    row.user.id,
  );
  return { ok: true };
}

// Ménage opportuniste des jetons périmés ou utilisés depuis plus d'un jour
export async function purgeExpiredResetTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
  const { count } = await prisma.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] },
  });
  return count;
}
