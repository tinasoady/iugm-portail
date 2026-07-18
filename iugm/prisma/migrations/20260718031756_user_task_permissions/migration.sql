-- AlterTable
ALTER TABLE "User" ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
