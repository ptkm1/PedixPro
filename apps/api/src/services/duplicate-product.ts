import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export class DuplicateProductError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = "DuplicateProductError";
  }
}

function copyName(name: string): string {
  const base = name.trim() || "Produto";
  return base.endsWith("(cópia)") ? `${base} 2` : `${base} (cópia)`;
}

/**
 * Cria um novo produto copiando cadastro comercial/fiscal, preços nas tabelas
 * e exceções de comissão. SKU, código de barras e estoque começam vazios.
 */
export async function duplicateProduct(organizationId: string, sourceId: string) {
  const src = await prisma.product.findFirst({
    where: { id: sourceId, organizationId },
    include: {
      priceTableItems: true,
      priceTableQtyTiers: true,
      sellerCommissions: true,
      priceTableCommissions: true,
    },
  });
  if (!src) throw new DuplicateProductError("Produto não encontrado", 404);

  return prisma.product.create({
    data: {
      organizationId,
      name: copyName(src.name),
      sku: null,
      barcode: null,
      description: src.description,
      imageUrl: src.imageUrl,
      featured: false,
      basePrice: src.basePrice,
      maxSellerDiscountPercent: src.maxSellerDiscountPercent,
      minSaleUnitPrice: src.minSaleUnitPrice,
      commissionPercent: src.commissionPercent,
      attributes: (src.attributes ?? {}) as Prisma.InputJsonValue,
      stockQty: 0,
      blockSaleWhenOutOfStock: src.blockSaleWhenOutOfStock,
      productLine: src.productLine,
      productClassification: src.productClassification,
      purchaseUnit: src.purchaseUnit,
      standardPurchaseBoxQty: src.standardPurchaseBoxQty,
      grossWeightKg: src.grossWeightKg,
      netWeightKg: src.netWeightKg,
      stockAddress: src.stockAddress,
      minStockQty: src.minStockQty,
      maxStockQty: src.maxStockQty,
      costPrice: src.costPrice,
      factoryPrice: src.factoryPrice,
      maxSalePrice: src.maxSalePrice,
      freightAmount: src.freightAmount,
      collectionCommissionPercent: src.collectionCommissionPercent,
      maxDailyQtyPerSeller: src.maxDailyQtyPerSeller,
      maxDailyQtyPerCustomer: src.maxDailyQtyPerCustomer,
      ncm: src.ncm,
      ncmException: src.ncmException,
      nfeOrigin: src.nfeOrigin,
      fiscalClass: src.fiscalClass,
      pisCofinsClassification: src.pisCofinsClassification,
      cstPis: src.cstPis,
      ipiPercent: src.ipiPercent,
      icmsCostPercent: src.icmsCostPercent,
      cbsIbsClassification: src.cbsIbsClassification,
      ibsClassification: src.ibsClassification,
      fiscalCstIcms: src.fiscalCstIcms,
      fiscalCsosn: src.fiscalCsosn,
      categoryId: src.categoryId,
      supplierId: src.supplierId,
      ncmId: src.ncmId,
      fiscalOrigin: src.fiscalOrigin,
      fiscalGtin: src.fiscalGtin,
      fiscalUnit: src.fiscalUnit,
      fiscalCest: src.fiscalCest,
      fiscalDescription: src.fiscalDescription,
      outboundOperationId: src.outboundOperationId,
      priceTableItems: {
        create: src.priceTableItems.map((i) => ({
          priceTableId: i.priceTableId,
          price: i.price,
          useCustomPrice: i.useCustomPrice,
          minPrice: i.minPrice,
        })),
      },
      priceTableQtyTiers: {
        create: src.priceTableQtyTiers.map((t) => ({
          priceTableId: t.priceTableId,
          minQuantity: t.minQuantity,
          price: t.price,
        })),
      },
      sellerCommissions: {
        create: src.sellerCommissions.map((r) => ({
          organizationId,
          sellerId: r.sellerId,
          commissionPercent: r.commissionPercent,
        })),
      },
      priceTableCommissions: {
        create: src.priceTableCommissions.map((r) => ({
          organizationId,
          priceTableId: r.priceTableId,
          commissionPercent: r.commissionPercent,
        })),
      },
    },
  });
}
