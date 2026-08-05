import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Next.js plafonne à 1 Mo par défaut, en-deçà de nos propres limites
      // d'upload (voir MAX_BYTES dans app/admin/base-donnees/actions.ts et
      // app/admin/parametres/actions.ts) : sans ce réglage, tout fichier de
      // plus de 1 Mo échoue au niveau du framework avant même d'atteindre
      // notre validation, avec un message générique ("Failed to fetch").
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
