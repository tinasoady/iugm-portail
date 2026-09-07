"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { createSubject, deleteSubject } from "@/lib/subjects";
import { LEVELS } from "@/lib/level-shared";
import { formationsForLevel } from "@/lib/formations";

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

export async function createSubjectAction(
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const name = String(formData.get("name") ?? "").trim();
  const formation = String(formData.get("formation") ?? "");
  const level = String(formData.get("level") ?? "");

  if (!LEVELS.includes(level as (typeof LEVELS)[number])) {
    return { error: "Niveau invalide." };
  }
  // Filière valide pour CE niveau : mentions de licence en L1-L3,
  // spécialisations de master en M1-M2 (lib/formations.ts) — les deux listes
  // diffèrent, une filière de l'une n'est pas valide pour l'autre.
  if (!formationsForLevel(level).some((f) => f.label === formation)) {
    return { error: "Filière invalide pour ce niveau." };
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
