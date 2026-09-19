-- AlterTable: sellerId opcional (venda direta) + createdByUserId (auditoria)
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_sellerId_fkey";

ALTER TABLE "Order" ALTER COLUMN "sellerId" DROP NOT NULL;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_organizationId_sellerId_idx" ON "Order"("organizationId", "sellerId");
CREATE INDEX IF NOT EXISTS "Order_organizationId_createdByUserId_idx" ON "Order"("organizationId", "createdByUserId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
