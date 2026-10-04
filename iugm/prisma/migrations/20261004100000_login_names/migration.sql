-- Identifiants de connexion par nom (et non plus par adresse e-mail) + invitations
-- de comptes du personnel. Voir prisma/schema.prisma (User.email = identifiant).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "legacyLogin" TEXT,
ADD COLUMN     "pendingActivation" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ActivationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivationToken_tokenHash_key" ON "ActivationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ActivationToken_userId_idx" ON "ActivationToken"("userId");

-- CreateIndex
CREATE INDEX "ActivationToken_expiresAt_idx" ON "ActivationToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_legacyLogin_key" ON "User"("legacyLogin");

-- AddForeignKey
ALTER TABLE "ActivationToken" ADD CONSTRAINT "ActivationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise des comptes du PERSONNEL : l'identifiant devient le nom (partie locale de
-- l'ancien e-mail, nettoyée), numéroté en cas de doublon. Idempotent : une ligne dont
-- l'identifiant ne contient déjà plus de « @ » n'est pas retouchée.
-- (Les comptes ÉTUDIANTS sont repris par scripts/backfill-student-logins.ts, qui
-- conserve l'ancien identifiant dans legacyLogin.)
WITH staff AS (
    SELECT
        "id",
        COALESCE(
            NULLIF(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g'), ''),
            'agent'
        ) AS base,
        "createdAt"
    FROM "User"
    WHERE "role" <> 'ETUDIANT' AND position('@' in "email") > 0
), ranked AS (
    SELECT "id", base, row_number() OVER (PARTITION BY base ORDER BY "createdAt", "id") AS rn
    FROM staff
)
UPDATE "User" u
SET "email" = CASE WHEN r.rn = 1 THEN r.base ELSE r.base || r.rn::text END
FROM ranked r
WHERE u."id" = r."id";
