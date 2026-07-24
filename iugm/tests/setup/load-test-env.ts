import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";

// Miroir de prisma/load-env.ts, mais pour .env.test : doit s'exécuter avant
// tout import de lib/prisma (setupFiles de Vitest garantit cet ordre), sinon
// le pool pg serait créé avec l'URL de la base de développement, voire vide.
//
// En local, .env.test fournit DATABASE_URL. En CI (voir .github/workflows/ci.yml),
// le service Postgres est décrit directement via une variable d'environnement
// du job : pas de fichier à lire, et il ne faut surtout pas qu'un .env.test
// local écrase ces identifiants CI si jamais l'un traînait par erreur.
if (existsSync(".env.test")) {
  loadEnvFile(".env.test");
} else if (!process.env.DATABASE_URL) {
  throw new Error(
    ".env.test introuvable et DATABASE_URL non définie — copiez .env.test.example en local (voir README), ou fournissez DATABASE_URL via l'environnement.",
  );
}
