-- CreateTable
CREATE TABLE "LevelFinancialInfo" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "inscriptionLocal" INTEGER NOT NULL,
    "inscriptionForeign" INTEGER NOT NULL,
    "insurance" INTEGER NOT NULL,
    "polo" INTEGER NOT NULL,
    "tuitionLocal" INTEGER NOT NULL,
    "tuitionForeign" INTEGER NOT NULL,
    "firstPaymentLocal" INTEGER NOT NULL,
    "firstPaymentForeign" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LevelFinancialInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LevelFinancialInfo_level_key" ON "LevelFinancialInfo"("level");
