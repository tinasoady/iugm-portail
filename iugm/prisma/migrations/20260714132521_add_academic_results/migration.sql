-- CreateEnum
CREATE TYPE "Mention" AS ENUM ('ECHEC', 'PASSABLE', 'ASSEZ_BIEN', 'BIEN', 'TRES_BIEN');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "department" TEXT;

-- CreateTable
CREATE TABLE "AcademicResult" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "average" DOUBLE PRECISION NOT NULL,
    "mention" "Mention" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicResult_mention_idx" ON "AcademicResult"("mention");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicResult_studentId_academicYear_semester_key" ON "AcademicResult"("studentId", "academicYear", "semester");

-- AddForeignKey
ALTER TABLE "AcademicResult" ADD CONSTRAINT "AcademicResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
