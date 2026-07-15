-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "academicYear" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "baccSeries" TEXT,
ADD COLUMN     "baccYear" TEXT,
ADD COLUMN     "birthPlace" TEXT,
ADD COLUMN     "cin" TEXT,
ADD COLUMN     "cinIssueDate" TIMESTAMP(3),
ADD COLUMN     "cinIssuePlace" TEXT,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "fatherName" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "guardianName" TEXT,
ADD COLUMN     "guardianPhone" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "mention" TEXT,
ADD COLUMN     "motherName" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "repeatCode" TEXT,
ADD COLUMN     "track" TEXT,
ADD COLUMN     "trainingType" TEXT,
ALTER COLUMN "program" DROP NOT NULL,
ALTER COLUMN "level" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Student_academicYear_idx" ON "Student"("academicYear");
