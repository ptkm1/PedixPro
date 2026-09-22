import type { OrderStatus } from "@prisma/client";
import {
  formatInsufficientStockMessage,
  formatOutOfStockMessage,
} from "@pedidos/shared";
import { prisma } from "../db.js";
import { AUDIT_ACTION, AUDIT_ENTITY, writeAuditLog } from "./audit-log.js";
import { consumeLotsFefo } from "./stock-ledger.js";

export type StockShortage = {
  productId: string;
  name: string;
  sku: string | null;
  available: number;
  requested: number;
};

export class StockError extends Error {
  readonly shortages: StockShortage[];

  constructor(message: string, shortages: StockShortage[] = []) {
    super(message);
    this.name = "StockError";
    this.shortages = shortages;
  }
}

/** Payload HTTP padronizado para clientes (mobile/web). */
export function stockErrorPayload(error: StockError) {
  return {
    error: error.message,
    code: "STOCK_INSUFFICIENT" as const,
    products: error.shortages.map((s) => ({
      productId: s.productId,
      name: s.name,
      sku: s.sku,
      available: s.available,
      requested: s.requested,
    })),
  };
}

type OrderLine = { productId: string; quantity: number };

export type ProductStockLevel = {
  productId: string;
  name: string;
  sku: string | null;
  stockQty: number;
  blockSaleWhenOutOfStock: boolean;
};

export async function getProductStockLevels(
  organizationId: string,
  productIds: string[],
): Promise<ProductStockLevel[]> {
  const unique = [...new Set(productIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const products = await prisma.product.findMany({
    where: {
      organizationId,
      id: { in: unique },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      stockQty: true,
      blockSaleWhenOutOfStock: true,
    },
  });

  return products.map((p) => ({
    productId: p.id,
    name: p.name,
    sku: p.sku,
    stockQty: p.stockQty,
    blockSaleWhenOutOfStock: p.blockSaleWhenOutOfStock,
  }));
}

function shortageMessage(s: StockShortage): string {
  if (s.available <= 0) {
    return formatOutOfStockMessage(s.name, s.sku);
  }
  return formatInsufficientStockMessage(
    s.name,
    s.available,
    s.requested,
    s.sku,
  );
}

export async function assertSufficientStock(
  organizationId: string,
  items: OrderLine[],
): Promise<void> {
  if (items.length === 0) return;

  const qtyByProduct = new Map<string, number>();
  for (const item of items) {
    qtyByProduct.set(
      item.productId,
      (qtyByProduct.get(item.productId) ?? 0) + item.quantity,
    );
  }

  const products = await getProductStockLevels(
    organizationId,
    [...qtyByProduct.keys()],
  );
  const byId = new Map(products.map((p) => [p.productId, p]));
  const shortages: StockShortage[] = [];

  for (const [productId, qty] of qtyByProduct) {
    const p = byId.get(productId);
    if (!p?.blockSaleWhenOutOfStock) continue;
    if (p.stockQty < qty) {
      shortages.push({
        productId,
        name: p.name,
        sku: p.sku,
        available: p.stockQty,
        requested: qty,
      });
    }
  }

  if (shortages.length > 0) {
    throw new StockError(
      shortages.map(shortageMessage).join(" "),
      shortages,
    );
  }
}

export async function applyStockOnStatusChange(
  orderId: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  actorUserId?: string | null,
): Promise<void> {
  if (fromStatus === toStatus) return;

  const confirming = toStatus === "CONFIRMED" && fromStatus !== "CONFIRMED";
  const cancelling = toStatus === "CANCELLED" && fromStatus === "CONFIRMED";
  if (!confirming && !cancelling) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      seller: { select: { userId: true } },
    },
  });
  if (!order) return;

  const userId =
    actorUserId ?? order.createdByUserId ?? order.seller?.userId ?? null;

  if (confirming) {
    await assertSufficientStock(
      order.organizationId,
      order.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: { stockQty: true, name: true, sku: true },
      });
      if (!product) continue;

      if (confirming) {
        const newQty = product.stockQty - item.quantity;
        if (newQty < 0) {
          const shortage: StockShortage = {
            productId: item.productId,
            name: product.name,
            sku: product.sku,
            available: product.stockQty,
            requested: item.quantity,
          };
          throw new StockError(shortageMessage(shortage), [shortage]);
        }
        await consumeLotsFefo(tx, {
          organizationId: order.organizationId,
          productId: item.productId,
          qty: item.quantity,
          type: "SALE",
          userId,
          orderId: order.id,
          startingBalance: product.stockQty,
        });
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: newQty },
        });
      } else {
        const newQty = product.stockQty + item.quantity;
        await consumeLotsFefo(tx, {
          organizationId: order.organizationId,
          productId: item.productId,
          qty: item.quantity,
          type: "SALE_REVERSAL",
          userId,
          orderId: order.id,
          startingBalance: product.stockQty,
        });
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: newQty },
        });
      }
    }

    const actor = userId
      ? await tx.user.findUnique({
          where: { id: userId },
          select: { matricula: true },
        })
      : null;

    await writeAuditLog(
      {
        organizationId: order.organizationId,
        userId: userId ?? null,
        userMatricula: actor?.matricula ?? null,
        action: confirming
          ? AUDIT_ACTION.STOCK_SALE
          : AUDIT_ACTION.STOCK_SALE_REVERSAL,
        entityType: AUDIT_ENTITY.Order,
        entityId: order.id,
        metadata: {
          fromStatus,
          toStatus,
          itemCount: order.items.length,
        },
      },
      tx,
    );
  });
}
