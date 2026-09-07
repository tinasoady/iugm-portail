"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { createSubject, deleteSubject } from "@/lib/subjects";
import { LEVELS } from "@/lib/level-shared";
import { FORMATIONS } from "@/lib/formations";

// Le catalogue des matières (nom, filière, niveau) n'est alimenté QUE par le
// superadmin — voir la note sur Subject dans prisma/schema.prisma. La
// décision obligatoire/facultatif est traitée à part (tâche "matieres", voir
// app/matieres/actions.ts), accessible au secrétaire et à l'agent pédagogique.
async function requireSuperadmin() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") return null;
  return session;
}

export type SubjectState = { success?: string; error?: string };

const FORMATION_LABELS = FORMATIONS.map((f) => f.label);

export async function createSubjectAction(
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const name = String(formData.get("name") ?? "").trim();
  const formation = String(formData.get("formation") ?? "");
  const level = String(formData.get("level") ?? "");

  if (!FORMATION_LABELS.includes(formation as (typeof FORMATION_LABELS)[number])) {
    return { error: "Filière invalide." };
  }
  if (!LEVELS.includes(level as (typeof LEVELS)[number])) {
    return { error: "Niveau invalide." };
  }

  try {
    await createSubject({ name, formation, level }, session.sub);
    revalidatePath("/admin/matieres");
    revalidatePath("/matieres");
    return { success: `Matière « ${name} » ajoutée pour ${formation} — ${level}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'ajout." };
  }
}

export async function deleteSubjectAction(
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Matière manquante." };

  try {
    await deleteSubject(id, session.sub);
    revalidatePath("/admin/matieres");
    revalidatePath("/matieres");
    return { success: "Matière supprimée." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la suppression." };
  }
}
