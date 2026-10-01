import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// ---------------------------------------------------------------------------
// Envoi d'e-mails par SMTP (fonctionne avec n'importe quel fournisseur : Brevo,
// Mailjet, Gmail avec mot de passe d'application, serveur de l'université...).
//
// Configuration par variables d'environnement :
//   SMTP_HOST   serveur SMTP (obligatoire pour envoyer)
//   SMTP_PORT   587 (STARTTLS, défaut) ou 465 (TLS direct)
//   SMTP_SECURE "true" pour le TLS direct (port 465)
//   SMTP_USER / SMTP_PASS  identifiants (optionnels pour un relais interne)
//   MAIL_FROM   adresse d'expédition, ex : "Portail IUGM <no-reply@iugm.mg>"
//   MAIL_DRIVER "log" : n'envoie rien, écrit le message dans la console (développement)
//
// Sans configuration, isMailConfigured() est faux et sendMail() refuse
// proprement : les fonctionnalités qui en dépendent (notifications,
// mot de passe oublié) se désactivent sans jamais faire échouer l'application.
// ---------------------------------------------------------------------------

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult = { ok: true } | { ok: false; error: string };

export function isMailConfigured(): boolean {
  if (process.env.MAIL_DRIVER === "log") return true;
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter {
  if (cachedTransport) return cachedTransport;
  const port = Number(process.env.SMTP_PORT) || 587;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
    // Une panne SMTP ne doit pas bloquer une requête pendant des minutes
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return cachedTransport;
}

// Adresse plausible : une vérification de forme, pas de délivrabilité. Refuse
// surtout les retours à la ligne (injection d'en-têtes SMTP) et les listes.
const EMAIL_PATTERN = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export function isValidEmailAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_PATTERN.test(value.trim());
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!isValidEmailAddress(message.to)) {
    return { ok: false, error: "Adresse e-mail invalide." };
  }
  // Un objet contenant un saut de ligne permettrait d'injecter des en-têtes
  const subject = message.subject.replace(/[\r\n]+/g, " ").trim();

  if (process.env.MAIL_DRIVER === "log") {
    console.log(`[mail:log] À: ${message.to}\n  Objet: ${subject}\n${message.text}`);
    return { ok: true };
  }
  if (!isMailConfigured()) {
    return { ok: false, error: "Envoi d'e-mails non configuré (SMTP_HOST / MAIL_FROM)." };
  }

  try {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM,
      to: message.to.trim(),
      subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Échec de l'envoi." };
  }
}
