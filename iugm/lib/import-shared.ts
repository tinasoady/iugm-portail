// Constante pure (aucune dépendance serveur), importable depuis le
// composant client du formulaire d'import comme depuis l'action serveur et
// la route de jeton Blob, pour que les trois restent au même chiffre sans
// synchronisation manuelle. Voir app/admin/base-donnees/import-form.tsx
// (vérification immédiate au choix du fichier), app/api/admin/import-upload/
// route.ts (plafond du jeton d'upload Blob) et app/admin/base-donnees/
// actions.ts (vérification finale côté serveur).
export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024; // 25 Mo

export function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",");
}
