// Modèles d'e-mails : texte brut + HTML simple (compatible avec tous les
// clients de messagerie, pas de dépendance à des styles externes). Fonctions
// pures — aucune lecture de la base — pour pouvoir les tester telles quelles.

export type EmailContent = { subject: string; text: string; html: string };

export type Branding = {
  institutionName: string;
  institutionAcronym: string;
  // Origine du portail (https://...), absente si non configurée : on n'écrit
  // alors aucun lien plutôt qu'un lien incorrect.
  portalUrl: string | null;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(brand: Branding, title: string, bodyHtml: string, button?: { label: string; url: string }) {
  const buttonHtml = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#4f46e5;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(button.label)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(title)}</h1>
${bodyHtml}
${buttonHtml}
<hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 12px">
<p style="font-size:12px;color:#71717a;margin:0">${escapeHtml(brand.institutionName)} (${escapeHtml(brand.institutionAcronym)}) — message automatique, merci de ne pas y répondre.</p>
</div></body></html>`;
}

function paragraphs(lines: string[]): string {
  return lines.map((l) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(l)}</p>`).join("\n");
}

function footerText(brand: Branding): string {
  return `\n--\n${brand.institutionName} (${brand.institutionAcronym}) — message automatique, merci de ne pas y répondre.`;
}

// --- Mot de passe oublié ---------------------------------------------------

export function passwordResetEmail(
  brand: Branding,
  params: { fullName?: string | null; resetUrl: string; validForMinutes: number },
): EmailContent {
  const greeting = params.fullName ? `Bonjour ${params.fullName},` : "Bonjour,";
  const lines = [
    greeting,
    `Une demande de réinitialisation du mot de passe de votre compte du portail ${brand.institutionAcronym} a été faite.`,
    `Ce lien est valable ${params.validForMinutes} minutes et ne peut servir qu'une fois.`,
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
  ];
  return {
    subject: `Réinitialisation de votre mot de passe — ${brand.institutionAcronym}`,
    text: `${lines.join("\n\n")}\n\n${params.resetUrl}${footerText(brand)}`,
    html: layout(brand, "Réinitialisation du mot de passe", paragraphs(lines), {
      label: "Choisir un nouveau mot de passe",
      url: params.resetUrl,
    }),
  };
}

// --- Adresse de récupération ------------------------------------------------

export function recoveryEmailConfirmationEmail(
  brand: Branding,
  params: { fullName?: string | null; confirmUrl: string; validForHours: number },
): EmailContent {
  const greeting = params.fullName ? `Bonjour ${params.fullName},` : "Bonjour,";
  const lines = [
    greeting,
    `Cette adresse a été indiquée comme adresse de récupération d'un compte du portail ${brand.institutionAcronym}. Elle servira à recevoir le lien si le mot de passe est oublié.`,
    `Pour la confirmer, ouvrez le lien ci-dessous puis cliquez sur « Confirmer ». Il est valable ${params.validForHours} heures et ne peut servir qu'une fois.`,
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera enregistré.",
  ];
  return {
    subject: `Confirmez votre adresse de récupération — ${brand.institutionAcronym}`,
    text: `${lines.join("\n\n")}\n\n${params.confirmUrl}${footerText(brand)}`,
    html: layout(brand, "Confirmer l'adresse de récupération", paragraphs(lines), {
      label: "Confirmer cette adresse",
      url: params.confirmUrl,
    }),
  };
}

// Prévient l'ANCIENNE adresse de récupération qu'elle vient d'être remplacée ou
// retirée : si ce n'est pas voulu, c'est le signe qu'un compte est compromis.
export function recoveryEmailChangedNotice(
  brand: Branding,
  params: { fullName?: string | null; change: "replaced" | "removed"; newEmailMasked?: string },
): EmailContent {
  const greeting = params.fullName ? `Bonjour ${params.fullName},` : "Bonjour,";
  const what =
    params.change === "replaced"
      ? `remplacée par ${params.newEmailMasked ?? "une autre adresse"}`
      : "retirée du compte";
  const lines = [
    greeting,
    `Votre adresse de récupération du portail ${brand.institutionAcronym} vient d'être ${what}.`,
    "Si c'est vous, il n'y a rien à faire. Sinon, contactez immédiatement l'administration : quelqu'un a peut-être accès à votre compte.",
  ];
  return {
    subject: `Adresse de récupération modifiée — ${brand.institutionAcronym}`,
    text: `${lines.join("\n\n")}${footerText(brand)}`,
    html: layout(brand, "Adresse de récupération modifiée", paragraphs(lines)),
  };
}

// --- Notifications aux étudiants ------------------------------------------

export type StudentNotification =
  | { kind: "PAYMENT_RECORDED"; receiptNumber: string; amountLabel: string }
  | { kind: "ADMIN_VALIDATED" }
  | { kind: "ENROLLED"; matricule: string }
  | { kind: "RESULT_PUBLISHED" }
  | { kind: "ANNOUNCEMENT"; title: string; body: string };

export function studentNotificationEmail(
  brand: Branding,
  student: { fullName: string },
  event: StudentNotification,
): EmailContent {
  const greeting = `Bonjour ${student.fullName},`;
  let subject: string;
  let title: string;
  let lines: string[];

  switch (event.kind) {
    case "PAYMENT_RECORDED":
      subject = `Paiement enregistré — ${brand.institutionAcronym}`;
      title = "Paiement enregistré";
      lines = [
        greeting,
        `Votre paiement de ${event.amountLabel} (reçu n° ${event.receiptNumber}) a bien été enregistré par l'administration.`,
        "Conservez votre reçu : il peut vous être demandé.",
      ];
      break;
    case "ADMIN_VALIDATED":
      subject = `Inscription administrative validée — ${brand.institutionAcronym}`;
      title = "Inscription administrative validée";
      lines = [
        greeting,
        "Votre inscription administrative est validée. Il reste la validation pédagogique pour finaliser votre inscription.",
      ];
      break;
    case "ENROLLED":
      subject = `Inscription finalisée — ${brand.institutionAcronym}`;
      title = "Votre inscription est finalisée";
      lines = [
        greeting,
        `Votre inscription (matricule ${event.matricule}) est finalisée. Votre compte du portail est actif : récupérez vos identifiants de connexion auprès de l'administration, puis changez votre mot de passe dès la première connexion.`,
      ];
      break;
    case "RESULT_PUBLISHED":
      subject = `Nouveaux résultats disponibles — ${brand.institutionAcronym}`;
      title = "Nouveaux résultats disponibles";
      lines = [greeting, "De nouveaux résultats ont été enregistrés pour vous. Consultez-les sur le portail."];
      break;
    case "ANNOUNCEMENT":
      subject = `${event.title} — ${brand.institutionAcronym}`;
      title = event.title;
      lines = [greeting, ...event.body.split(/\r?\n+/).filter(Boolean)];
      break;
  }

  const portal = brand.portalUrl;
  const text = `${lines.join("\n\n")}${portal ? `\n\nPortail : ${portal}` : ""}${footerText(brand)}`;
  return {
    subject,
    text,
    html: layout(brand, title, paragraphs(lines), portal ? { label: "Ouvrir le portail", url: portal } : undefined),
  };
}
