-- DropIndex
DROP INDEX "Student_cin_trgm_idx";

-- DropIndex
DROP INDEX "Student_department_trgm_idx";

-- DropIndex
DROP INDEX "Student_fullName_trgm_idx";

-- DropIndex
DROP INDEX "Student_matricule_trgm_idx";

-- DropIndex
DROP INDEX "Student_program_trgm_idx";

-- DropIndex
DROP INDEX "Student_receiptNumber_trgm_idx";

-- DropIndex
DROP INDEX "Student_track_trgm_idx";

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "pedagoValidatedAt" TIMESTAMP(3),
ADD COLUMN     "receiptVerifiedAt" TIMESTAMP(3);
