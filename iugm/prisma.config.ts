import { readFileSync, existsSync } from "node:fs";

// Structure pour stocker nos variables d'environnement nettoyées
const localEnv: Record<string, string> = {};

// 1. Lecture manuelle et robuste du fichier .env.local
if (existsSync(".env.local")) {
  const content = readFileSync(".env.local", "utf8");
  
  content.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();
    // On ignore les commentaires et les lignes vides
    if (!trimmedLine || trimmedLine.startsWith("#") || !trimmedLine.includes("=")) return;

    const [key, ...valueParts] = trimmedLine.split("=");
    const cleanedKey = key.trim();
    let cleanedValue = valueParts.join("=").trim();

    // On retire proprement les guillemets doublés si présents
    if (cleanedValue.startsWith('"') && cleanedValue.endsWith('"')) {
      cleanedValue = cleanedValue.slice(1, -1);
    }

    localEnv[cleanedKey] = cleanedValue;
  });
}

// 2. Récupération de la chaîne de connexion
let databaseUrl = process.env.DATABASE_URL || localEnv.DATABASE_URL || "";

// 3. Interpolation manuelle des variables imbriquées (ex: ${POSTGRES_USER})
if (databaseUrl.includes("${")) {
  databaseUrl = databaseUrl.replace(/\${(\w+)}/g, (_, varName) => {
    return localEnv[varName] || process.env[varName] || "";
  });
}

// 4. Déclaration dans une variable nommée pour corriger l'avertissement ESLint
const config = {
  datasource: {
    url: databaseUrl,
  },
};

export default config;