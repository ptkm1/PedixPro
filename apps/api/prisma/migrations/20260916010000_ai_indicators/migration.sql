-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "aiIndicatorsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OrganizationAiIndicator" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(12,6),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByUserId" TEXT,

    CONSTRAINT "OrganizationAiIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(12,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationAiIndicator_organizationId_key" ON "OrganizationAiIndicator"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationAiIndicator_organizationId_generatedAt_idx" ON "OrganizationAiIndicator"("organizationId", "generatedAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_organizationId_createdAt_idx" ON "AiUsageEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_organizationId_kind_createdAt_idx" ON "AiUsageEvent"("organizationId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "OrganizationAiIndicator" ADD CONSTRAINT "OrganizationAiIndicator_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
