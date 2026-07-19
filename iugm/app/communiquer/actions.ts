"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import {
  hasTaskPermission,
  getUserFormation,
  PERMISSION_DENIED_MESSAGE,
} from "@/lib/permissions";
import { createAnnouncement, deleteAnnouncement } from "@/lib/announcements";

export type AnnouncementState = { success?: string; error?: string };

async function requireCommuniquer() {
  const session = await getSession();
  if (
    !session ||
    !["AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE", "SUPERADMIN"].includes(session.role)
  ) {
    return null;
  }
  if (!(await hasTaskPermission(session.sub, session.role, "communiquer"))) {
    return "denied" as const;
  }
  return session;
}

export async function sendAnnouncementAction(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  const session = await requireCommuniquer();
  if (!session) return { error: "Accès refusé." };
  if (session === "denied") return { error: PERMISSION_DENIED_MESSAGE };

  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  let formation = String(formData.get("formation") ?? "").trim() || null;
  const level = String(formData.get("level") ?? "").trim() || null;

  // Secrétaire de formation : ses communiqués sont limités à sa formation
  const userFormation = await getUserFormation(session.sub, session.role);
  if (userFormation) formation = userFormation;

  try {
    const a = await createAnnouncement({ title, body, formation, level }, session.sub);
    revalidatePath("/communiquer");
    const target = [a.formation ?? "toutes filières", a.level ?? "tous niveaux"].join(" / ");
    return { success: `Communiqué envoyé aux étudiants (${target}).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'envoi." };
  }
}

export async function deleteAnnouncementAction(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  const session = await requireCommuniquer();
  if (!session) return { error: "Accès refusé." };
  if (session === "denied") return { error: PERMISSION_DENIED_MESSAGE };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Communiqué manquant." };

  try {
    await deleteAnnouncement(id, session.sub, session.role);
    revalidatePath("/communiquer");
    return { success: "Communiqué supprimé." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la suppression." };
  }
}
