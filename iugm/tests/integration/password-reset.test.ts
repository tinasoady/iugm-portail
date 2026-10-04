import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Aucun e-mail réel : on capture les messages envoyés
const sent: { to: string; subject: string; text: string }[] = [];
let sendResult: { ok: true } | { ok: false; error: string } = { ok: true };
let mailConfigured = true;

vi.mock("@/lib/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mailer")>()),
  isMailConfigured: () => mailConfigured,
  sendMail: async (m: { to: string; subject: string; text: string }) => {
    sent.push(m);
    return sendResult;
  },
}));

import { prisma } from "@/lib/prisma";
import {
  isResetTokenUsable,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/lib/password-reset";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(async () => {
  await resetDb();
  sent.length = 0;
  sendResult = { ok: true };
  mailConfigured = true;
});
afterAll(disconnectDb);

const ORIGIN = "https://portail.test";
const OLD_PASSWORD = "Ancien-motdepasse1";
const NEW_PASSWORD = "Nouveau-motdepasse2";

// Identifiant de connexion = nom d'utilisateur ; l'adresse e-mail vérifiée est à part
async function createStaff(username = "agent.test", recoveryEmail: string | null = "agent@iugm.test") {
  return prisma.user.create({
    data: {
      email: username,
      recoveryEmail,
      fullName: "Agent Test",
      passwordHash: await bcrypt.hash(OLD_PASSWORD, 4),
      role: "AGENT_ADMINISTRATION",
    },
  });
}

async function createStudentAccount(recoveryEmail: string | null, personalEmail: string | null = null) {
  const user = await prisma.user.create({
    data: {
      email: "jean.rakoto",
      recoveryEmail,
      fullName: "RAKOTO Jean",
      passwordHash: await bcrypt.hash(OLD_PASSWORD, 4),
      role: "ETUDIANT",
      mustChangePassword: true,
    },
  });
  await prisma.student.create({
    data: {
      matricule: "FI2026-1",
      fullName: "RAKOTO Jean",
      personalEmail,
      accountId: user.id,
      initialPassword: "secret-imprime",
    },
  });
  return user;
}

// Récupère le jeton du lien contenu dans le dernier e-mail envoyé
function tokenFromLastMail(): string {
  const mail = sent[sent.length - 1];
  const match = mail.text.match(/reinitialiser-mot-de-passe\?token=([A-Za-z0-9_%-]+)/);
  if (!match) throw new Error("aucun lien dans l'e-mail : " + mail.text);
  return decodeURIComponent(match[1]);
}

describe("demande de réinitialisation", () => {
  it("envoie un lien au personnel, stocke seulement l'empreinte du jeton", async () => {
    const user = await createStaff();
    expect(await requestPasswordReset("Agent.Test ", ORIGIN)).toEqual({ sent: true });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("agent@iugm.test");
    expect(sent[0].text).toContain(`${ORIGIN}/reinitialiser-mot-de-passe?token=`);

    const token = tokenFromLastMail();
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].tokenHash).not.toContain(token);
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);
    expect(rows[0].expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 61 * 60_000);
    expect(await isResetTokenUsable(token)).toBe(true);
  });

  it("n'envoie rien pour un compte inconnu ni pour un compte désactivé", async () => {
    expect(await requestPasswordReset("inconnu", ORIGIN)).toEqual({
      sent: false,
      reason: "unknown-account",
    });
    const user = await createStaff();
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect(await requestPasswordReset("agent.test", ORIGIN)).toEqual({
      sent: false,
      reason: "inactive",
    });
    expect(sent).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("envoie à l'adresse vérifiée de l'étudiant, par son identifiant « prenom.nom »", async () => {
    await createStudentAccount("jean@gmail.test");
    expect(await requestPasswordReset("jean.rakoto", ORIGIN)).toEqual({ sent: true });
    expect(sent[0].to).toBe("jean@gmail.test");
  });

  it("accepte l'ancien identifiant d'un étudiant (alias legacyLogin)", async () => {
    const user = await createStudentAccount("jean@gmail.test");
    await prisma.user.update({ where: { id: user.id }, data: { legacyLogin: "fi2026-1@student.iugm.edu" } });
    expect(await requestPasswordReset("FI2026-1@student.iugm.edu", ORIGIN)).toEqual({ sent: true });
    expect(sent[0].to).toBe("jean@gmail.test");
  });

  it("n'envoie rien à un étudiant sans adresse vérifiée, même avec une adresse non vérifiée au dossier", async () => {
    await createStudentAccount(null, "non-verifiee@gmail.test");
    expect(await requestPasswordReset("jean.rakoto", ORIGIN)).toEqual({
      sent: false,
      reason: "no-address",
    });
    expect(sent).toHaveLength(0);
  });

  it("n'envoie rien pour un compte en attente d'activation", async () => {
    const user = await createStaff();
    await prisma.user.update({ where: { id: user.id }, data: { pendingActivation: true } });
    expect(await requestPasswordReset("agent.test", ORIGIN)).toEqual({ sent: false, reason: "inactive" });
    expect(sent).toHaveLength(0);
  });

  it("refuse d'écrire un lien sans origine de confiance", async () => {
    await createStaff();
    expect(await requestPasswordReset("agent.test", null)).toEqual({
      sent: false,
      reason: "no-origin",
    });
    expect(sent).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("ne fait rien si l'envoi d'e-mails n'est pas configuré", async () => {
    await createStaff();
    mailConfigured = false;
    expect(await requestPasswordReset("agent.test", ORIGIN)).toEqual({
      sent: false,
      reason: "not-configured",
    });
  });

  it("limite à 3 demandes par heure", async () => {
    await createStaff();
    for (let i = 0; i < 3; i++) {
      expect(await requestPasswordReset("agent.test", ORIGIN)).toEqual({ sent: true });
    }
    expect(await requestPasswordReset("agent.test", ORIGIN)).toEqual({
      sent: false,
      reason: "throttled",
    });
    expect(sent).toHaveLength(3);
  });

  it("une nouvelle demande annule le lien précédent", async () => {
    await createStaff();
    await requestPasswordReset("agent.test", ORIGIN);
    const first = tokenFromLastMail();
    await requestPasswordReset("agent.test", ORIGIN);
    const second = tokenFromLastMail();

    expect(first).not.toBe(second);
    expect(await isResetTokenUsable(first)).toBe(false);
    expect(await isResetTokenUsable(second)).toBe(true);
  });

  it("supprime le jeton si l'e-mail n'a pas pu partir", async () => {
    await createStaff();
    sendResult = { ok: false, error: "SMTP indisponible" };
    expect(await requestPasswordReset("agent.test", ORIGIN)).toEqual({
      sent: false,
      reason: "send-failed",
    });
    expect(await prisma.passwordResetToken.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "NOTIFICATION_FAILED" } })).toBe(1);
  });
});

describe("réinitialisation avec le lien", () => {
  async function requestAndGetToken(email = "agent.test") {
    await requestPasswordReset(email, ORIGIN);
    return tokenFromLastMail();
  }

  it("change le mot de passe, ferme les sessions et lève le changement obligatoire", async () => {
    const user = await createStaff();
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    const token = await requestAndGetToken();

    expect(await resetPasswordWithToken(token, NEW_PASSWORD)).toEqual({ ok: true });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare(NEW_PASSWORD, row.passwordHash)).toBe(true);
    expect(await bcrypt.compare(OLD_PASSWORD, row.passwordHash)).toBe(false);
    expect(row.mustChangePassword).toBe(false);
    expect(row.sessionsValidAfter).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "PASSWORD_RESET_COMPLETED" } })).toBe(1);
  });

  it("le lien ne sert qu'une fois", async () => {
    await createStaff();
    const token = await requestAndGetToken();
    expect((await resetPasswordWithToken(token, NEW_PASSWORD)).ok).toBe(true);
    expect(await isResetTokenUsable(token)).toBe(false);
    expect(await resetPasswordWithToken(token, "Autre-motdepasse3")).toMatchObject({ ok: false });
  });

  it("deux soumissions simultanées du même lien : une seule aboutit", async () => {
    await createStaff();
    const token = await requestAndGetToken();
    const results = await Promise.all([
      resetPasswordWithToken(token, "Premier-motdepasse1"),
      resetPasswordWithToken(token, "Second-motdepasse22"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("refuse un lien expiré", async () => {
    await createStaff();
    const token = await requestAndGetToken();
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await isResetTokenUsable(token)).toBe(false);
    expect(await resetPasswordWithToken(token, NEW_PASSWORD)).toMatchObject({ ok: false });
  });

  it("refuse un jeton inconnu ou vide", async () => {
    await createStaff();
    expect(await resetPasswordWithToken("jeton-bidon", NEW_PASSWORD)).toMatchObject({ ok: false });
    expect(await resetPasswordWithToken("", NEW_PASSWORD)).toMatchObject({ ok: false });
    expect(await isResetTokenUsable("")).toBe(false);
  });

  it("refuse un mot de passe faible sans consommer le lien", async () => {
    await createStaff();
    const token = await requestAndGetToken();
    const weak = await resetPasswordWithToken(token, "court1");
    expect(weak).toMatchObject({ ok: false });
    expect(await isResetTokenUsable(token)).toBe(true);
    expect((await resetPasswordWithToken(token, NEW_PASSWORD)).ok).toBe(true);
  });

  it("refuse si le compte a été désactivé entre-temps", async () => {
    const user = await createStaff();
    const token = await requestAndGetToken();
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect(await resetPasswordWithToken(token, NEW_PASSWORD)).toMatchObject({ ok: false });
  });

  it("efface le mot de passe initial imprimé d'un étudiant", async () => {
    const user = await createStudentAccount("jean@gmail.test");
    const token = await requestAndGetToken("jean.rakoto");
    expect((await resetPasswordWithToken(token, NEW_PASSWORD)).ok).toBe(true);

    const student = await prisma.student.findFirstOrThrow({ where: { accountId: user.id } });
    expect(student.initialPassword).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(false);
  });

  it("refuse le matricule comme mot de passe d'un étudiant", async () => {
    await createStudentAccount("jean@gmail.test");
    const token = await requestAndGetToken("jean.rakoto");
    expect(await resetPasswordWithToken(token, "FI2026-1")).toMatchObject({ ok: false });
  });

  it("ne désactive pas la double authentification", async () => {
    const user = await createStaff();
    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: true, totpSecret: "x", recoveryCodes: ["abc"] },
    });
    const token = await requestAndGetToken();
    expect((await resetPasswordWithToken(token, NEW_PASSWORD)).ok).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.totpEnabled).toBe(true);
    expect(row.recoveryCodes).toEqual(["abc"]);
  });
});
