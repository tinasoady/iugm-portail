import { afterEach, describe, expect, it } from "vitest";

import {
  explainMailError,
  getMailStatus,
  isMailConfigured,
  isValidEmailAddress,
  sendMail,
} from "@/lib/mailer";
import {
  escapeHtml,
  invitationEmail,
  passwordResetEmail,
  studentNotificationEmail,
  type Branding,
} from "@/lib/email-templates";

const BRAND: Branding = {
  institutionName: "Institut Universitaire de Gestion et de Management",
  institutionAcronym: "IUGM",
  portalUrl: "https://portail.test",
};

describe("isValidEmailAddress", () => {
  it("accepte des adresses courantes", () => {
    for (const ok of ["a@b.mg", "jean.rakoto+iugm@mail.example.org", "x_y-z@sub.domain.test"]) {
      expect(isValidEmailAddress(ok)).toBe(true);
    }
  });

  it("refuse les formes invalides, les listes et l'injection d'en-têtes", () => {
    const bad = [
      "",
      null,
      undefined,
      "sans-arobase",
      "a@b",
      "a b@c.test",
      "a@b.test, c@d.test",
      "a@b.test;c@d.test",
      "a@b.test\nBcc: evil@x.test",
      "a@b.test\r\nSubject: x",
      "<a@b.test>",
      `${"a".repeat(250)}@b.test`,
    ];
    for (const value of bad) expect(isValidEmailAddress(value)).toBe(false);
  });
});

describe("sendMail sans configuration", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("refuse proprement quand SMTP n'est pas configuré", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.MAIL_FROM;
    delete process.env.MAIL_DRIVER;
    expect(isMailConfigured()).toBe(false);
    const result = await sendMail({ to: "a@b.test", subject: "x", text: "y" });
    expect(result).toMatchObject({ ok: false });
  });

  it("refuse une adresse invalide avant toute tentative", async () => {
    process.env.MAIL_DRIVER = "log";
    expect(await sendMail({ to: "pas-une-adresse", subject: "x", text: "y" })).toEqual({
      ok: false,
      error: "Adresse e-mail invalide.",
    });
  });

  it("le mode log n'envoie rien mais réussit", async () => {
    process.env.MAIL_DRIVER = "log";
    expect(isMailConfigured()).toBe(true);
    expect(await sendMail({ to: "a@b.test", subject: "Objet\r\nBcc: x@y.test", text: "y" })).toEqual({
      ok: true,
    });
  });
});

describe("escapeHtml", () => {
  it("neutralise les caractères dangereux", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
    );
  });
});

describe("modèles d'e-mails", () => {
  it("le message de réinitialisation contient le lien, la durée et un rappel de prudence", () => {
    const mail = passwordResetEmail(BRAND, {
      fullName: "Agent Test",
      resetUrl: "https://portail.test/reinitialiser-mot-de-passe?token=abc",
      validForMinutes: 60,
    });
    expect(mail.subject).toContain("IUGM");
    expect(mail.text).toContain("https://portail.test/reinitialiser-mot-de-passe?token=abc");
    expect(mail.text).toContain("60 minutes");
    expect(mail.text).toMatch(/ignorez ce message/);
    expect(mail.html).toContain('href="https://portail.test/reinitialiser-mot-de-passe?token=abc"');
  });

  it("l'invitation contient le nom d'utilisateur, le lien, la durée, et jamais de mot de passe", () => {
    const mail = invitationEmail(BRAND, {
      fullName: "Marie <b>Agent</b>",
      username: "marie.agent",
      roleLabel: "Agent pédagogique",
      activateUrl: "https://portail.test/activer-compte?token=abc",
      validForHours: 72,
    });
    expect(mail.subject).toContain("IUGM");
    expect(mail.text).toContain("marie.agent");
    expect(mail.text).toContain("https://portail.test/activer-compte?token=abc");
    expect(mail.text).toContain("72 heures");
    expect(mail.text).toMatch(/choisissez votre mot de passe/);
    expect(mail.html).toContain('href="https://portail.test/activer-compte?token=abc"');
    expect(mail.html).not.toContain("<b>Agent</b>");
  });

  it("échappe le contenu saisi par un agent dans un communiqué (pas d'injection HTML)", () => {
    const mail = studentNotificationEmail(
      BRAND,
      { fullName: "RAKOTO <b>Jean</b>" },
      {
        kind: "ANNOUNCEMENT",
        title: "<img src=x onerror=alert(1)>",
        body: "Ligne 1\n\n<script>x</script>",
      },
    );
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&lt;b&gt;Jean&lt;/b&gt;");
  });

  it("n'écrit aucun lien quand l'origine du portail est inconnue", () => {
    const mail = studentNotificationEmail(
      { ...BRAND, portalUrl: null },
      { fullName: "RAKOTO Jean" },
      { kind: "ADMIN_VALIDATED" },
    );
    expect(mail.text).not.toContain("http");
    expect(mail.html).not.toContain("href=");
  });

  it("ne contient jamais de mot de passe dans l'avis d'inscription", () => {
    const mail = studentNotificationEmail(
      BRAND,
      { fullName: "RAKOTO Jean" },
      { kind: "ENROLLED", matricule: "FI2026-1" },
    );
    expect(mail.text).toContain("FI2026-1");
    expect(mail.text).toMatch(/auprès de l'administration/);
  });

  it("chaque événement a un objet distinct", () => {
    const events = [
      { kind: "PAYMENT_RECORDED", receiptNumber: "1", amountLabel: "1 Ar" },
      { kind: "ADMIN_VALIDATED" },
      { kind: "ENROLLED", matricule: "M" },
      { kind: "RESULT_PUBLISHED" },
      { kind: "ANNOUNCEMENT", title: "T", body: "B" },
    ] as const;
    const subjects = events.map((e) => studentNotificationEmail(BRAND, { fullName: "X" }, e).subject);
    expect(new Set(subjects).size).toBe(events.length);
  });
});

describe("getMailStatus", () => {
  it("non configuré : liste ce qui manque", () => {
    const status = getMailStatus({});
    expect(status.mode).toBe("none");
    expect(status.missing).toEqual(["SMTP_HOST", "MAIL_FROM"]);
  });

  it("configuré : SMTP avec STARTTLS par défaut, port 465 = TLS direct", () => {
    const base = { SMTP_HOST: "smtp.gmail.com", MAIL_FROM: "Portail <a@b.mg>", SMTP_USER: "u", SMTP_PASS: "p" };
    expect(getMailStatus(base)).toMatchObject({ mode: "smtp", port: 587, secure: false, hasCredentials: true, missing: [] });
    expect(getMailStatus({ ...base, SMTP_PORT: "465" })).toMatchObject({ port: 465, secure: true });
  });

  it("ne renvoie jamais le mot de passe SMTP", () => {
    const status = getMailStatus({ SMTP_HOST: "h", MAIL_FROM: "a@b.mg", SMTP_USER: "u", SMTP_PASS: "secret-tres-secret" });
    expect(JSON.stringify(status)).not.toContain("secret-tres-secret");
  });

  it("signale les réglages incohérents", () => {
    const noPass = getMailStatus({ SMTP_HOST: "h.example", MAIL_FROM: "a@b.mg", SMTP_USER: "u" });
    expect(noPass.warnings.join(" ")).toMatch(/SMTP_PASS/);
    const noAuth = getMailStatus({ SMTP_HOST: "smtp.example.com", MAIL_FROM: "a@b.mg" });
    expect(noAuth.warnings.join(" ")).toMatch(/identifiant/i);
  });

  it("mode journal", () => {
    expect(getMailStatus({ MAIL_DRIVER: "log" })).toMatchObject({ mode: "log", missing: [] });
  });
});

describe("explainMailError", () => {
  it("authentification refusée (Gmail, Brevo)", () => {
    const hint = explainMailError("Invalid login: 535-5.7.8 Username and Password not accepted", "EAUTH");
    expect(hint).toMatch(/mot de passe d'application/);
  });

  it("serveur injoignable", () => {
    expect(explainMailError("getaddrinfo ENOTFOUND smtp.gmial.com", "EDNS")).toMatch(/SMTP_HOST/);
    expect(explainMailError("Connection timeout", "ETIMEDOUT")).toMatch(/injoignable/);
  });

  it("mauvaise combinaison port / chiffrement", () => {
    expect(explainMailError("error:0A00010B:SSL routines:ssl3_get_record:wrong version number")).toMatch(/465/);
  });

  it("expéditeur refusé", () => {
    expect(explainMailError("550 5.7.1 Sender address not allowed", "EENVELOPE")).toMatch(/MAIL_FROM/);
  });

  it("erreur inconnue : pas de conseil inventé", () => {
    expect(explainMailError("quelque chose d'inattendu")).toBeNull();
  });
});
