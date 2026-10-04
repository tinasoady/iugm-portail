import type { AuditAction } from "./audit";

// Libellé lisible de chaque action du journal d'audit. Typé en Record<AuditAction, ...>
// : ajouter une action dans lib/audit.ts sans son libellé ici fait échouer la
// compilation, donc le journal n'affiche jamais un code brut ni ne filtre à côté.
export const ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: "Connexion réussie",
  LOGIN_FAILED: "Connexion échouée",
  LOGIN_RATE_LIMITED: "Connexion bloquée (anti-bruteforce)",
  LOGIN_2FA_REQUIRED: "Second facteur demandé",
  LOGOUT: "Déconnexion",
  USER_CREATED: "Compte créé",
  USER_INVITED: "Invitation envoyée",
  INVITATION_RESENT: "Invitation renvoyée",
  INVITATION_CANCELLED: "Invitation annulée",
  USER_ACTIVATED: "Compte activé",
  USER_DELETED: "Compte supprimé",
  PROFILE_UPDATED: "Profil mis à jour",
  PASSWORD_CHANGED: "Mot de passe changé",
  PASSWORD_RESET: "Mot de passe réinitialisé (admin)",
  PASSWORD_RESET_REQUESTED: "Mot de passe oublié : lien demandé",
  PASSWORD_RESET_COMPLETED: "Mot de passe réinitialisé (lien e-mail)",
  RECOVERY_EMAIL_REQUESTED: "Adresse de récupération : vérification demandée",
  RECOVERY_EMAIL_CONFIRMED: "Adresse de récupération confirmée",
  RECOVERY_EMAIL_REMOVED: "Adresse de récupération retirée",
  TWO_FACTOR_ENABLED: "Double authentification activée",
  TWO_FACTOR_DISABLED: "Double authentification désactivée",
  TWO_FACTOR_RESET: "Double authentification réinitialisée (admin)",
  RECOVERY_CODES_REGENERATED: "Codes de secours régénérés",
  PERMISSION_UPDATED: "Permission modifiée",
  SETTINGS_UPDATED: "Paramètres modifiés",
  STUDENT_REGISTERED: "Étudiant enregistré",
  STUDENT_UPDATED: "Dossier modifié",
  STUDENT_DELETED: "Dossier supprimé",
  STUDENT_REENROLLED: "Étudiant réinscrit",
  REENROLLMENT_FORCED: "Réinscription forcée (dérogation)",
  RECEIPT_VERIFIED: "Reçu bancaire vérifié",
  ECOLAGE_PAYMENT_RECORDED: "Versement d'écolage enregistré",
  ECOLAGE_PAYMENT_CANCELLED: "Versement d'écolage annulé",
  ADMIN_INSCRIPTION_VALIDATED: "Inscr. administrative validée",
  PEDAGO_INSCRIPTION_VALIDATED: "Inscr. pédagogique validée",
  INSCRIPTION_RECEIPT_PRINTED: "Reçu d'inscription imprimé",
  RESULT_ASSIGNED: "Résultat assigné",
  GRADE_ASSIGNED: "Note assignée",
  SUBJECT_CREATED: "Matière créée",
  SUBJECT_DELETED: "Matière supprimée",
  SUBJECT_REQUIREMENT_UPDATED: "Matière : obligatoire/facultative modifiée",
  CSV_EXPORTED: "Export de données",
  CSV_IMPORTED: "Import CSV",
  EXPORT_RATE_LIMITED: "Export bloqué (trop d'appels)",
  PRESELECTION_IMPORTED: "Présélection importée",
  PRESELECTION_USED: "Fiche de présélection utilisée",
  PRESELECTION_BATCH_DELETED: "Lot de présélection supprimé",
  PRESELECTION_BATCH_STUDENTS_DELETED: "Dossiers d'un lot supprimés",
  QR_TOKEN_REGENERATED: "QR code régénéré",
  ANNOUNCEMENT_SENT: "Communiqué envoyé",
  ANNOUNCEMENT_DELETED: "Communiqué supprimé",
  NOTIFICATION_FAILED: "Notification e-mail non envoyée",
  OFFLINE_MUTATION_SYNCED: "Saisie hors ligne synchronisée",
};

// Actions à signaler visuellement dans le journal (tentatives d'intrusion,
// blocages, désactivations de protections)
export const ALERT_ACTIONS: ReadonlySet<string> = new Set<AuditAction>([
  "LOGIN_FAILED",
  "LOGIN_RATE_LIMITED",
  "EXPORT_RATE_LIMITED",
  "TWO_FACTOR_DISABLED",
  "TWO_FACTOR_RESET",
  "NOTIFICATION_FAILED",
]);

export function isKnownAction(value: string | undefined): value is AuditAction {
  return value !== undefined && Object.hasOwn(ACTION_LABELS, value);
}

// Libellé d'une action lue en base : une ancienne ligne peut porter un code
// qui n'existe plus dans AuditAction, on l'affiche alors tel quel.
export function actionLabel(action: string): string {
  return isKnownAction(action) ? ACTION_LABELS[action] : action;
}
