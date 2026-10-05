"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { createSubject, deleteSubject, setSubjectMandatory } from "@/lib/subjects";
import { LEVELS } from "@/lib/level-shared";
import { formationsForLevel } from "@/lib/formations";

// Le catalogue des matières (nom, filière, niveau, caractère obligatoire ou
// facultatif) n'est alimenté QUE par le superadmin — voir la note sur Subject
// dans prisma/schema.prisma.
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
  const mandatoryRaw = String(formData.get("mandatory") ?? "");
  if (mandatoryRaw !== "true" && mandatoryRaw !== "false") {
    return { error: "Précisez si la matière est obligatoire ou facultative." };
  }
  const mandatory = mandatoryRaw === "true";

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
    await createSubject({ name, formation, level, mandatory }, session.sub);
    revalidatePath("/admin/matieres");
    return {
      success: `Matière « ${name} » ajoutée (${mandatory ? "obligatoire" : "facultative"}) pour ${formation} — ${level}.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'ajout." };
  }
}

export async function setSubjectMandatoryAction(
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const session = await requireSuperadmin();
  if (!session) return { error: "Accès refusé." };

  const id = String(formData.get("id") ?? "");
  const mandatoryRaw = String(formData.get("mandatory") ?? "");
  if (!id) return { error: "Matière manquante." };
  if (mandatoryRaw !== "true" && mandatoryRaw !== "false") {
    return { error: "Valeur invalide." };
  }
  const mandatory = mandatoryRaw === "true";

  try {
    await setSubjectMandatory(id, mandatory, session.sub);
    revalidatePath("/admin/matieres");
    return { success: `Matière déclarée ${mandatory ? "obligatoire" : "facultative"}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." };
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
