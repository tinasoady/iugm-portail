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

export type MailResult = { ok: true } | { ok: false; error: string; code?: string };

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
    const code = e && typeof e === "object" && "code" in e ? String(e.code) : undefined;
    return { ok: false, error: e instanceof Error ? e.message : "Échec de l'envoi.", code };
  }
}

// ---------------------------------------------------------------------------
// Diagnostic : l'envoi est-il configuré, et si un essai échoue, pourquoi ?
// Sert à la page Paramètres (e-mail de test) : le superadmin doit pouvoir
// vérifier SMTP depuis le site, sans lire les journaux du serveur.
// ---------------------------------------------------------------------------

export type MailStatus = {
  mode: "log" | "smtp" | "none";
  // Variables d'environnement manquantes pour que l'envoi fonctionne
  missing: string[];
  host?: string;
  port?: number;
  secure?: boolean;
  from?: string;
  hasCredentials: boolean;
  warnings: string[];
};

// Ne renvoie JAMAIS le mot de passe SMTP : seulement s'il est renseigné.
export function getMailStatus(env: Record<string, string | undefined> = process.env): MailStatus {
  if (env.MAIL_DRIVER === "log") {
    return {
      mode: "log",
      missing: [],
      hasCredentials: false,
      warnings: ["Mode journal (MAIL_DRIVER=log) : les e-mails sont écrits dans les journaux du serveur, jamais envoyés."],
    };
  }

  const missing: string[] = [];
  if (!env.SMTP_HOST) missing.push("SMTP_HOST");
  if (!env.MAIL_FROM) missing.push("MAIL_FROM");

  const port = Number(env.SMTP_PORT) || 587;
  const secure = env.SMTP_SECURE === "true" || port === 465;
  const warnings: string[] = [];
  if (env.SMTP_USER && !env.SMTP_PASS) warnings.push("SMTP_USER est renseigné mais pas SMTP_PASS.");
  if (!env.SMTP_USER && env.SMTP_HOST && !/^(localhost|127\.)/.test(env.SMTP_HOST)) {
    warnings.push("Aucun identifiant SMTP (SMTP_USER / SMTP_PASS) : la plupart des fournisseurs en exigent.");
  }
  if (port === 465 && env.SMTP_SECURE === "false") {
    warnings.push("Le port 465 impose le chiffrement direct : il sera utilisé même avec SMTP_SECURE=false.");
  }

  return {
    mode: missing.length === 0 ? "smtp" : "none",
    missing,
    host: env.SMTP_HOST || undefined,
    port,
    secure,
    from: env.MAIL_FROM || undefined,
    hasCredentials: Boolean(env.SMTP_USER && env.SMTP_PASS),
    warnings,
  };
}

// Traduit une erreur d'envoi en conseil concret (null si rien de précis à dire).
export function explainMailError(error: string, code?: string): string | null {
  const text = error.toLowerCase();
  if (code === "EAUTH" || /invalid login|authentication|username and password not accepted|535|534/.test(text)) {
    return "Identifiants refusés par le serveur. Gmail : utilisez un « mot de passe d'application » de 16 caractères (compte Google avec validation en 2 étapes), pas le mot de passe du compte. Brevo : utilisez la clé SMTP, pas le mot de passe du compte.";
  }
  if (/wrong version number|ssl routines|tls/.test(text) && code !== "EAUTH") {
    return "Mauvaise combinaison port / chiffrement : port 587 avec SMTP_SECURE vide ou false (STARTTLS), ou port 465 avec SMTP_SECURE=true.";
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "EDNS", "ENOTFOUND"].includes(code ?? "") || /getaddrinfo|econnrefused|timed out|etimedout/.test(text)) {
    return "Serveur injoignable : vérifiez SMTP_HOST (orthographe) et SMTP_PORT. Certains hébergeurs bloquent le port 25 ; utilisez 587 ou 465.";
  }
  if (code === "EENVELOPE" || /\b(550|553|554)\b|sender|not allowed|unverified|domain/.test(text)) {
    return "Adresse refusée : MAIL_FROM doit être une adresse que le fournisseur vous autorise à utiliser (adresse ou domaine vérifié chez lui). Vérifiez aussi l'adresse du destinataire.";
  }
  return null;
}

