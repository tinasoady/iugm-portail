import { prisma } from "./prisma";
import packageJson from "../package.json";

// Contrôle de santé : le portail répond-il et sa base aussi ? Utilisable par un
// superviseur externe (UptimeRobot, Better Stack, sonde Docker...) qui interroge
// /api/health toutes les minutes et alerte au premier échec.

export type HealthReport = {
  status: "ok" | "degraded";
  database: "ok" | "error";
  version: string;
  timestamp: string;
};

const DB_TIMEOUT_MS = 3000;

// La base est jugée en panne si elle ne répond pas sous 3 s : une sonde ne doit
// jamais rester pendue plus longtemps que la fréquence à laquelle elle interroge.
// `probe` : la requête de contrôle (remplaçable pour tester le délai sans dépendre
// de la vitesse réelle de la base).
export async function checkDatabase(
  timeoutMs = DB_TIMEOUT_MS,
  probe: () => Promise<unknown> = () => prisma.$queryRaw`SELECT 1`,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("délai dépassé")), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Volontairement minimal : aucune information interne (message d'erreur, hôte de
// base, variables d'environnement) dans une réponse publique.
export async function getHealthReport(): Promise<HealthReport> {
  const dbOk = await checkDatabase();
  return {
    status: dbOk ? "ok" : "degraded",
    database: dbOk ? "ok" : "error",
    version: packageJson.version,
    timestamp: new Date().toISOString(),
  };
}
