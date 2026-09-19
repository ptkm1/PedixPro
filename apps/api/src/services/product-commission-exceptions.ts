import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import type { ProductCommissionSync } from "@pedidos/shared";

export type SellerCommissionInput = {
  sellerId: string;
  commissionPercent: number | null;
};

export type PriceTableCommissionInput = {
  priceTableId: string;
  commissionPercent: number;
};

export class ProductCommissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductCommissionError";
  }
}

/** Substitui as exceções de comissão do produto (escopo da org). */
export async function syncProductCommissionExceptions(
  organizationId: string,
  productId: string,
  input: {
    sellerCommissions?: SellerCommissionInput[];
    priceTableCommissions?: PriceTableCommissionInput[];
  },
): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    select: { id: true },
  });
  if (!product) throw new ProductCommissionError("Produto inválido");

  if (input.sellerCommissions) {
    const sellerIds = [
      ...new Set(input.sellerCommissions.map((r) => r.sellerId)),
    ];
    if (sellerIds.length) {
      const sellers = await prisma.seller.findMany({
        where: { id: { in: sellerIds }, organizationId },
        select: { id: true },
      });
      if (sellers.length !== sellerIds.length) {
        throw new ProductCommissionError("Vendedor inválido");
      }
    }
    const keep = input.sellerCommissions.filter(
      (r) => r.commissionPercent != null,
    );
    await prisma.$transaction(async (tx) => {
      await tx.productSellerCommission.deleteMany({
        where: { organizationId, productId },
      });
      if (keep.length) {
        await tx.productSellerCommission.createMany({
          data: keep.map((r) => ({
            organizationId,
            productId,
            sellerId: r.sellerId,
            commissionPercent: r.commissionPercent!,
          })),
        });
      }
    });
  }

  if (input.priceTableCommissions) {
    const tableIds = [
      ...new Set(input.priceTableCommissions.map((r) => r.priceTableId)),
    ];
    if (tableIds.length) {
      const tables = await prisma.priceTable.findMany({
        where: { id: { in: tableIds }, organizationId },
        select: { id: true },
      });
      if (tables.length !== tableIds.length) {
        throw new ProductCommissionError("Tabela de preço inválida");
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.productPriceTableCommission.deleteMany({
        where: { organizationId, productId },
      });
      if (input.priceTableCommissions!.length) {
        await tx.productPriceTableCommission.createMany({
          data: input.priceTableCommissions!.map((r) => ({
            organizationId,
            productId,
            priceTableId: r.priceTableId,
            commissionPercent: r.commissionPercent,
          })),
        });
      }
    });
  }
}

export const productCommissionInclude = {
  sellerCommissions: {
    select: {
      id: true,
      sellerId: true,
      commissionPercent: true,
    },
  },
  priceTableCommissions: {
    select: {
      id: true,
      priceTableId: true,
      commissionPercent: true,
      priceTable: { select: { id: true, name: true } },
    },
  },
} as const;

export async function loadSellerCommissionSync(
  organizationId: string,
  sellerId: string,
  productIds: string[],
): Promise<ProductCommissionSync[]> {
  if (!productIds.length) return [];
  const [products, sellerRows, tableRows] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds }, organizationId },
      select: {
        id: true,
        commissionPercent: true,
        category: { select: { commissionPercent: true } },
      },
    }),
    prisma.productSellerCommission.findMany({
      where: { organizationId, sellerId, productId: { in: productIds } },
      select: { productId: true, commissionPercent: true },
    }),
    prisma.productPriceTableCommission.findMany({
      where: { organizationId, productId: { in: productIds } },
      select: {
        productId: true,
        priceTableId: true,
        commissionPercent: true,
      },
    }),
  ]);
  const sellerByProduct = new Map(
    sellerRows.map((r) => [r.productId, decToNum(r.commissionPercent)]),
  );
  const tablesByProduct = new Map<
    string,
    Array<{ priceTableId: string; percent: number }>
  >();
  for (const row of tableRows) {
    const list = tablesByProduct.get(row.productId) ?? [];
    list.push({
      priceTableId: row.priceTableId,
      percent: decToNum(row.commissionPercent),
    });
    tablesByProduct.set(row.productId, list);
  }
  return products.map((p) => ({
    productId: p.id,
    productDefaultPercent:
      p.commissionPercent != null ? decToNum(p.commissionPercent) : null,
    groupPercent:
      p.category?.commissionPercent != null
        ? decToNum(p.category.commissionPercent)
        : null,
    sellerProductPercent: sellerByProduct.get(p.id) ?? null,
    priceTablePercents: tablesByProduct.get(p.id) ?? [],
  }));
}
