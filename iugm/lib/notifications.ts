import { after } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { logAction } from "./audit";
import { sendMail, isMailConfigured, isValidEmailAddress } from "./mailer";
import { studentNotificationEmail, type Branding, type StudentNotification } from "./email-templates";
import { getSettings } from "./settings";
import { getTrustedAppOrigin } from "./url";

// ---------------------------------------------------------------------------
// Notifications e-mail aux étudiants (paiement enregistré, inscription validée,
// résultats, communiqués). Principes :
//  - jamais bloquant : tout part APRÈS la réponse à l'agent (voir after()), un
//    SMTP lent ou en panne ne ralentit ni ne fait échouer l'opération métier ;
//  - jamais d'information sensible dans le message (pas de mot de passe, pas de
//    notes détaillées) : on invite à consulter le portail ;
//  - silencieux si l'envoi n'est pas configuré ou si l'étudiant n'a pas
//    d'adresse e-mail personnelle dans son dossier ;
//  - les échecs sont tracés dans le journal d'audit (NOTIFICATION_FAILED).
// ---------------------------------------------------------------------------

// Plafond d'un envoi groupé (communiqué à toute l'université) : au-delà, le
// reste est ignoré et signalé dans le journal, plutôt que de saturer le SMTP.
const MAX_BULK_RECIPIENTS = 2000;
// Envois simultanés vers le serveur SMTP
const BULK_CONCURRENCY = 5;

async function getBranding(origin: string | null): Promise<Branding> {
  const settings = await getSettings();
  return {
    institutionName: settings.institutionName,
    institutionAcronym: settings.institutionAcronym,
    portalUrl: origin,
  };
}

// Notifie un étudiant. Ne lève jamais d'exception.
export async function notifyStudent(
  studentId: string,
  event: StudentNotification,
  origin: string | null,
): Promise<void> {
  try {
    if (!isMailConfigured()) return;
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { fullName: true, personalEmail: true, matricule: true },
    });
    if (!student || !isValidEmailAddress(student.personalEmail)) return;

    const email = studentNotificationEmail(await getBranding(origin), student, event);
    const result = await sendMail({ to: student.personalEmail, ...email });
    if (!result.ok) {
      await logAction(
        "NOTIFICATION_FAILED",
        `Notification « ${event.kind} » non envoyée à ${student.matricule} : ${result.error}`,
      );
    }
  } catch (e) {
    console.error("Échec de la notification étudiant :", e);
  }
}

// Filtre Prisma des étudiants concernés par un communiqué groupé : même
// règle de ciblage que targetingWhere (lib/announcements.ts), vue depuis le
// dossier — filière = mention (ou à défaut programme), niveau = level (ou à
// défaut parcours). Seuls les dossiers avec compte (inscrits) le voient.
export function recipientsWhere(target: {
  studentId: string | null;
  formation: string | null;
  level: string | null;
}): Prisma.StudentWhereInput {
  if (target.studentId) return { id: target.studentId };
  const and: Prisma.StudentWhereInput[] = [{ accountId: { not: null } }];
  if (target.formation) {
    and.push({
      OR: [{ mention: target.formation }, { mention: null, program: target.formation }],
    });
  }
  if (target.level) {
    and.push({ OR: [{ level: target.level }, { level: null, track: target.level }] });
  }
  return { AND: and };
}

// Diffuse un communiqué par e-mail aux étudiants ciblés qui ont une adresse.
export async function notifyAnnouncement(
  announcementId: string,
  origin: string | null,
): Promise<{ sent: number; failed: number }> {
  const outcome = { sent: 0, failed: 0 };
  try {
    if (!isMailConfigured()) return outcome;
    const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
    if (!announcement) return outcome;

    const students = await prisma.student.findMany({
      where: {
        AND: [
          recipientsWhere(announcement),
          { personalEmail: { not: null } },
        ],
      },
      select: { fullName: true, personalEmail: true },
      orderBy: { id: "asc" },
      take: MAX_BULK_RECIPIENTS + 1,
    });
    const truncated = students.length > MAX_BULK_RECIPIENTS;
    const recipients = students.slice(0, MAX_BULK_RECIPIENTS);
    const branding = await getBranding(origin);

    for (let i = 0; i < recipients.length; i += BULK_CONCURRENCY) {
      const chunk = recipients.slice(i, i + BULK_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (student) => {
          if (!isValidEmailAddress(student.personalEmail)) return false;
          const email = studentNotificationEmail(branding, student, {
            kind: "ANNOUNCEMENT",
            title: announcement.title,
            body: announcement.body,
          });
          return (await sendMail({ to: student.personalEmail, ...email })).ok;
        }),
      );
      for (const ok of results) {
        if (ok) outcome.sent++;
        else outcome.failed++;
      }
    }

    if (outcome.failed > 0 || truncated) {
      await logAction(
        "NOTIFICATION_FAILED",
        `Communiqué « ${announcement.title} » : ${outcome.sent} e-mail(s) envoyé(s), ${outcome.failed} échec(s)${truncated ? `, envoi limité à ${MAX_BULK_RECIPIENTS} destinataires` : ""}`,
      );
    }
  } catch (e) {
    console.error("Échec de la diffusion du communiqué par e-mail :", e);
  }
  return outcome;
}

// Exécute `task` après l'envoi de la réponse HTTP. Hors contexte de requête
// (script, test), after() n'est pas disponible : on lance alors la tâche
// directement, sans l'attendre — l'appelant ne doit jamais dépendre de son issue.
function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task().catch((e) => console.error("Tâche différée en échec :", e));
  }
}

// Ces deux fonctions sont celles que les Server Actions appellent : elles
// retournent immédiatement.
export function scheduleStudentNotification(studentId: string, event: StudentNotification): void {
  runAfterResponse(async () => {
    await notifyStudent(studentId, event, await getTrustedAppOrigin().catch(() => null));
  });
}

export function scheduleAnnouncementNotification(announcementId: string): void {
  runAfterResponse(async () => {
    await notifyAnnouncement(announcementId, await getTrustedAppOrigin().catch(() => null));
  });
}
