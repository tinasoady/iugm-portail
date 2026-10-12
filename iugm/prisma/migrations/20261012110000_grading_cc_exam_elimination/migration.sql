-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "ccWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "eliminationThreshold" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "ccValue" DOUBLE PRECISION,
ADD COLUMN     "examValue" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "AcademicResult" ADD COLUMN     "eliminatedBy" TEXT;
