-- Price tables upgrade: formula, status, min price, qty tiers, seller access, customer specials.

CREATE TYPE "PriceTableStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PriceAdjustmentKind" AS ENUM ('DISCOUNT', 'SURCHARGE');
CREATE TYPE "PriceAdjustmentMode" AS ENUM ('PERCENT', 'AMOUNT');

ALTER TABLE "PriceTable"
  ADD COLUMN "status" "PriceTableStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "adjustmentKind" "PriceAdjustmentKind" NOT NULL DEFAULT 'DISCOUNT',
  ADD COLUMN "adjustmentMode" "PriceAdjustmentMode" NOT NULL DEFAULT 'PERCENT',
  ADD COLUMN "adjustmentValue" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE INDEX "PriceTable_organizationId_status_idx" ON "PriceTable"("organizationId", "status");

ALTER TABLE "PriceTableItem"
  ADD COLUMN "useCustomPrice" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "minPrice" DECIMAL(12,2);

CREATE TABLE "PriceTableQtyTier" (
  "id" TEXT NOT NULL,
  "priceTableId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "minQuantity" INTEGER NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,

  CONSTRAINT "PriceTableQtyTier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceTableQtyTier_priceTableId_productId_minQuantity_key"
  ON "PriceTableQtyTier"("priceTableId", "productId", "minQuantity");
CREATE INDEX "PriceTableQtyTier_priceTableId_productId_idx"
  ON "PriceTableQtyTier"("priceTableId", "productId");

ALTER TABLE "PriceTableQtyTier"
  ADD CONSTRAINT "PriceTableQtyTier_priceTableId_fkey"
  FOREIGN KEY ("priceTableId") REFERENCES "PriceTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceTableQtyTier"
  ADD CONSTRAINT "PriceTableQtyTier_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SellerPriceTableAccess" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "priceTableId" TEXT NOT NULL,

  CONSTRAINT "SellerPriceTableAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerPriceTableAccess_sellerId_priceTableId_key"
  ON "SellerPriceTableAccess"("sellerId", "priceTableId");
CREATE INDEX "SellerPriceTableAccess_priceTableId_idx"
  ON "SellerPriceTableAccess"("priceTableId");

ALTER TABLE "SellerPriceTableAccess"
  ADD CONSTRAINT "SellerPriceTableAccess_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerPriceTableAccess"
  ADD CONSTRAINT "SellerPriceTableAccess_priceTableId_fkey"
  FOREIGN KEY ("priceTableId") REFERENCES "PriceTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerSpecialPrice" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),

  CONSTRAINT "CustomerSpecialPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerSpecialPrice_customerId_productId_key"
  ON "CustomerSpecialPrice"("customerId", "productId");
CREATE INDEX "CustomerSpecialPrice_organizationId_customerId_idx"
  ON "CustomerSpecialPrice"("organizationId", "customerId");
CREATE INDEX "CustomerSpecialPrice_productId_idx"
  ON "CustomerSpecialPrice"("productId");

ALTER TABLE "CustomerSpecialPrice"
  ADD CONSTRAINT "CustomerSpecialPrice_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerSpecialPrice"
  ADD CONSTRAINT "CustomerSpecialPrice_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerSpecialPrice"
  ADD CONSTRAINT "CustomerSpecialPrice_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Seller"
  ADD COLUMN "defaultPriceTableId" TEXT;
CREATE INDEX "Seller_defaultPriceTableId_idx" ON "Seller"("defaultPriceTableId");
ALTER TABLE "Seller"
  ADD CONSTRAINT "Seller_defaultPriceTableId_fkey"
  FOREIGN KEY ("defaultPriceTableId") REFERENCES "PriceTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer"
  ADD COLUMN "defaultPriceTableId" TEXT;
CREATE INDEX "Customer_defaultPriceTableId_idx" ON "Customer"("defaultPriceTableId");
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_defaultPriceTableId_fkey"
  FOREIGN KEY ("defaultPriceTableId") REFERENCES "PriceTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD COLUMN "priceTableId" TEXT;
CREATE INDEX "Order_priceTableId_idx" ON "Order"("priceTableId");
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_priceTableId_fkey"
  FOREIGN KEY ("priceTableId") REFERENCES "PriceTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  ADD COLUMN "priceTableId" TEXT,
  ADD COLUMN "priceTableName" TEXT,
  ADD COLUMN "priceOrigin" TEXT,
  ADD COLUMN "priceOriginLabel" TEXT;
