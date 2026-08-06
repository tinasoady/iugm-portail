import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// En-têtes de sécurité HTTP, appliqués à toutes les routes.
//
// CSP sans nonce (voir node_modules/next/dist/docs/01-app/02-guides/
// content-security-policy.md) : l'approche par nonce exige un `proxy.ts` qui
// force le rendu dynamique sur toutes les pages, ce qui va à l'encontre du
// choix déjà fait dans ce projet (pas de middleware, chaque page/action se
// protège elle-même — voir lib/auth.ts). `'unsafe-inline'` reste nécessaire
// pour script-src (script d'init du thème dans app/layout.tsx + scripts
// d'hydratation générés par Next lui-même) et style-src (attributs `style`
// dynamiques, ex. app/ui/line-chart.tsx) ; ce n'est pas une régression XSS
// pour ce projet, puisqu'aucun contenu utilisateur n'est jamais rendu en HTML
// brut (pas de dangerouslySetInnerHTML sur des données saisies par un
// utilisateur, React échappe tout par défaut).
const isDev = process.env.NODE_ENV === "development";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          // Filet de sécurité pour les navigateurs qui ignorent frame-ancestors
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Aucune fonctionnalité du navigateur utilisée par le portail
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // Sans effet en HTTP (ignoré par les navigateurs) : inoffensif en
          // développement, actif dès que le déploiement passe en HTTPS.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
