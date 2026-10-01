// Journalisation structurée des erreurs serveur : une ligne JSON par erreur sur
// la sortie standard d'erreur, exploitable telle quelle par n'importe quel
// collecteur (Vercel Logs, Docker logs, Loki, Datadog...). Fonctions pures,
// sans accès à Next.js, pour être testées directement.

export type RequestErrorContext = {
  method: string;
  path: string;
  routeType?: string;
  routePath?: string;
};

export type ErrorLogEntry = {
  level: "error";
  event: "request_error";
  timestamp: string;
  message: string;
  digest?: string;
  stack?: string;
  method: string;
  // Chemin SANS paramètres d'URL : ils peuvent contenir un jeton (lien de
  // réinitialisation de mot de passe) ou une recherche nominative.
  path: string;
  routeType?: string;
  routePath?: string;
};

// Jamais d'en-têtes ni de cookies dans le journal : ils contiennent la session.
export function buildErrorLogEntry(
  err: unknown,
  context: RequestErrorContext,
  now: Date = new Date(),
): ErrorLogEntry {
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  const stack =
    err instanceof Error && err.stack
      ? err.stack.split("\n").slice(0, 8).join("\n")
      : undefined;

  return {
    level: "error",
    event: "request_error",
    timestamp: now.toISOString(),
    message: message.slice(0, 500),
    digest,
    stack,
    method: context.method,
    path: context.path.split(/[?#]/)[0],
    routeType: context.routeType,
    routePath: context.routePath,
  };
}
