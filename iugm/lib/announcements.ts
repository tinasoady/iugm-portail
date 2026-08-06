import type { AnnouncementKind } from "@prisma/client";

import { prisma } from "./prisma";
import { logAction } from "./audit";

// ---------------------------------------------------------------------------
// Communiqués : rédigés par les agents, lus par les étudiants. Deux modes de
// ciblage, mutuellement exclusifs pour une même ligne :
//  - groupé (formation et/ou niveau, "null" = tous) — le cas habituel, rédigé
//    manuellement depuis l'écran Communiquer ;
//  - personnel (studentId renseigné) — un seul destinataire, ex. l'avis
//    d'admission automatique envoyé depuis assignAcademicResult
//    (lib/students.ts) à l'issue des résultats S1+S2.
// ---------------------------------------------------------------------------

export async function createAnnouncement(
  input: {
    title: string;
    body: string;
    formation?: string | null;
    level?: string | null;
    studentId?: string | null;
    kind?: AnnouncementKind;
    sourceAcademicYear?: string | null;
  },
  // null pour un communiqué généré par le système sans agent à l'origine
  // (ex : bienvenue à la première connexion, voir
  // sendWelcomeAnnouncementOnFirstLogin) — `authorId` est nullable côté
  // schéma pour ce cas précis.
  actorId: string | null,
) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) throw new Error("Titre et message obligatoires.");
  if (title.length > 150) throw new Error("Titre trop long (150 caractères max).");
  if (body.length > 5000) throw new Error("Message trop long (5000 caractères max).");

  const announcement = await prisma.announcement.create({
    data: {
      title,
      body,
      formation: input.studentId ? null : input.formation?.trim() || null,
      level: input.studentId ? null : input.level?.trim() || null,
      studentId: input.studentId || null,
      kind: input.kind ?? "MANUAL",
      sourceAcademicYear: input.sourceAcademicYear ?? null,
      authorId: actorId,
    },
  });

  const target = announcement.studentId
    ? `dossier ${announcement.studentId}`
    : [announcement.formation ?? "toutes filières", announcement.level ?? "tous niveaux"].join(" / ");
  await logAction("ANNOUNCEMENT_SENT", `Communiqué « ${title} » envoyé (${target})`, actorId);
  return announcement;
}

// Communiqué de bienvenue à la toute première connexion réussie d'un
// étudiant sur le portail — pas à l'inscription : un dossier peut être
// validé plusieurs jours avant que l'étudiant se connecte pour la première
// fois, et le message n'a de sens qu'une fois qu'il est vraiment entré dans
// le portail (voir authenticateUser, lib/login.ts).
//
// `User.firstLoginAt` sert de verrou atomique : l'update conditionnel
// (WHERE firstLoginAt IS NULL) ne peut réussir qu'une seule fois, même si
// deux connexions arrivaient en même temps — pas de double communiqué.
export async function sendWelcomeAnnouncementOnFirstLogin(userId: string): Promise<void> {
  const claimed = await prisma.user.updateMany({
    where: { id: userId, firstLoginAt: null },
    data: { firstLoginAt: new Date() },
  });
  if (claimed.count === 0) return; // déjà connecté au moins une fois

  const student = await prisma.student.findFirst({ where: { accountId: userId } });
  if (!student) return; // compte étudiant sans dossier lié : ne devrait pas arriver

  await createAnnouncement(
    {
      title: "Bienvenue à l'IUGM Mahajanga !",
      body: `Bienvenue ${student.fullName} ! Votre compte étudiant (matricule ${student.matricule}) est maintenant actif. Pensez à vérifier vos informations dans « Mon profil ». Bonne année universitaire !`,
      studentId: student.id,
      kind: "WELCOME",
      sourceAcademicYear: student.academicYear,
    },
    null,
  );
}

// Liste pour les agents (tous les communiqués, avec auteur et lectures) —
// `student` n'est renseigné que pour un communiqué personnel (avis
// d'admission automatique), pour afficher son destinataire.
export async function listAnnouncementsForAgent() {
  return prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { email: true, fullName: true, jobTitle: true } },
      student: { select: { fullName: true, matricule: true } },
      _count: { select: { reads: true } },
    },
  });
}

// Critère de ciblage d'un étudiant : soit un communiqué personnel qui lui est
// adressé (studentId = son dossier), soit un communiqué groupé (studentId
// absent) dont la filière et le niveau sont absents ou égaux aux siens.
// Un communiqué personnel n'a pas de formation/level renseignés (voir
// createAnnouncement) : sans le distinguo `studentId: null` explicite ici, il
// matcherait par erreur TOUS les étudiants via la règle "absent = tous".
async function targetingWhere(userId: string) {
  const student = await prisma.student.findFirst({
    where: { accountId: userId },
    select: { id: true, mention: true, program: true, level: true, track: true },
  });
  const formation = student ? (student.mention ?? student.program) : null;
  const level = student ? (student.level ?? student.track) : null;
  return {
    OR: [
      ...(student ? [{ studentId: student.id }] : []),
      {
        AND: [
          { studentId: null },
          { OR: [{ formation: null }, ...(formation ? [{ formation }] : [])] },
          { OR: [{ level: null }, ...(level ? [{ level }] : [])] },
        ],
      },
    ],
  };
}

// Communiqués visibles par un étudiant, avec leur état lu / non lu
export async function listAnnouncementsForStudent(userId: string) {
  const where = await targetingWhere(userId);
  return prisma.announcement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { fullName: true, jobTitle: true } },
      reads: { where: { userId }, select: { id: true } },
    },
  });
}

// Nombre de communiqués non lus (badge de notification)
export async function unreadAnnouncementsCount(userId: string): Promise<number> {
  const where = await targetingWhere(userId);
  return prisma.announcement.count({
    where: { ...where, reads: { none: { userId } } },
  });
}

// Marque comme lus tous les communiqués visibles (à l'ouverture de la page)
export async function markAnnouncementsRead(userId: string) {
  const where = await targetingWhere(userId);
  const unread = await prisma.announcement.findMany({
    where: { ...where, reads: { none: { userId } } },
    select: { id: true },
  });
  if (unread.length === 0) return;
  await prisma.announcementRead.createMany({
    data: unread.map((a) => ({ announcementId: a.id, userId })),
    skipDuplicates: true,
  });
}

// Suppression : réservée à l'auteur du communiqué ou au superadmin
export async function deleteAnnouncement(id: string, actorId: string, role: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) throw new Error("Communiqué introuvable.");
  if (role !== "SUPERADMIN" && announcement.authorId !== actorId) {
    throw new Error("Seul l'auteur du communiqué (ou le superadmin) peut le supprimer.");
  }
  await prisma.announcement.delete({ where: { id } });
  await logAction("ANNOUNCEMENT_DELETED", `Communiqué « ${announcement.title} » supprimé`, actorId);
}
