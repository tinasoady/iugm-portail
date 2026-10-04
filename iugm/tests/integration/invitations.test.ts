import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { to: string; subject: string; text: string }[] = [];
let sendResult: { ok: true } | { ok: false; error: string; code?: string } = { ok: true };
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
  activateAccount,
  cancelInvitation,
  inspectActivationToken,
  inviteStaffMember,
  pendingInvitationInfo,
  resendInvitation,
} from "@/lib/invitations";
import { backfillStudentLogins } from "@/lib/student-login-backfill";
import { availableStudentLogin } from "@/lib/identifiers";
import { tasksForRole } from "@/lib/permissions";
import { createActor } from "../setup/factories";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(async () => {
  await resetDb();
  sent.length = 0;
  sendResult = { ok: true };
  mailConfigured = true;
});
afterAll(disconnectDb);

const ORIGIN = "https://portail.test";
const PASSWORD = "Nouveau-motdepasse2";

function tokenFromLastMail(): string {
  const mail = sent[sent.length - 1];
  const match = mail.text.match(/activer-compte\?token=([A-Za-z0-9_%-]+)/);
  if (!match) throw new Error("aucun lien dans l'e-mail : " + mail.text);
  return decodeURIComponent(match[1]);
}

async function invite(overrides: Partial<Parameters<typeof inviteStaffMember>[0]> = {}) {
  const actor = await createActor();
  return inviteStaffMember({
    actorId: actor.id,
    username: "marie.agent",
    fullName: "Marie Agent",
    email: "marie@gmail.test",
    role: "AGENT_PEDAGOGIQUE",
    origin: ORIGIN,
    ...overrides,
  });
}

describe("invitation d'un membre du personnel", () => {
  it("crée un compte en attente, sans mot de passe utilisable, et envoie le lien", async () => {
    expect(await invite()).toEqual({ ok: true, sentTo: "marie@gmail.test" });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "marie.agent" } });
    expect(user.pendingActivation).toBe(true);
    expect(user.role).toBe("AGENT_PEDAGOGIQUE");
    expect(user.recoveryEmail).toBeNull(); // pas encore prouvée
    expect(user.permissions).toEqual(tasksForRole("AGENT_PEDAGOGIQUE"));

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("marie@gmail.test");
    expect(sent[0].text).toContain(`${ORIGIN}/activer-compte?token=`);
    expect(sent[0].text).toContain("marie.agent");

    const token = tokenFromLastMail();
    const rows = await prisma.activationToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].tokenHash).not.toContain(token);
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 71 * 3600_000);
    expect(rows[0].expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 73 * 3600_000);
    expect(await prisma.auditLog.count({ where: { action: "USER_INVITED" } })).toBe(1);
  });

  it("refuse un nom d'utilisateur invalide, un rôle étudiant ou une adresse invalide", async () => {
    expect(await invite({ username: "Marie Agent" })).toMatchObject({ ok: false });
    expect(await invite({ role: "ETUDIANT" })).toMatchObject({ ok: false, error: "Rôle invalide." });
    expect(await invite({ email: "pas-une-adresse" })).toMatchObject({ ok: false, error: "Adresse e-mail invalide." });
    expect(await invite({ email: "a@b.mg\nBcc: evil@x.mg" })).toMatchObject({ ok: false });
    expect(await prisma.user.count({ where: { pendingActivation: true } })).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("refuse un nom déjà pris, y compris par un ancien identifiant d'étudiant", async () => {
    expect(await invite()).toMatchObject({ ok: true });
    expect(await invite({ email: "autre@gmail.test" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/déjà pris/),
    });

    await prisma.user.create({
      data: { email: "jean.rakoto", legacyLogin: "ancien.nom", passwordHash: "x", role: "ETUDIANT" },
    });
    expect(await invite({ username: "ancien.nom" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/déjà pris/),
    });
  });

  it("deux invitations simultanées du même nom : une seule aboutit", async () => {
    const actor = await createActor();
    const run = (email: string) =>
      inviteStaffMember({
        actorId: actor.id,
        username: "double",
        fullName: "Double Test",
        email,
        role: "SUPERADMIN",
        origin: ORIGIN,
      });
    const results = await Promise.all([run("a@gmail.test"), run("b@gmail.test")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.user.count({ where: { email: "double" } })).toBe(1);
  });

  it("est bloquée sans envoi d'e-mails configuré ou sans origine, avant toute création", async () => {
    mailConfigured = false;
    expect(await invite()).toMatchObject({ ok: false, error: expect.stringMatching(/pas configuré/) });
    mailConfigured = true;
    expect(await invite({ origin: null })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/adresse publique/),
    });
    expect(await prisma.user.count({ where: { email: "marie.agent" } })).toBe(0);
  });

  it("ne laisse aucun compte fantôme si l'e-mail n'a pas pu partir", async () => {
    sendResult = { ok: false, error: "550 mailbox unavailable" };
    expect(await invite()).toMatchObject({ ok: false });
    expect(await prisma.user.count({ where: { email: "marie.agent" } })).toBe(0);
    expect(await prisma.activationToken.count()).toBe(0);
  });
});

describe("activation", () => {
  it("l'ouverture du lien seule ne change rien ; le mot de passe choisi active le compte et prouve l'adresse", async () => {
    await invite();
    const token = tokenFromLastMail();
    const info = await inspectActivationToken(token);
    expect(info).toMatchObject({ usable: true, username: "marie.agent", fullName: "Marie Agent" });
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "marie.agent" } })).pendingActivation).toBe(true);

    expect(await activateAccount(token, PASSWORD)).toEqual({ ok: true, username: "marie.agent" });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "marie.agent" } });
    expect(user.pendingActivation).toBe(false);
    expect(user.recoveryEmail).toBe("marie@gmail.test");
    expect(user.mustChangePassword).toBe(false);
    expect(user.sessionsValidAfter).not.toBeNull();
    expect(await bcrypt.compare(PASSWORD, user.passwordHash)).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "USER_ACTIVATED" } })).toBe(1);
  });

  it("le lien ne sert qu'une fois", async () => {
    await invite();
    const token = tokenFromLastMail();
    expect((await activateAccount(token, PASSWORD)).ok).toBe(true);
    expect((await inspectActivationToken(token)).usable).toBe(false);
    expect(await activateAccount(token, "Autre-motdepasse3")).toMatchObject({ ok: false });
  });

  it("deux soumissions simultanées : une seule aboutit", async () => {
    await invite();
    const token = tokenFromLastMail();
    const results = await Promise.all([
      activateAccount(token, "Premier-motdepasse1"),
      activateAccount(token, "Second-motdepasse22"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("refuse un lien expiré, un jeton inconnu ou vide", async () => {
    await invite();
    const token = tokenFromLastMail();
    await prisma.activationToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await inspectActivationToken(token)).usable).toBe(false);
    expect(await activateAccount(token, PASSWORD)).toMatchObject({ ok: false });
    expect(await activateAccount("jeton-bidon", PASSWORD)).toMatchObject({ ok: false });
    expect(await activateAccount("", PASSWORD)).toMatchObject({ ok: false });
  });

  it("refuse un mot de passe faible ou égal à l'identifiant, sans consommer le lien", async () => {
    await invite();
    const token = tokenFromLastMail();
    expect(await activateAccount(token, "court1")).toMatchObject({ ok: false });
    expect(await activateAccount(token, "marie.agent")).toMatchObject({ ok: false });
    expect((await inspectActivationToken(token)).usable).toBe(true);
    expect((await activateAccount(token, PASSWORD)).ok).toBe(true);
  });

  it("refuse si le compte a été désactivé entre-temps", async () => {
    await invite();
    const token = tokenFromLastMail();
    await prisma.user.update({ where: { email: "marie.agent" }, data: { active: false } });
    expect(await activateAccount(token, PASSWORD)).toMatchObject({ ok: false });
  });
});

describe("renvoi et annulation", () => {
  it("le renvoi invalide le lien précédent et peut viser une autre adresse", async () => {
    await invite({ email: "faute@gmail.test" });
    const first = tokenFromLastMail();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "marie.agent" } });
    const actor = await createActor();

    expect(
      await resendInvitation({ actorId: actor.id, userId: user.id, email: "Bonne@gmail.test", origin: ORIGIN }),
    ).toEqual({ ok: true, sentTo: "bonne@gmail.test" });
    expect(sent[sent.length - 1].to).toBe("bonne@gmail.test");
    expect((await inspectActivationToken(first)).usable).toBe(false);

    const second = tokenFromLastMail();
    expect(await activateAccount(second, PASSWORD)).toMatchObject({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).recoveryEmail).toBe("bonne@gmail.test");
  });

  it("le renvoi réutilise l'adresse initiale et est limité à 5 par heure", async () => {
    await invite();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "marie.agent" } });
    const actor = await createActor();
    const resend = () => resendInvitation({ actorId: actor.id, userId: user.id, origin: ORIGIN });
    expect(await resend()).toEqual({ ok: true, sentTo: "marie@gmail.test" });
    for (let i = 0; i < 3; i++) expect((await resend()).ok).toBe(true); // 1 + 1 + 3 = 5 jetons
    expect(await resend()).toMatchObject({ ok: false, error: expect.stringMatching(/Trop de renvois/) });
  });

  it("un échec d'envoi au renvoi ne laisse pas de lien actif non délivré", async () => {
    await invite();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "marie.agent" } });
    const actor = await createActor();
    sendResult = { ok: false, error: "550 mailbox unavailable" };
    expect(await resendInvitation({ actorId: actor.id, userId: user.id, origin: ORIGIN })).toMatchObject({
      ok: false,
    });
    expect(await prisma.activationToken.count({ where: { userId: user.id, usedAt: null } })).toBe(0);
  });

  it("ne renvoie rien pour un compte déjà activé", async () => {
    await invite();
    await activateAccount(tokenFromLastMail(), PASSWORD);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "marie.agent" } });
    const actor = await createActor();
    sent.length = 0;
    expect(await resendInvitation({ actorId: actor.id, userId: user.id, origin: ORIGIN })).toMatchObject({
      ok: false,
    });
    expect(sent).toHaveLength(0);
  });

  it("l'annulation supprime le compte jamais activé, mais jamais un compte activé", async () => {
    await invite();
    const actor = await createActor();
    const pending = await prisma.user.findUniqueOrThrow({ where: { email: "marie.agent" } });
    const info = await pendingInvitationInfo([pending.id]);
    expect(info.get(pending.id)).toMatchObject({ maskedEmail: expect.stringContaining("@"), expired: false });

    expect(await cancelInvitation(actor.id, pending.id)).toEqual({ ok: true });
    expect(await prisma.user.count({ where: { email: "marie.agent" } })).toBe(0);
    expect(await prisma.activationToken.count()).toBe(0);

    await invite({ username: "autre.agent", email: "autre@gmail.test" });
    await activateAccount(tokenFromLastMail(), PASSWORD);
    const active = await prisma.user.findUniqueOrThrow({ where: { email: "autre.agent" } });
    expect(await cancelInvitation(actor.id, active.id)).toMatchObject({ ok: false });
    expect(await prisma.user.count({ where: { email: "autre.agent" } })).toBe(1);
  });
});

describe("rattrapage des identifiants étudiants", () => {
  async function legacyStudent(email: string, lastName: string, firstName: string, matricule: string) {
    const user = await prisma.user.create({
      data: { email, fullName: `${lastName} ${firstName}`, passwordHash: "x", role: "ETUDIANT" },
    });
    await prisma.student.create({
      data: { matricule, fullName: `${lastName} ${firstName}`, lastName, firstName, accountId: user.id },
    });
    return user;
  }

  it("donne prenom.nom, garde l'ancien identifiant en alias, numérote les homonymes", async () => {
    const a = await legacyStudent("fi2026-1@student.iugm.edu", "RAKOTO", "Jean", "FI2026-1");
    const b = await legacyStudent("fi2026-2@student.iugm.edu", "RAKOTO", "Jean", "FI2026-2");
    const staff = await prisma.user.create({ data: { email: "admin", passwordHash: "x", role: "SUPERADMIN" } });

    expect(await backfillStudentLogins({ dryRun: true })).toMatchObject({ scanned: 2, migrated: 2 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).legacyLogin).toBeNull(); // simulation : rien écrit

    expect(await backfillStudentLogins()).toEqual({ scanned: 2, migrated: 2, failed: 0 });
    const [ra, rb] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(ra).toMatchObject({ email: "jean.rakoto", legacyLogin: "fi2026-1@student.iugm.edu" });
    expect(rb).toMatchObject({ email: "jean.rakoto2", legacyLogin: "fi2026-2@student.iugm.edu" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).email).toBe("admin");

    // idempotent
    expect(await backfillStudentLogins()).toEqual({ scanned: 0, migrated: 0, failed: 0 });
  });

  it("availableStudentLogin évite aussi les anciens identifiants conservés en alias", async () => {
    await prisma.user.create({
      data: { email: "autre", legacyLogin: "jean.rakoto", passwordHash: "x", role: "ETUDIANT" },
    });
    expect(await availableStudentLogin({ fullName: "RAKOTO Jean", lastName: "RAKOTO", firstName: "Jean" })).toBe(
      "jean.rakoto2",
    );
  });
});
