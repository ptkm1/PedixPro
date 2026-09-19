-- Comissão por produto+vendedor e produto+tabela, com snapshot de origem no item.

CREATE TYPE "CommissionOrigin" AS ENUM (
  'COMISSAO_TABELA_PRECO',
  'COMISSAO_PRODUTO_VENDEDOR',
  'COMISSAO_PRODUTO',
  'COMISSAO_GRUPO',
  'COMISSAO_REGRA_VENDEDOR',
  'COMISSAO_PROGRESSIVA',
  'COMISSAO_VENDEDOR'
);

CREATE TABLE "product_seller_commissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_seller_commissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_seller_commissions_organizationId_productId_sellerId_key"
  ON "product_seller_commissions"("organizationId", "productId", "sellerId");
CREATE INDEX "product_seller_commissions_organizationId_productId_idx"
  ON "product_seller_commissions"("organizationId", "productId");

ALTER TABLE "product_seller_commissions"
  ADD CONSTRAINT "product_seller_commissions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_seller_commissions"
  ADD CONSTRAINT "product_seller_commissions_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_seller_commissions"
  ADD CONSTRAINT "product_seller_commissions_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "product_price_table_commissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceTableId" TEXT NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_price_table_commissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_price_table_commissions_organizationId_productId_priceTableId_key"
  ON "product_price_table_commissions"("organizationId", "productId", "priceTableId");
CREATE INDEX "product_price_table_commissions_organizationId_productId_idx"
  ON "product_price_table_commissions"("organizationId", "productId");

ALTER TABLE "product_price_table_commissions"
  ADD CONSTRAINT "product_price_table_commissions_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_price_table_commissions"
  ADD CONSTRAINT "product_price_table_commissions_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_price_table_commissions"
  ADD CONSTRAINT "product_price_table_commissions_priceTableId_fkey"
  FOREIGN KEY ("priceTableId") REFERENCES "PriceTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  ADD COLUMN "commissionOrigin" "CommissionOrigin";

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_priceTableId_fkey"
  FOREIGN KEY ("priceTableId") REFERENCES "PriceTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
