-- CreateEnum
CREATE TYPE "EcolagePaymentType" AS ENUM ('TRANCHE_S1', 'TRANCHE_S2', 'TOTALITE');

-- AlterTable
ALTER TABLE "Tariff" ADD COLUMN     "formation" TEXT;

-- CreateTable
CREATE TABLE "EcolagePayment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "type" "EcolagePaymentType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcolagePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EcolagePayment_studentId_idx" ON "EcolagePayment"("studentId");

-- CreateIndex
CREATE INDEX "EcolagePayment_academicYear_idx" ON "EcolagePayment"("academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "EcolagePayment_studentId_academicYear_type_key" ON "EcolagePayment"("studentId", "academicYear", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Tariff_formation_key" ON "Tariff"("formation");

-- AddForeignKey
ALTER TABLE "EcolagePayment" ADD CONSTRAINT "EcolagePayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcolagePayment" ADD CONSTRAINT "EcolagePayment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
