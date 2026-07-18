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
  | "conduite";

export const TASKS: Record<TaskKey, { label: string; role: string }> = {
  // Tâches du domaine agent d'administration
  inscription: {
    label: "Inscrire de nouveaux étudiants",
    role: "AGENT_ADMINISTRATION",
  },
  reinscription: {
    label: "Réinscrire les anciens étudiants",
    role: "AGENT_ADMINISTRATION",
  },
  verification_paiement: {
    label: "Vérifier les reçus bancaires et valider l'inscription administrative",
    role: "AGENT_ADMINISTRATION",
  },
  ecolage: {
    label: "Consulter la gestion d'écolage",
    role: "AGENT_ADMINISTRATION",
  },
  csv: {
    label: "Exporter / importer les données CSV",
    role: "AGENT_ADMINISTRATION",
  },
  suppression_etudiant: {
    label: "Supprimer des dossiers étudiants",
    role: "AGENT_ADMINISTRATION",
  },
  // Tâches du domaine agent pédagogique
  validation_pedagogique: {
    label: "Valider les inscriptions pédagogiques et imprimer les reçus",
    role: "AGENT_PEDAGOGIQUE",
  },
  resultats: {
    label: "Assigner les résultats académiques",
    role: "AGENT_PEDAGOGIQUE",
  },
  conduite: {
    label: "Rédiger les appréciations de conduite",
    role: "AGENT_PEDAGOGIQUE",
  },
};

// Tâches disponibles pour un rôle donné
export function tasksForRole(role: string): TaskKey[] {
  return (Object.keys(TASKS) as TaskKey[]).filter((k) => TASKS[k].role === role);
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
  if (TASKS[task].role !== role) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });
  return user?.permissions.includes(task) ?? false;
}

export const PERMISSION_DENIED_MESSAGE =
  "Vous n'avez pas la permission d'effectuer cette tâche. Contactez le superadmin.";
