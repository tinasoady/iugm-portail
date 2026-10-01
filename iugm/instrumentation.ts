import type { Instrumentation } from "next";

import { buildErrorLogEntry } from "@/lib/error-log";

// Appelée par Next.js pour chaque erreur capturée côté serveur (rendu, route
// API, Server Action). On l'écrit en JSON structuré : c'est la base de toute
// supervision. Pour brancher un service d'alerte (Sentry, Better Stack...),
// c'est ici qu'il faudrait envoyer l'entrée en plus du journal.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  try {
    console.error(
      JSON.stringify(
        buildErrorLogEntry(err, {
          method: request.method,
          path: request.path,
          routeType: context.routeType,
          routePath: context.routePath,
        }),
      ),
    );
  } catch {
    // La journalisation ne doit jamais faire échouer la requête
  }
};
