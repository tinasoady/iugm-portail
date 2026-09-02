-- CreateTable
CREATE TABLE "SyncedMutation" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "studentId" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncedMutation_pkey" PRIMARY KEY ("id")
);
