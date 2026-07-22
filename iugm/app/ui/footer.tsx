import packageJson from "../../package.json";

// Pied de page persistant des espaces authentifiés (voir AppShell). Le
// numéro de version vient de package.json (source unique), pas d'un texte
// dupliqué à mettre à jour à la main à chaque publication.
export function Footer({ institutionName }: { institutionName: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-black/5 px-6 py-4 text-center text-xs text-zinc-400 dark:border-white/10 dark:text-zinc-500">
      {institutionName} · Version {packageJson.version} · © {year} by Tinasoady
    </footer>
  );
}
