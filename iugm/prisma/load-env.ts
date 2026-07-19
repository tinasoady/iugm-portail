import { loadEnvFile } from "node:process"; 
import { existsSync } from "node:fs"; 

// Module à effet de bord : doit être importé AVANT lib/prisma,
// sinon le pool pg est créé avec DATABASE_URL undefined.
if (existsSync(".env.local")) {
  loadEnvFile(".env.local");
}
