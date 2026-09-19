-- CreateEnum
CREATE TYPE "CatalogPriceDisplayMode" AS ENUM ('ALL', 'LOWEST', 'HIGHEST');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "catalogPriceDisplayMode" "CatalogPriceDisplayMode" NOT NULL DEFAULT 'LOWEST';
