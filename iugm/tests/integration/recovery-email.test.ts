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
  confirmRecoveryEmail,
  inspectRecoveryToken,
  maskEmail,
  removeRecoveryEmail,
  requestRecoveryEmail,
} from "@/lib/recovery-email";
import { recipientFor, requestPasswordReset } from "@/lib/password-reset";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(async () => {
  await resetDb();
  sent.length = 0;
  sendResult = { ok: true };
  mailConfigured = true;
});
afterAll(disconnectDb);

const ORIGIN = "https://portail.test";
const PASSWORD = "Motdepasse-2026";

async function createStaff(overrides: { email?: string; role?: "SUPERADMIN" | "AGENT_ADMINISTRATION" | "ETUDIANT"; recoveryEmail?: string | null } = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? "admin@iugm.edu",
      fullName: "Admin Test",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: overrides.role ?? "SUPERADMIN",
      recoveryEmail: overrides.recoveryEmail ?? null,
    },
  });
}

function tokenFromLastMail(): string {
  const mail = sent[sent.length - 1];
  const match = mail.text.match(/confirmer-adresse\?token=([A-Za-z0-9_%-]+)/);
  if (!match) throw new Error("aucun lien dans l'e-mail : " + mail.text);
  return decodeURIComponent(match[1]);
}

async function request(userId: string, email = "jtinasoady@gmail.com", password = PASSWORD, origin: string | null = ORIGIN) {
  return requestRecoveryEmail({ userId, newEmail: email, password, origin });
}

describe("maskEmail", () => {
  it("masque le milieu de la partie locale", () => {
    expect(maskEmail("jtinasoady@gmail.com")).toBe("j***y@gmail.com");
    expect(maskEmail("ab@x.mg")).toBe("a***@x.mg");
    expect(maskEmail("pas-une-adresse")).toBe("***");
  });
});

describe("demande de vérification", () => {
  it("envoie le lien à la NOUVELLE adresse, sans encore l'enregistrer", async () => {
    const user = await createStaff();
    const result = await request(user.id, "  JTinasoady@Gmail.com ");
    expect(result).toEqual({ ok: true, sentTo: "jtinasoady@gmail.com" });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("jtinasoady@gmail.com");
    expect(sent[0].text).toContain(`${ORIGIN}/confirmer-adresse?token=`);
    // Pas encore active : seule la confirmation l'enregistre
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).recoveryEmail).toBeNull();
  });

  it("stocke seulement l'empreinte du jeton, valable 24 h", async () => {
    const user = await createStaff();
    await request(user.id);
    const token = tokenFromLastMail();
    const row = await prisma.recoveryEmailToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toContain(token);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 3600_000 + 1000);
  });

  it("exige le mot de passe actuel", async () => {
    const user = await createStaff();
    expect(await request(user.id, "x@y.mg", "mauvais")).toMatchObject({ ok: false, error: "Mot de passe incorrect." });
    expect(await request(user.id, "x@y.mg", "")).toMatchObject({ ok: false });
    expect(sent).toHaveLength(0);
    expect(await prisma.recoveryEmailToken.count()).toBe(0);
  });

  it("refuse une adresse invalide ou déjà enregistrée", async () => {
    const user = await createStaff({ recoveryEmail: "deja@gmail.com" });
    expect(await request(user.id, "pas-une-adresse")).toMatchObject({ ok: false, error: "Adresse e-mail invalide." });
    expect(await request(user.id, "a@b.mg\nBcc: evil@x.mg")).toMatchObject({ ok: false });
    expect(await request(user.id, "DEJA@gmail.com")).toMatchObject({ ok: false });
    expect(sent).toHaveLength(0);
  });

  it("est réservée au personnel", async () => {
    const student = await createStaff({ email: "etu@etudiant.iugm", role: "ETUDIANT" });
    expect(await request(student.id)).toMatchObject({ ok: false });
    expect(sent).toHaveLength(0);
  });

  it("refuse quand l'envoi n'est pas configuré ou que l'adresse du portail est inconnue", async () => {
    const user = await createStaff();
    mailConfigured = false;
    expect(await request(user.id)).toMatchObject({ ok: false, error: expect.stringMatching(/pas configuré/) });
    mailConfigured = true;
    expect(await request(user.id, "x@y.mg", PASSWORD, null)).toMatchObject({ ok: false, hint: expect.stringMatching(/APP_URL/) });
    expect(await prisma.recoveryEmailToken.count()).toBe(0);
  });

  it("supprime le jeton et explique l'échec si le message n'a pas pu partir", async () => {
    const user = await createStaff();
    sendResult = { ok: false, error: "Invalid login: 535", code: "EAUTH" };
    const result = await request(user.id);
    expect(result).toMatchObject({ ok: false, hint: expect.stringMatching(/mot de passe d'application/) });
    expect(await prisma.recoveryEmailToken.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "NOTIFICATION_FAILED" } })).toBe(1);
  });

  it("limite à 5 demandes par heure et annule la demande précédente", async () => {
    const user = await createStaff();
    await request(user.id, "a1@gmail.com");
    const first = tokenFromLastMail();
    await request(user.id, "a2@gmail.com");
    const second = tokenFromLastMail();
    expect((await inspectRecoveryToken(first)).usable).toBe(false);
    expect((await inspectRecoveryToken(second)).usable).toBe(true);

    for (let i = 3; i <= 5; i++) await request(user.id, `a${i}@gmail.com`);
    expect(await request(user.id, "a6@gmail.com")).toMatchObject({ ok: false, error: expect.stringMatching(/Trop de demandes/) });
  });

  it("ne journalise pas l'adresse en clair", async () => {
    const user = await createStaff();
    await request(user.id, "jtinasoady@gmail.com");
    const logs = await prisma.auditLog.findMany({ where: { action: "RECOVERY_EMAIL_REQUESTED" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].details).toContain("j***y@gmail.com");
    expect(logs[0].details).not.toContain("jtinasoady");
  });
});

describe("confirmation", () => {
  it("enregistre l'adresse et masque celle qui s'affiche", async () => {
    const user = await createStaff();
    await request(user.id, "jtinasoady@gmail.com");
    const token = tokenFromLastMail();

    expect(await inspectRecoveryToken(token)).toEqual({ usable: true, maskedEmail: "j***y@gmail.com" });
    expect(await confirmRecoveryEmail(token)).toEqual({ ok: true, maskedEmail: "j***y@gmail.com" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).recoveryEmail).toBe("jtinasoady@gmail.com");
    expect(await prisma.auditLog.count({ where: { action: "RECOVERY_EMAIL_CONFIRMED" } })).toBe(1);
  });

  it("le lien ne sert qu'une fois, même ouvert deux fois en même temps", async () => {
    const user = await createStaff();
    await request(user.id);
    const token = tokenFromLastMail();
    const results = await Promise.all([confirmRecoveryEmail(token), confirmRecoveryEmail(token)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await confirmRecoveryEmail(token)).ok).toBe(false);
  });

  it("refuse un lien expiré, inventé, vide, ou d'un compte désactivé", async () => {
    const user = await createStaff();
    await request(user.id);
    const token = tokenFromLastMail();

    await prisma.recoveryEmailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await confirmRecoveryEmail(token)).ok).toBe(false);
    expect((await confirmRecoveryEmail("jeton-bidon")).ok).toBe(false);
    expect((await confirmRecoveryEmail("")).ok).toBe(false);
    expect((await inspectRecoveryToken("")).usable).toBe(false);

    await prisma.recoveryEmailToken.updateMany({ data: { expiresAt: new Date(Date.now() + 3600_000) } });
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect((await confirmRecoveryEmail(token)).ok).toBe(false);
  });

  it("prévient l'ANCIENNE adresse quand elle est remplacée", async () => {
    const user = await createStaff({ recoveryEmail: "ancienne@gmail.com" });
    await request(user.id, "nouvelle@gmail.com");
    const token = tokenFromLastMail();
    sent.length = 0;

    await confirmRecoveryEmail(token);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("ancienne@gmail.com");
    expect(sent[0].text).toContain("n***e@gmail.com");
    expect(sent[0].text).not.toContain("nouvelle@gmail.com");
  });

  it("une demande annulée (remplacée par une plus récente) ne peut plus être confirmée", async () => {
    const user = await createStaff();
    await request(user.id, "premiere@gmail.com");
    const first = tokenFromLastMail();
    await request(user.id, "seconde@gmail.com");
    expect((await confirmRecoveryEmail(first)).ok).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).recoveryEmail).toBeNull();
  });
});

describe("retrait", () => {
  it("exige le mot de passe, retire l'adresse, annule les demandes en attente et prévient l'ancienne adresse", async () => {
    const user = await createStaff({ recoveryEmail: "a-retirer@gmail.com" });
    await request(user.id, "en-attente@gmail.com");
    const pending = tokenFromLastMail();
    sent.length = 0;

    expect(await removeRecoveryEmail(user.id, "mauvais")).toMatchObject({ ok: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).recoveryEmail).toBe("a-retirer@gmail.com");

    expect(await removeRecoveryEmail(user.id, PASSWORD)).toEqual({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).recoveryEmail).toBeNull();
    expect((await confirmRecoveryEmail(pending)).ok).toBe(false); // ne peut pas la rétablir
    expect(sent.map((m) => m.to)).toEqual(["a-retirer@gmail.com"]);
    expect(await removeRecoveryEmail(user.id, PASSWORD)).toMatchObject({ ok: false });
  });
});

describe("effet sur « mot de passe oublié »", () => {
  it("le lien part vers l'adresse de récupération, pas vers l'identifiant sans boîte", async () => {
    await createStaff({ recoveryEmail: "vraie-boite@gmail.com" });
    expect(await requestPasswordReset("admin@iugm.edu", ORIGIN)).toEqual({ sent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("vraie-boite@gmail.com");
  });

  it("sans adresse de récupération, repli sur l'identifiant (comportement antérieur)", async () => {
    await createStaff();
    expect(await requestPasswordReset("admin@iugm.edu", ORIGIN)).toEqual({ sent: true });
    expect(sent[0].to).toBe("admin@iugm.edu");
  });

  it("recipientFor : priorité à la récupération pour le personnel, jamais pour un étudiant", () => {
    const base = { email: "login@iugm.edu", studentFile: null };
    expect(recipientFor({ ...base, role: "SUPERADMIN", recoveryEmail: "r@gmail.com" })).toBe("r@gmail.com");
    expect(recipientFor({ ...base, role: "SUPERADMIN", recoveryEmail: "pas-valide" })).toBe("login@iugm.edu");
    expect(recipientFor({ ...base, role: "SUPERADMIN" })).toBe("login@iugm.edu");
    expect(
      recipientFor({ ...base, role: "ETUDIANT", recoveryEmail: "r@gmail.com", studentFile: { personalEmail: "perso@gmail.com" } }),
    ).toBe("perso@gmail.com");
    expect(recipientFor({ ...base, role: "ETUDIANT", recoveryEmail: "r@gmail.com" })).toBeNull();
  });
});
