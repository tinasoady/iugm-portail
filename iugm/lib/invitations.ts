import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { logAction } from "./audit";
import { sendMail, isMailConfigured, isValidEmailAddress, explainMailError } from "./mailer";
import { invitationEmail, type Branding } from "./email-templates";
import { getSettings } from "./settings";
import { tasksForRole } from "./permissions";
import { validatePasswordStrength } from "./password-policy";
import { validateUsername, normalizeLogin, isLoginTaken } from "./identifiers";
import { maskEmail } from "./recovery-email";

// ---------------------------------------------------------------------------
// Comptes du PERSONNEL : création par invitation.
//
// Le superadmin saisit un nom d'utilisateur, un nom complet, un rôle et une
// adresse e-mail OBLIGATOIRE. Le compte est créé « en attente », sans mot de passe
// utilisable ; un lien d'activation part à cette adresse. L'ouvrir prouve que la
// personne en a la boîte ; elle y choisit elle-même son mot de passe — personne
// d'autre n'en connaît jamais aucun, il n'existe pas de mot de passe provisoire.
//
// Jeton : 256 bits, seule l'empreinte SHA-256 est stockée, usage unique, 72 h,
// renvoyable (le renvoi annule le lien précédent).
// ---------------------------------------------------------------------------

export const INVITATION_VALID_HOURS = 72;
const MAX_INVITATIONS_PER_HOUR = 5;

export const STAFF_ROLES = ["SUPERADMIN", "AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  SUPERADMIN: "Super administrateur",
  AGENT_ADMINISTRATION: "Agent d'administration",
  AGENT_PEDAGOGIQUE: "Agent pédagogique",
};

function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function getBranding(origin: string | null): Promise<Branding> {
  const settings = await getSettings();
  return {
    institutionName: settings.institutionName,
    institutionAcronym: settings.institutionAcronym,
    portalUrl: origin,
  };
}

export type InviteResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string; hint?: string };

// Contrôles communs : l'envoi doit être possible AVANT de créer quoi que ce soit
function checkCanSend(origin: string | null): InviteResult | null {
  if (!isMailConfigured()) {
    return {
      ok: false,
      error: "L'envoi d'e-mails n'est pas configuré : impossible d'inviter quelqu'un.",
      hint: "Configurez l'envoi dans Paramètres → Envoi d'e-mails, puis réessayez.",
    };
  }
  if (!origin) {
    return {
      ok: false,
      error: "L'adresse publique du portail est inconnue : impossible d'écrire le lien d'activation.",
      hint: "Définissez la variable APP_URL.",
    };
  }
  return null;
}

// Envoie le message d'activation ; renvoie null si parti, sinon l'erreur à afficher
async function sendActivationEmail(params: {
  to: string;
  token: string;
  origin: string;
  username: string;
  fullName: string | null;
  role: StaffRole;
  userId: string;
}): Promise<InviteResult | null> {
  const mail = invitationEmail(await getBranding(params.origin), {
    fullName: params.fullName,
    username: params.username,
    roleLabel: ROLE_LABELS[params.role],
    activateUrl: `${params.origin}/activer-compte?token=${encodeURIComponent(params.token)}`,
    validForHours: INVITATION_VALID_HOURS,
  });
  const result = await sendMail({ to: params.to, ...mail });
  if (result.ok) return null;

  await logAction(
    "NOTIFICATION_FAILED",
    `Échec d'envoi de l'invitation de ${params.username} (${maskEmail(params.to)}) : ${result.error}`,
    null,
  );
  return {
    ok: false,
    error: "Le message d'invitation n'a pas pu être envoyé à cette adresse.",
    hint: explainMailError(result.error, result.code) ?? "Vérifiez l'adresse saisie, puis réessayez.",
  };
}

export async function inviteStaffMember(params: {
  actorId: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  origin: string | null;
}): Promise<InviteResult> {
  const username = normalizeLogin(params.username);
  const fullName = params.fullName.trim();
  const email = params.email.trim().toLowerCase();

  if (!isStaffRole(params.role)) return { ok: false, error: "Rôle invalide." };
  const usernameError = validateUsername(username);
  if (usernameError) return { ok: false, error: usernameError };
  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, error: "Le nom complet doit contenir entre 2 et 120 caractères." };
  }
  if (!isValidEmailAddress(email)) return { ok: false, error: "Adresse e-mail invalide." };

  const blocked = checkCanSend(params.origin);
  if (blocked) return blocked;
  const origin = params.origin as string;

  if (await isLoginTaken(username)) {
    return { ok: false, error: `Le nom d'utilisateur « ${username} » est déjà pris.` };
  }

  // Mot de passe aléatoire que personne ne connaît : le compte ne peut pas servir
  // avant l'activation (et le champ pendingActivation l'interdit de toute façon).
  const unusableHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  const token = crypto.randomBytes(32).toString("base64url");

  let userId: string;
  try {
    const created = await prisma.user.create({
      data: {
        email: username,
        fullName,
        role: params.role,
        passwordHash: unusableHash,
        pendingActivation: true,
        permissions: tasksForRole(params.role),
        activationTokens: {
          create: {
            email,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + INVITATION_VALID_HOURS * 3600_000),
          },
        },
      },
      select: { id: true },
    });
    userId = created.id;
  } catch (e) {
    // Deux invitations simultanées avec le même nom : la contrainte d'unicité tranche
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: `Le nom d'utilisateur « ${username} » est déjà pris.` };
    }
    throw e;
  }

  const failure = await sendActivationEmail({
    to: email,
    token,
    origin,
    username,
    fullName,
    role: params.role,
    userId,
  });
  if (failure) {
    // Une invitation qui n'est jamais partie ne doit pas laisser un compte fantôme
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    return failure;
  }

  await logAction(
    "USER_INVITED",
    `Invitation de ${username} (${params.role}) envoyée à ${maskEmail(email)}`,
    params.actorId,
  );
  return { ok: true, sentTo: email };
}

// Renvoie l'invitation d'un compte pas encore activé, éventuellement à une autre
// adresse (faute de frappe). Le lien précédent cesse de fonctionner.
export async function resendInvitation(params: {
  actorId: string;
  userId: string;
  email?: string;
  origin: string | null;
}): Promise<InviteResult> {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      pendingActivation: true,
      activationTokens: { orderBy: { createdAt: "desc" }, take: 1, select: { email: true } },
    },
  });
  if (!user || !user.pendingActivation || !isStaffRole(user.role)) {
    return { ok: false, error: "Ce compte n'attend pas d'activation." };
  }

  const target = (params.email?.trim().toLowerCase() || user.activationTokens[0]?.email) ?? "";
  if (!isValidEmailAddress(target)) return { ok: false, error: "Adresse e-mail invalide." };

  const blocked = checkCanSend(params.origin);
  if (blocked) return blocked;
  const origin = params.origin as string;

  const recent = await prisma.activationToken.count({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  if (recent >= MAX_INVITATIONS_PER_HOUR) {
    return { ok: false, error: "Trop de renvois récents. Réessayez dans une heure." };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const created = await prisma.$transaction(async (tx) => {
    // Le lien précédent est annulé (marqué utilisé : ses lignes servent au comptage ci-dessus)
    await tx.activationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return tx.activationToken.create({
      data: {
        userId: user.id,
        email: target,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_VALID_HOURS * 3600_000),
      },
    });
  });

  const failure = await sendActivationEmail({
    to: target,
    token,
    origin,
    username: user.email,
    fullName: user.fullName,
    role: user.role,
    userId: user.id,
  });
  if (failure) {
    await prisma.activationToken.delete({ where: { id: created.id } }).catch(() => {});
    return failure;
  }

  await logAction(
    "INVITATION_RESENT",
    `Invitation de ${user.email} renvoyée à ${maskEmail(target)}`,
    params.actorId,
  );
  return { ok: true, sentTo: target };
}

// Annule une invitation : supprime le compte tant qu'il n'a jamais été activé.
// Un compte activé ne se supprime pas par ici (voir Permissions → Supprimer).
export async function cancelInvitation(
  actorId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, pendingActivation: true },
  });
  if (!user || !user.pendingActivation) {
    return { ok: false, error: "Ce compte n'attend pas d'activation." };
  }
  // Conditionné sur pendingActivation : une activation survenue entre-temps l'emporte
  const deleted = await prisma.user.deleteMany({ where: { id: userId, pendingActivation: true } });
  if (deleted.count !== 1) return { ok: false, error: "Ce compte vient d'être activé." };
  await logAction("INVITATION_CANCELLED", `Invitation de ${user.email} annulée`, actorId);
  return { ok: true };
}

// Pour la page Permissions : état de l'invitation en cours de chaque compte en attente
export async function pendingInvitationInfo(
  userIds: string[],
): Promise<Map<string, { maskedEmail: string; expiresAt: Date; expired: boolean }>> {
  const info = new Map<string, { maskedEmail: string; expiresAt: Date; expired: boolean }>();
  if (userIds.length === 0) return info;
  const rows = await prisma.activationToken.findMany({
    where: { userId: { in: userIds } },
    orderBy: { createdAt: "desc" },
    select: { userId: true, email: true, expiresAt: true, usedAt: true },
  });
  for (const row of rows) {
    if (info.has(row.userId)) continue; // la plus récente d'abord
    info.set(row.userId, {
      maskedEmail: maskEmail(row.email),
      expiresAt: row.expiresAt,
      expired: row.usedAt !== null || row.expiresAt <= new Date(),
    });
  }
  return info;
}

export async function inspectActivationToken(
  token: string,
): Promise<{ usable: false } | { usable: true; username: string; fullName: string | null; maskedEmail: string }> {
  if (!token) return { usable: false };
  const row = await prisma.activationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      email: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { email: true, fullName: true, active: true, pendingActivation: true } },
    },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date() || !row.user.active || !row.user.pendingActivation) {
    return { usable: false };
  }
  return {
    usable: true,
    username: row.user.email,
    fullName: row.user.fullName,
    maskedEmail: maskEmail(row.email),
  };
}

export type ActivationResult = { ok: true; username: string } | { ok: false; error: string };

const INVALID_LINK_ERROR =
  "Ce lien est invalide ou a expiré. Demandez au superadmin de vous renvoyer une invitation.";

export async function activateAccount(token: string, password: string): Promise<ActivationResult> {
  if (!token) return { ok: false, error: INVALID_LINK_ERROR };

  const row = await prisma.activationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, active: true, pendingActivation: true } } },
  });
  if (!row || row.usedAt || row.expiresAt <= new Date() || !row.user.active || !row.user.pendingActivation) {
    return { ok: false, error: INVALID_LINK_ERROR };
  }

  const weakness = validatePasswordStrength(password, { email: row.user.email });
  if (weakness) return { ok: false, error: weakness };

  const passwordHash = await bcrypt.hash(password, 10);
  const applied = await prisma.$transaction(async (tx) => {
    // Revendication atomique : un lien ouvert deux fois en même temps n'active qu'une fois
    const claimed = await tx.activationToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return false;

    // pendingActivation: true dans le filtre : un compte annulé ou déjà activé entre-temps échoue
    const activated = await tx.user.updateMany({
      where: { id: row.user.id, pendingActivation: true },
      data: {
        passwordHash,
        pendingActivation: false,
        // L'adresse du lien est désormais PROUVÉE : c'est celle du compte
        recoveryEmail: row.email,
        mustChangePassword: false,
        sessionsValidAfter: new Date(),
      },
    });
    if (activated.count !== 1) throw new Error("activation concurrente");

    await tx.activationToken.updateMany({
      where: { userId: row.user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return true;
  }).catch(() => false);
  if (!applied) return { ok: false, error: INVALID_LINK_ERROR };

  await logAction(
    "USER_ACTIVATED",
    `Compte ${row.user.email} activé (adresse vérifiée : ${maskEmail(row.email)})`,
    row.user.id,
  );
  return { ok: true, username: row.user.email };
}
