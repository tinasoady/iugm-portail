import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { to: string; subject: string; text: string; html?: string }[] = [];
let mailConfigured = true;
let failFor: string | null = null;

vi.mock("@/lib/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mailer")>()),
  isMailConfigured: () => mailConfigured,
  sendMail: async (m: { to: string; subject: string; text: string; html?: string }) => {
    if (failFor && m.to === failFor) return { ok: false as const, error: "boîte pleine" };
    sent.push(m);
    return { ok: true as const };
  },
}));

import { prisma } from "@/lib/prisma";
import { createAnnouncement } from "@/lib/announcements";
import { notifyAnnouncement, notifyStudent, recipientsWhere } from "@/lib/notifications";
import { createActor } from "../setup/factories";
import { disconnectDb, resetDb } from "../setup/db";

beforeEach(async () => {
  await resetDb();
  sent.length = 0;
  mailConfigured = true;
  failFor = null;
});
afterAll(disconnectDb);

let seq = 0;
async function createStudent(
  overrides: Partial<{
    fullName: string;
    mention: string | null;
    program: string | null;
    level: string | null;
    track: string | null;
    personalEmail: string | null;
    withAccount: boolean;
  }> = {},
) {
  seq += 1;
  const withAccount = overrides.withAccount ?? true;
  const account = withAccount
    ? await prisma.user.create({
        data: { email: `etu${seq}@etudiant.iugm`, passwordHash: "x", role: "ETUDIANT" },
      })
    : null;
  return prisma.student.create({
    data: {
      matricule: `FI2026-${seq}`,
      fullName: overrides.fullName ?? `ETUDIANT ${seq}`,
      mention: overrides.mention === undefined ? "Management" : overrides.mention,
      program: overrides.program ?? null,
      level: overrides.level === undefined ? "L1" : overrides.level,
      track: overrides.track ?? null,
      personalEmail:
        overrides.personalEmail === undefined ? `etu${seq}@mail.test` : overrides.personalEmail,
      accountId: account?.id,
    },
  });
}

describe("notifyStudent", () => {
  it("envoie un e-mail à l'adresse personnelle, sans donnée sensible", async () => {
    const student = await createStudent({ fullName: "RAKOTO Jean", personalEmail: "jean@mail.test" });
    await notifyStudent(
      student.id,
      { kind: "PAYMENT_RECORDED", receiptNumber: "R-123", amountLabel: "150 000 Ar" },
      "https://portail.test",
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("jean@mail.test");
    expect(sent[0].text).toContain("R-123");
    expect(sent[0].text).toContain("https://portail.test");
    expect(sent[0].text).not.toMatch(/mot de passe\s*:/i);
  });

  it("ne fait rien sans adresse, avec une adresse invalide ou sans configuration", async () => {
    const noMail = await createStudent({ personalEmail: null });
    const badMail = await createStudent({ personalEmail: "pas-une-adresse" });
    const injected = await createStudent({ personalEmail: "a@b.test\nBcc: x@y.test" });
    for (const s of [noMail, badMail, injected]) {
      await notifyStudent(s.id, { kind: "ADMIN_VALIDATED" }, null);
    }
    expect(sent).toHaveLength(0);

    const ok = await createStudent();
    mailConfigured = false;
    await notifyStudent(ok.id, { kind: "ADMIN_VALIDATED" }, null);
    expect(sent).toHaveLength(0);
  });

  it("n'échoue jamais : dossier inexistant ou envoi refusé", async () => {
    await expect(notifyStudent("inexistant", { kind: "ADMIN_VALIDATED" }, null)).resolves.toBeUndefined();

    const student = await createStudent({ personalEmail: "plein@mail.test" });
    failFor = "plein@mail.test";
    await expect(notifyStudent(student.id, { kind: "ADMIN_VALIDATED" }, null)).resolves.toBeUndefined();
    expect(await prisma.auditLog.count({ where: { action: "NOTIFICATION_FAILED" } })).toBe(1);
  });
});

describe("recipientsWhere / notifyAnnouncement", () => {
  async function announce(target: { formation?: string | null; level?: string | null }) {
    const actor = await createActor("AGENT_ADMINISTRATION");
    return createAnnouncement({ title: "Réunion", body: "Rendez-vous lundi.", ...target }, actor.id);
  }

  it("cible la filière et le niveau comme le fait la lecture côté étudiant", async () => {
    await createStudent({ mention: "Management", level: "L1", personalEmail: "m-l1@mail.test" });
    await createStudent({ mention: "Management", level: "L2", personalEmail: "m-l2@mail.test" });
    await createStudent({ mention: "Économie générale", level: "L1", personalEmail: "e-l1@mail.test" });
    // filière/niveau portés par les champs hérités (program / track)
    await createStudent({
      mention: null,
      program: "Management",
      level: null,
      track: "L1",
      personalEmail: "legacy@mail.test",
    });

    const a = await announce({ formation: "Management", level: "L1" });
    const outcome = await notifyAnnouncement(a.id, null);
    expect(outcome).toEqual({ sent: 2, failed: 0 });
    expect(sent.map((m) => m.to).sort()).toEqual(["legacy@mail.test", "m-l1@mail.test"]);
  });

  it("sans filière ni niveau : tous les étudiants avec compte et adresse", async () => {
    await createStudent({ personalEmail: "a@mail.test" });
    await createStudent({ mention: "Finance-Comptabilité", level: "M1", personalEmail: "b@mail.test" });
    await createStudent({ personalEmail: null }); // pas d'adresse
    await createStudent({ withAccount: false, personalEmail: "sans-compte@mail.test" }); // pas inscrit

    const outcome = await notifyAnnouncement((await announce({})).id, null);
    expect(outcome.sent).toBe(2);
    expect(sent.map((m) => m.to).sort()).toEqual(["a@mail.test", "b@mail.test"]);
  });

  it("un communiqué personnel ne part qu'à son destinataire", async () => {
    const target = await createStudent({ personalEmail: "cible@mail.test" });
    await createStudent({ personalEmail: "autre@mail.test" });
    const actor = await createActor("AGENT_PEDAGOGIQUE");
    const a = await createAnnouncement(
      { title: "Avis", body: "Message personnel", studentId: target.id },
      actor.id,
    );
    await notifyAnnouncement(a.id, null);
    expect(sent.map((m) => m.to)).toEqual(["cible@mail.test"]);
  });

  it("compte les échecs sans interrompre l'envoi aux autres", async () => {
    await createStudent({ personalEmail: "ok1@mail.test" });
    await createStudent({ personalEmail: "plein@mail.test" });
    await createStudent({ personalEmail: "ok2@mail.test" });
    failFor = "plein@mail.test";

    const outcome = await notifyAnnouncement((await announce({})).id, null);
    expect(outcome).toEqual({ sent: 2, failed: 1 });
    expect(await prisma.auditLog.count({ where: { action: "NOTIFICATION_FAILED" } })).toBe(1);
  });

  it("recipientsWhere : sans formation ni niveau = comptes inscrits ; personnel = un seul dossier", () => {
    expect(recipientsWhere({ studentId: null, formation: null, level: null })).toEqual({
      AND: [{ accountId: { not: null } }],
    });
    expect(recipientsWhere({ studentId: "x", formation: "Management", level: "L1" })).toEqual({ id: "x" });
  });

  it("n'envoie rien si l'e-mail n'est pas configuré", async () => {
    await createStudent();
    mailConfigured = false;
    expect(await notifyAnnouncement((await announce({})).id, null)).toEqual({ sent: 0, failed: 0 });
  });
});
