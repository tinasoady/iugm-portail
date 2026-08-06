-- CreateEnum
CREATE TYPE "AnnouncementKind" AS ENUM ('MANUAL', 'ADMISSION_NOTICE');

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "kind" "AnnouncementKind" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceAcademicYear" TEXT,
ADD COLUMN     "studentId" TEXT;

-- AlterTable
ALTER TABLE "EnrollmentHistory" ADD COLUMN     "docBlueFolder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "docTranscript" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "docBlueFolder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "docTranscript" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Announcement_studentId_idx" ON "Announcement"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Announcement_studentId_sourceAcademicYear_kind_key" ON "Announcement"("studentId", "sourceAcademicYear", "kind");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

