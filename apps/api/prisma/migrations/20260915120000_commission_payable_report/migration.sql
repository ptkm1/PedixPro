-- Critério por empresa + ledger anti-duplicidade + recebimentos para liquidação.

CREATE TYPE "CommissionPayableCriterion" AS ENUM ('EMITTED', 'INVOICED', 'SETTLED');

ALTER TABLE "Organization"
  ADD COLUMN "commissionPayableCriterion" "CommissionPayableCriterion" NOT NULL DEFAULT 'EMITTED';

CREATE TABLE "OrderReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderReceipt_organizationId_orderId_idx" ON "OrderReceipt"("organizationId", "orderId");
CREATE INDEX "OrderReceipt_organizationId_receivedAt_idx" ON "OrderReceipt"("organizationId", "receivedAt");

ALTER TABLE "OrderReceipt"
  ADD CONSTRAINT "OrderReceipt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderReceipt"
  ADD CONSTRAINT "OrderReceipt_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrderCommissionPayableLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "criterion" "CommissionPayableCriterion" NOT NULL,
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "saleAmount" DECIMAL(14,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderCommissionPayableLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderCommissionPayableLedger_orderId_key" ON "OrderCommissionPayableLedger"("orderId");
CREATE INDEX "OrderCommissionPayableLedger_organizationId_referenceDate_idx" ON "OrderCommissionPayableLedger"("organizationId", "referenceDate");
CREATE INDEX "OrderCommissionPayableLedger_organizationId_criterion_idx" ON "OrderCommissionPayableLedger"("organizationId", "criterion");

ALTER TABLE "OrderCommissionPayableLedger"
  ADD CONSTRAINT "OrderCommissionPayableLedger_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderCommissionPayableLedger"
  ADD CONSTRAINT "OrderCommissionPayableLedger_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permissão "Visualizar relatório de comissões a pagar": admin leitura; demais none.
INSERT INTO "OrganizationRolePermission" (
  "id", "organizationId", "role", "resource", "level", "createdAt", "updatedAt"
)
SELECT
  concat('orp-cpp-', o.id, '-', r.role),
  o.id,
  r.role::"Role",
  'reports_commissions_payable',
  r.level::"AccessLevel",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (
  VALUES
    ('ADMIN'::text, 'read'::text),
    ('MANAGER'::text, 'none'::text),
    ('SELLER'::text, 'none'::text),
    ('SUPERVISOR'::text, 'none'::text)
) AS r(role, level)
ON CONFLICT ("organizationId", "role", "resource") DO NOTHING;
