-- AlterEnum ReceivableStatus
ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "ReceivableStatus" ADD VALUE IF NOT EXISTS 'ERROR';

-- PaymentCondition.installmentDays
ALTER TABLE "PaymentCondition" ADD COLUMN IF NOT EXISTS "installmentDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Receivable extras
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "installmentIndex" INTEGER;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "installmentTotal" INTEGER;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "pdfUrl" TEXT;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "pdfStoredAt" TIMESTAMP(3);
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "instructions" TEXT;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "interestPercent" DECIMAL(5,2);
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "finePercent" DECIMAL(5,2);
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(14,2);
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "discountUntil" TIMESTAMP(3);
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "cancelledByUserId" TEXT;
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

CREATE INDEX IF NOT EXISTS "Receivable_organizationId_orderId_installmentIndex_idx"
  ON "Receivable"("organizationId", "orderId", "installmentIndex");

DO $$ BEGIN
  ALTER TABLE "Receivable"
    ADD CONSTRAINT "Receivable_cancelledByUserId_fkey"
    FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ReceivableEvent
CREATE TABLE IF NOT EXISTS "ReceivableEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "receivableId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceivableEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReceivableEvent_receivableId_createdAt_idx"
  ON "ReceivableEvent"("receivableId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReceivableEvent_organizationId_createdAt_idx"
  ON "ReceivableEvent"("organizationId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ReceivableEvent"
    ADD CONSTRAINT "ReceivableEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ReceivableEvent"
    ADD CONSTRAINT "ReceivableEvent_receivableId_fkey"
    FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ReceivableEvent"
    ADD CONSTRAINT "ReceivableEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
