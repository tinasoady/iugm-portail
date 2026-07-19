import { prisma } from "./prisma";
import { logAction } from "./audit";

// ---------------------------------------------------------------------------
// Communiqués : rédigés par les agents, lus par les étudiants.
// Ciblage par groupe (filière et/ou niveau) ; tous les étudiants ciblés
// reçoivent le même message.
// ---------------------------------------------------------------------------

export async function createAnnouncement(
  input: { title: string; body: string; formation?: string | null; level?: string | null },
  actorId: string,
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
      formation: input.formation?.trim() || null,
      level: input.level?.trim() || null,
      authorId: actorId,
    },
  });

  const target = [
    announcement.formation ?? "toutes filières",
    announcement.level ?? "tous niveaux",
  ].join(" / ");
  await logAction("ANNOUNCEMENT_SENT", `Communiqué « ${title} » envoyé (${target})`, actorId);
  return announcement;
}

// Liste pour les agents (tous les communiqués, avec auteur et lectures)
export async function listAnnouncementsForAgent() {
  return prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { email: true, fullName: true, jobTitle: true } },
      _count: { select: { reads: true } },
    },
  });
}

// Critère de ciblage d'un étudiant : (filière du communiqué absente OU égale)
// ET (niveau absent OU égal)
async function targetingWhere(userId: string) {
  const student = await prisma.student.findFirst({
    where: { accountId: userId },
    select: { mention: true, program: true, level: true, track: true },
  });
  const formation = student ? (student.mention ?? student.program) : null;
  const level = student ? (student.level ?? student.track) : null;
  return {
    AND: [
      { OR: [{ formation: null }, ...(formation ? [{ formation }] : [])] },
      { OR: [{ level: null }, ...(level ? [{ level }] : [])] },
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
