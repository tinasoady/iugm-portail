import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Catalogue des tâches attribuables individuellement à chaque agent.
// Deux agents du même rôle (ex : secrétaire vs chef de scolarité) peuvent
// avoir des permissions différentes : le superadmin coche les tâches
// autorisées pour chacun depuis la page Permissions.
// ---------------------------------------------------------------------------

export type TaskKey =
  | "inscription"
  | "reinscription"
  | "verification_paiement"
  | "ecolage"
  | "csv"
  | "suppression_etudiant"
  | "validation_pedagogique"
  | "resultats"
  | "conduite"
  | "communiquer";

export const TASKS: Record<TaskKey, { label: string; roles: string[] }> = {
  // Tâches du domaine agent d'administration
  inscription: {
    label: "Inscrire de nouveaux étudiants",
    roles: ["AGENT_ADMINISTRATION"],
  },
  reinscription: {
    label: "Réinscrire les anciens étudiants",
    roles: ["AGENT_ADMINISTRATION"],
  },
  verification_paiement: {
    label: "Vérifier les reçus bancaires et valider l'inscription administrative",
    roles: ["AGENT_ADMINISTRATION"],
  },
  ecolage: {
    label: "Consulter la gestion d'écolage",
    roles: ["AGENT_ADMINISTRATION"],
  },
  csv: {
    label: "Exporter / importer les données CSV",
    roles: ["AGENT_ADMINISTRATION"],
  },
  suppression_etudiant: {
    label: "Supprimer des dossiers étudiants",
    roles: ["AGENT_ADMINISTRATION"],
  },
  // Tâches du domaine agent pédagogique
  validation_pedagogique: {
    label: "Valider les inscriptions pédagogiques et imprimer les reçus",
    roles: ["AGENT_PEDAGOGIQUE"],
  },
  resultats: {
    label: "Assigner les résultats académiques",
    roles: ["AGENT_PEDAGOGIQUE"],
  },
  conduite: {
    label: "Rédiger les appréciations de conduite",
    roles: ["AGENT_PEDAGOGIQUE"],
  },
  // Tâche commune aux deux rôles d'agents
  communiquer: {
    label: "Envoyer des communiqués aux étudiants",
    roles: ["AGENT_ADMINISTRATION", "AGENT_PEDAGOGIQUE"],
  },
};

// Tâches disponibles pour un rôle donné
export function tasksForRole(role: string): TaskKey[] {
  return (Object.keys(TASKS) as TaskKey[]).filter((k) => TASKS[k].roles.includes(role));
}

// Vérifie qu'un utilisateur a la permission d'exécuter une tâche.
// Le superadmin a toujours tous les droits ; pour un agent, la tâche doit
// relever de son rôle ET figurer dans ses permissions individuelles.
export async function hasTaskPermission(
  userId: string,
  role: string,
  task: TaskKey,
): Promise<boolean> {
  if (role === "SUPERADMIN") return true;
  if (!TASKS[task].roles.includes(role)) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });
  return user?.permissions.includes(task) ?? false;
}

export const PERMISSION_DENIED_MESSAGE =
  "Vous n'avez pas la permission d'effectuer cette tâche. Contactez le superadmin.";

// ---------------------------------------------------------------------------
// Périmètre par formation : une secrétaire affectée à une formation
// (ex : "Management") ne voit et ne manipule que les dossiers de sa formation.
// ---------------------------------------------------------------------------

export const FORMATION_DENIED_MESSAGE =
  "Ce dossier relève d'une autre formation : l'étudiant doit s'adresser au secrétaire de sa formation.";

// Formation affectée à l'utilisateur (null = accès à toutes les formations)
export async function getUserFormation(userId: string, role: string): Promise<string | null> {
  if (role === "SUPERADMIN") return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { formation: true },
  });
  return user?.formation ?? null;
}

// Vérifie qu'un dossier étudiant est dans le périmètre de l'agent
export async function canManageStudent(
  userId: string,
  role: string,
  studentId: string,
): Promise<boolean> {
  const formation = await getUserFormation(userId, role);
  if (!formation) return true;
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { mention: true, program: true },
  });
  if (!student) return true; // dossier inexistant : l'action échouera plus loin avec son propre message
  return (student.mention ?? student.program) === formation;
}
