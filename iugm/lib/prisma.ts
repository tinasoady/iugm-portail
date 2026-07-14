import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

// 1. Création du pool de connexion PostgreSQL natif requis par Prisma 7
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// 2. Instanciation combinée avec l'adaptateur v7 ET vos filtres de logs
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter, // Gestion du pilote de base de données
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"], // Vos préférences de logs
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;