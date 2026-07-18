"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export type ProfileState = { success?: string; error?: string };

// Chaque utilisateur ne modifie que SON propre compte (identifié par la session)

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const session = await getSession();
  if (!session) return { error: "Session expirée : reconnectez-vous." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (fullName.length < 2) return { error: "Le nom complet est obligatoire." };
  if (fullName.length > 120) return { error: "Nom trop long (120 caractères max)." };

  await prisma.user.update({ where: { id: session.sub }, data: { fullName } });
  await logAction("PROFILE_UPDATED", `Profil mis à jour par ${session.email}`, session.sub);
  revalidatePath("/profil");
  return { success: "Informations enregistrées." };
}

const PHOTO_MAX_BYTES = 1024 * 1024; // 1 Mo
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function uploadPhotoAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const session = await getSession();
  if (!session) return { error: "Session expirée : reconnectez-vous." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisissez une image." };
  }
  if (!PHOTO_TYPES.includes(file.type)) {
    return { error: "Format non supporté (PNG, JPEG ou WebP uniquement)." };
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return { error: "Image trop lourde (1 Mo maximum)." };
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  await prisma.user.update({
    where: { id: session.sub },
    data: { photo: `data:${file.type};base64,${base64}` },
  });
  await logAction("PROFILE_UPDATED", `Photo de profil mise à jour par ${session.email}`, session.sub);
  revalidatePath("/profil");
  return { success: "Photo de profil enregistrée." };
}

export async function removePhotoAction(): Promise<ProfileState> {
  const session = await getSession();
  if (!session) return { error: "Session expirée : reconnectez-vous." };

  await prisma.user.update({ where: { id: session.sub }, data: { photo: null } });
  await logAction("PROFILE_UPDATED", `Photo de profil retirée par ${session.email}`, session.sub);
  revalidatePath("/profil");
  return { success: "Photo retirée." };
}
