"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createSubject,
  deleteSubject,
  updateSubjectSettings,
  type GradingSettings,
} from "@/lib/subjects";
import { LEVELS } from "@/lib/level-shared";
import { formationsForLevel } from "@/lib/formations";
import { DEFAULT_BONUS_THRESHOLD } from "@/lib/grading";
import {
  getUserFormation,
  hasTaskPermission,
  PERMISSION_DENIED_MESSAGE,
} from "@/lib/permissions";

// Le catalogue des matières (nom, filière, niveau, semestre et paramètres de
// calcul) est alimenté par le superadmin, ou par un agent pédagogique ayant
// la tâche "matieres" — limité à sa formation s'il en a une (une Server
// Action reste appelable par POST direct : tout est revérifié ici).
async function requireCatalogManager() {
  const session = await getSession();
  if (!session || !["SUPERADMIN", "AGENT_PEDAGOGIQUE"].includes(session.role)) {
    return { error: "Accès refusé." };
  }
  if (!(await hasTaskPermission(session.sub, session.role, "matieres"))) {
    return { error: PERMISSION_DENIED_MESSAGE };
  }
  const formation = await getUserFormation(session.sub, session.role);
  return { session, formation };
}

const OTHER_FORMATION_MESSAGE =
  "Cette matière relève d'une autre formation : vous ne pouvez pas la modifier.";

// Vérifie qu'une matière existante est dans le périmètre de l'utilisateur
async function subjectInScope(id: string, formation: string | null) {
  if (!formation) return true;
  const subject = await prisma.subject.findUnique({ where: { id }, select: { formation: true } });
  return !subject || subject.formation === formation;
}

export type SubjectState = { success?: string; error?: string };

const toNumber = (raw: FormDataEntryValue | null) =>
  Number(String(raw ?? "").trim().replace(",", "."));

// Lit les paramètres de calcul communs aux formulaires d'ajout et de
// modification. `allowUnsetSemester` : une matière ajoutée avant ce
// paramètre peut rester « semestre non précisé » ; une nouvelle matière doit
// en avoir un.
function readGradingSettings(
  formData: FormData,
  allowUnsetSemester: boolean,
): GradingSettings | { error: string } {
  const semesterRaw = String(formData.get("semester") ?? "");
  if (!["S1", "S2"].includes(semesterRaw) && !(allowUnsetSemester && semesterRaw === "")) {
    return { error: "Précisez le semestre de la matière (S1 ou S2)." };
  }
  const mandatoryRaw = String(formData.get("mandatory") ?? "");
  if (mandatoryRaw !== "true" && mandatoryRaw !== "false") {
    return { error: "Précisez si la matière est obligatoire ou facultative." };
  }
  const mandatory = mandatoryRaw === "true";
  const bonusRaw = String(formData.get("bonusThreshold") ?? "").trim();
  const ccRaw = String(formData.get("ccWeight") ?? "").trim();
  const eliminationRaw = String(formData.get("eliminationThreshold") ?? "").trim();
  return {
    semester: semesterRaw || null,
    mandatory,
    coefficient: toNumber(formData.get("coefficient")),
    // Champs masqués selon le caractère : on garde alors leur valeur neutre
    bonusThreshold: bonusRaw === "" ? DEFAULT_BONUS_THRESHOLD : toNumber(bonusRaw),
    ccWeight: ccRaw === "" ? 0 : toNumber(ccRaw),
    eliminationThreshold: !mandatory || eliminationRaw === "" ? null : toNumber(eliminationRaw),
  };
}

export async function createSubjectAction(
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const auth = await requireCatalogManager();
  if ("error" in auth) return auth;

  const name = String(formData.get("name") ?? "").trim();
  const formation = String(formData.get("formation") ?? "");
  const level = String(formData.get("level") ?? "");
  const settings = readGradingSettings(formData, false);
  if ("error" in settings) return settings;

  if (!LEVELS.includes(level as (typeof LEVELS)[number])) {
    return { error: "Niveau invalide." };
  }
  // Filière valide pour CE niveau : mentions de licence en L1-L3,
  // spécialisations de master en M1-M2 (lib/formations.ts) — les deux listes
  // diffèrent, une filière de l'une n'est pas valide pour l'autre.
  if (!formationsForLevel(level).some((f) => f.label === formation)) {
    return { error: "Filière invalide pour ce niveau." };
  }
  if (auth.formation && formation !== auth.formation) {
    return { error: `Vous ne pouvez ajouter des matières que pour ${auth.formation}.` };
  }

  try {
    await createSubject({ name, formation, level, ...settings }, auth.session.sub);
    revalidatePath("/admin/matieres");
    return {
      success: `Matière « ${name} » ajoutée pour ${formation} — ${level} (${settings.semester}, coef. ${settings.coefficient}, ${
        settings.mandatory ? "obligatoire" : "facultative"
      }).`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'ajout." };
  }
}

export async function updateSubjectSettingsAction(
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const auth = await requireCatalogManager();
  if ("error" in auth) return auth;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Matière manquante." };
  if (!(await subjectInScope(id, auth.formation))) return { error: OTHER_FORMATION_MESSAGE };
  const settings = readGradingSettings(formData, true);
  if ("error" in settings) return settings;

  try {
    await updateSubjectSettings(id, settings, auth.session.sub);
    revalidatePath("/admin/matieres");
    revalidatePath("/agent-pedagogique");
    return { success: "Paramètres enregistrés, moyennes recalculées." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de l'enregistrement." };
  }
}

export async function deleteSubjectAction(
  _prev: SubjectState,
  formData: FormData,
): Promise<SubjectState> {
  const auth = await requireCatalogManager();
  if ("error" in auth) return auth;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Matière manquante." };
  if (!(await subjectInScope(id, auth.formation))) return { error: OTHER_FORMATION_MESSAGE };

  try {
    await deleteSubject(id, auth.session.sub);
    revalidatePath("/admin/matieres");
    revalidatePath("/matieres");
    return { success: "Matière supprimée." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la suppression." };
  }
}
