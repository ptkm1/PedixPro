-- Liberação de pedidos: histórico da decisão (liberar / rejeitar / manter em espera).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "releaseDecision" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "releaseNote" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "releasedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_organizationId_releasedByUserId_idx" ON "Order"("organizationId", "releasedByUserId");
CREATE INDEX IF NOT EXISTS "Order_organizationId_status_createdAt_idx" ON "Order"("organizationId", "status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_releasedByUserId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_releasedByUserId_fkey"
      FOREIGN KEY ("releasedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
