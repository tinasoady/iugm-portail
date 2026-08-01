-- CreateEnum
CREATE TYPE "PreselectionCategory" AS ENUM ('PRESELECTION', 'EXISTING');

-- DropIndex
DROP INDEX "PreselectionCandidate_academicYear_idx";

-- AlterTable
ALTER TABLE "PreselectionCandidate" ADD COLUMN     "category" "PreselectionCategory" NOT NULL DEFAULT 'PRESELECTION';

-- CreateIndex
CREATE INDEX "PreselectionCandidate_academicYear_category_idx" ON "PreselectionCandidate"("academicYear", "category");
