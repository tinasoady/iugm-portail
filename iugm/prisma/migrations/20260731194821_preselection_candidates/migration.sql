-- CreateTable
CREATE TABLE "PreselectionCandidate" (
    "id" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "birthDate" TIMESTAMP(3),
    "birthPlace" TEXT,
    "nationality" TEXT,
    "cin" TEXT,
    "cinIssueDate" TIMESTAMP(3),
    "cinIssuePlace" TEXT,
    "phone" TEXT,
    "personalEmail" TEXT,
    "address" TEXT,
    "baccNumber" TEXT,
    "baccSeries" TEXT,
    "baccMention" TEXT,
    "baccYear" TEXT,
    "baccCenter" TEXT,
    "baccCountry" TEXT,
    "previousSchool" TEXT,
    "fatherName" TEXT,
    "motherName" TEXT,
    "parentsPhone" TEXT,
    "parentsAddress" TEXT,
    "parentsCity" TEXT,
    "formation" TEXT,
    "level" TEXT,
    "usedByStudentId" TEXT,
    "usedAt" TIMESTAMP(3),
    "importedById" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreselectionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreselectionCandidate_usedByStudentId_key" ON "PreselectionCandidate"("usedByStudentId");

-- CreateIndex
CREATE INDEX "PreselectionCandidate_academicYear_idx" ON "PreselectionCandidate"("academicYear");

-- CreateIndex
CREATE INDEX "PreselectionCandidate_fullName_idx" ON "PreselectionCandidate"("fullName");

-- AddForeignKey
ALTER TABLE "PreselectionCandidate" ADD CONSTRAINT "PreselectionCandidate_usedByStudentId_fkey" FOREIGN KEY ("usedByStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreselectionCandidate" ADD CONSTRAINT "PreselectionCandidate_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
