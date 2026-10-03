-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recoveryEmail" TEXT;

-- CreateTable
CREATE TABLE "RecoveryEmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryEmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryEmailToken_tokenHash_key" ON "RecoveryEmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RecoveryEmailToken_userId_idx" ON "RecoveryEmailToken"("userId");

-- CreateIndex
CREATE INDEX "RecoveryEmailToken_expiresAt_idx" ON "RecoveryEmailToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "RecoveryEmailToken" ADD CONSTRAINT "RecoveryEmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
