import type { Prisma, StockMovementType } from "@prisma/client";
import { formatProductUnitLabel } from "@pedidos/shared";
import { prisma } from "../db.js";
import { AUDIT_ACTION, AUDIT_ENTITY, writeAuditLog } from "./audit-log.js";
import { StockError } from "./product-stock.js";

export type ManualStockEntryInput = {
  organizationId: string;
  userId: string;
  userMatricula: string | null;
  productId: string;
  type: Extract<StockMovementType, "MANUAL_IN" | "MANUAL_OUT" | "ADJUST">;
  qty: number;
  /** Vazio/omitido = movimentação sem lote (só saldo do produto). */
  lotCode?: string | null;
  /** Obrigatório quando há lote; ignorado sem lote. */
  expiresAt?: Date | null;
  reason?: string;
};

/** Baixa FEFO em lotes existentes (sem criar movimento — o caller registra um só). */
async function reduceLotsFefo(
  tx: Prisma.TransactionClient,
  productId: string,
  qty: number,
): Promise<void> {
  let remaining = qty;
  if (remaining <= 0) return;
  const lots = await tx.productLot.findMany({
    where: { productId, qty: { gt: 0 } },
    orderBy: { expiresAt: "asc" },
  });
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.qty, remaining);
    await tx.productLot.update({
      where: { id: lot.id },
      data: { qty: lot.qty - take },
    });
    remaining -= take;
  }
}

const EXPIRING_DAYS = 30;

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

export async function listStockProducts(params: {
  organizationId: string;
  supplierId?: string;
  categoryId?: string;
  q?: string;
  productIds?: string[];
  stockQtyMin?: number;
  stockQtyMax?: number;
  productLine?: string;
  blockSaleWhenOutOfStock?: boolean;
}) {
  const where: Prisma.ProductWhereInput = {
    organizationId: params.organizationId,
  };
  if (params.productIds?.length) {
    where.id = { in: params.productIds };
  }
  if (params.supplierId) where.supplierId = params.supplierId;
  if (params.categoryId) where.categoryId = params.categoryId;
  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { barcode: { contains: q, mode: "insensitive" } },
    ];
  }
  const qtyFilter: Prisma.IntFilter = {};
  if (params.stockQtyMin != null) qtyFilter.gte = params.stockQtyMin;
  if (params.stockQtyMax != null) qtyFilter.lte = params.stockQtyMax;
  if (Object.keys(qtyFilter).length) where.stockQty = qtyFilter;
  if (params.productLine?.trim()) {
    where.productLine = {
      contains: params.productLine.trim(),
      mode: "insensitive",
    };
  }
  if (params.blockSaleWhenOutOfStock != null) {
    where.blockSaleWhenOutOfStock = params.blockSaleWhenOutOfStock;
  }

  const horizon = daysFromNow(EXPIRING_DAYS);
  const products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      category: { select: { id: true, name: true, code: true } },
      supplier: {
        select: { id: true, tradeName: true, legalName: true, code: true },
      },
      lots: {
        where: { qty: { gt: 0 } },
        orderBy: { expiresAt: "asc" },
      },
    },
  });

  return products.map((p) => {
    const expiringLots = p.lots.filter((l) => l.expiresAt <= horizon);
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      imageUrl: p.imageUrl,
      stockQty: p.stockQty,
      minStockQty: p.minStockQty,
      maxStockQty: p.maxStockQty,
      costPrice: p.costPrice,
      basePrice: p.basePrice,
      blockSaleWhenOutOfStock: p.blockSaleWhenOutOfStock,
      category: p.category,
      supplier: p.supplier,
      lots: p.lots,
      hasExpiringSoon: expiringLots.length > 0,
      expiringLotsCount: expiringLots.length,
    };
  });
}

export async function listExpiringLots(organizationId: string) {
  const horizon = daysFromNow(EXPIRING_DAYS);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const lots = await prisma.productLot.findMany({
    where: {
      organizationId,
      qty: { gt: 0 },
      expiresAt: { lte: horizon },
    },
    orderBy: { expiresAt: "asc" },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          category: { select: { id: true, name: true } },
          supplier: { select: { id: true, tradeName: true } },
        },
      },
    },
  });

  return lots.map((l) => ({
    id: l.id,
    lotCode: l.lotCode,
    expiresAt: l.expiresAt,
    qty: l.qty,
    expired: l.expiresAt < now,
    daysUntilExpiry: Math.ceil(
      (l.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    ),
    product: l.product,
  }));
}

export async function listStockMovements(params: {
  organizationId: string;
  productId?: string;
  type?: StockMovementType;
  take?: number;
  skip?: number;
}) {
  const take = Math.min(params.take ?? 50, 200);
  const skip = params.skip ?? 0;
  const where: Prisma.StockMovementWhereInput = {
    organizationId: params.organizationId,
  };
  if (params.productId) where.productId = params.productId;
  if (params.type) where.type = params.type;

  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        product: {
          select: { id: true, name: true, sku: true, imageUrl: true },
        },
        user: {
          select: { id: true, name: true, email: true, matricula: true },
        },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return { items, total, take, skip };
}

export async function applyManualStockEntry(
  input: ManualStockEntryInput,
): Promise<{
  productId: string;
  stockQty: number;
  lotId: string | null;
  movementId: string;
}> {
  if (!Number.isInteger(input.qty) || input.qty <= 0) {
    throw new StockError("Quantidade deve ser um inteiro positivo.");
  }
  const lotCode = (input.lotCode ?? "").trim();
  const hasLot = lotCode.length > 0;
  const expiresAt =
    input.expiresAt instanceof Date && !Number.isNaN(input.expiresAt.getTime())
      ? input.expiresAt
      : null;

  if (hasLot && !expiresAt) {
    throw new StockError("Informe a validade do lote.");
  }

  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
    select: { id: true, name: true, stockQty: true, attributes: true },
  });
  if (!product) throw new StockError("Produto não encontrado.");

  const unitLabel = formatProductUnitLabel(
    product.attributes as Record<string, unknown> | null,
  );

  return prisma.$transaction(async (tx) => {
    if (!hasLot) {
      let qtyDelta: number;
      let newProductQty: number;

      if (input.type === "MANUAL_IN") {
        qtyDelta = input.qty;
        newProductQty = product.stockQty + input.qty;
      } else if (input.type === "MANUAL_OUT") {
        if (product.stockQty < input.qty) {
          throw new StockError(
            `Estoque insuficiente para "${product.name}" (disponível: ${product.stockQty}).`,
          );
        }
        qtyDelta = -input.qty;
        newProductQty = product.stockQty - input.qty;
        await reduceLotsFefo(tx, input.productId, input.qty);
      } else {
        // ADJUST sem lote: define o saldo do produto
        qtyDelta = input.qty - product.stockQty;
        newProductQty = input.qty;
        if (qtyDelta < 0) {
          await reduceLotsFefo(tx, input.productId, -qtyDelta);
        }
      }

      await tx.product.update({
        where: { id: input.productId },
        data: { stockQty: newProductQty },
      });

      const movement = await tx.stockMovement.create({
        data: {
          organizationId: input.organizationId,
          productId: input.productId,
          type: input.type,
          qtyDelta,
          balanceAfter: newProductQty,
          lotId: null,
          lotCode: null,
          expiresAt: null,
          userId: input.userId,
          reason: input.reason?.trim() || null,
        },
      });

      await writeAuditLog(
        {
          organizationId: input.organizationId,
          userId: input.userId,
          userMatricula: input.userMatricula,
          action: AUDIT_ACTION.STOCK_ENTRY,
          entityType: AUDIT_ENTITY.Product,
          entityId: input.productId,
          metadata: {
            movementType: input.type,
            movementId: movement.id,
            lotId: null,
            lotCode: null,
            expiresAt: null,
            qtyDelta,
            balanceAfter: newProductQty,
            reason: input.reason ?? null,
            unitLabel: unitLabel ?? null,
          },
        },
        tx,
      );

      return {
        productId: input.productId,
        stockQty: newProductQty,
        lotId: null,
        movementId: movement.id,
      };
    }

    let lot = await tx.productLot.findUnique({
      where: {
        productId_lotCode: { productId: input.productId, lotCode },
      },
    });

    if (lot && lot.expiresAt.getTime() !== expiresAt!.getTime()) {
      // Same lot code: keep earliest expiry consistency — update if different.
      lot = await tx.productLot.update({
        where: { id: lot.id },
        data: { expiresAt: expiresAt! },
      });
    }

    if (!lot) {
      lot = await tx.productLot.create({
        data: {
          organizationId: input.organizationId,
          productId: input.productId,
          lotCode,
          expiresAt: expiresAt!,
          qty: 0,
        },
      });
    }

    let qtyDelta: number;
    let newLotQty: number;
    let newProductQty: number;

    if (input.type === "MANUAL_IN") {
      qtyDelta = input.qty;
      newLotQty = lot.qty + input.qty;
      newProductQty = product.stockQty + input.qty;
    } else if (input.type === "MANUAL_OUT") {
      if (lot.qty < input.qty) {
        throw new StockError(
          `Saldo insuficiente no lote "${lotCode}" (disponível: ${lot.qty}).`,
        );
      }
      if (product.stockQty < input.qty) {
        throw new StockError(
          `Estoque insuficiente para "${product.name}" (disponível: ${product.stockQty}).`,
        );
      }
      qtyDelta = -input.qty;
      newLotQty = lot.qty - input.qty;
      newProductQty = product.stockQty - input.qty;
    } else {
      // ADJUST: set lot qty to absolute value; delta against current lot
      qtyDelta = input.qty - lot.qty;
      newLotQty = input.qty;
      newProductQty = product.stockQty + qtyDelta;
      if (newProductQty < 0) {
        throw new StockError(
          `Ajuste resultaria em estoque negativo para "${product.name}".`,
        );
      }
    }

    await tx.productLot.update({
      where: { id: lot.id },
      data: { qty: newLotQty },
    });

    await tx.product.update({
      where: { id: input.productId },
      data: { stockQty: newProductQty },
    });

    const movement = await tx.stockMovement.create({
      data: {
        organizationId: input.organizationId,
        productId: input.productId,
        type: input.type,
        qtyDelta,
        balanceAfter: newProductQty,
        lotId: lot.id,
        lotCode,
        expiresAt: expiresAt!,
        userId: input.userId,
        reason: input.reason?.trim() || null,
      },
    });

    await writeAuditLog(
      {
        organizationId: input.organizationId,
        userId: input.userId,
        userMatricula: input.userMatricula,
        action: AUDIT_ACTION.STOCK_ENTRY,
        entityType: AUDIT_ENTITY.Product,
        entityId: input.productId,
        metadata: {
          movementType: input.type,
          movementId: movement.id,
          lotId: lot.id,
          lotCode,
          expiresAt: expiresAt!.toISOString(),
          qtyDelta,
          balanceAfter: newProductQty,
          reason: input.reason ?? null,
          unitLabel: unitLabel ?? null,
        },
      },
      tx,
    );

    return {
      productId: input.productId,
      stockQty: newProductQty,
      lotId: lot.id,
      movementId: movement.id,
    };
  });
}

/**
 * Consume qty from lots FEFO (earliest expiry first). Returns movements data
 * to persist (caller may already be in a transaction).
 */
export async function consumeLotsFefo(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    productId: string;
    qty: number;
    type: Extract<StockMovementType, "SALE" | "SALE_REVERSAL">;
    userId?: string | null;
    orderId: string;
    startingBalance: number;
  },
): Promise<{ balanceAfter: number }> {
  let remaining = params.qty;
  let balance = params.startingBalance;

  if (params.type === "SALE") {
    const lots = await tx.productLot.findMany({
      where: {
        productId: params.productId,
        qty: { gt: 0 },
      },
      orderBy: { expiresAt: "asc" },
    });

    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.qty, remaining);
      await tx.productLot.update({
        where: { id: lot.id },
        data: { qty: lot.qty - take },
      });
      balance -= take;
      remaining -= take;
      await tx.stockMovement.create({
        data: {
          organizationId: params.organizationId,
          productId: params.productId,
          type: "SALE",
          qtyDelta: -take,
          balanceAfter: balance,
          lotId: lot.id,
          lotCode: lot.lotCode,
          expiresAt: lot.expiresAt,
          userId: params.userId ?? null,
          orderId: params.orderId,
          reason: "Baixa por venda",
        },
      });
    }

    if (remaining > 0) {
      balance -= remaining;
      await tx.stockMovement.create({
        data: {
          organizationId: params.organizationId,
          productId: params.productId,
          type: "SALE",
          qtyDelta: -remaining,
          balanceAfter: balance,
          userId: params.userId ?? null,
          orderId: params.orderId,
          reason: "Baixa por venda (sem lote)",
        },
      });
      remaining = 0;
    }
  } else {
    // SALE_REVERSAL: restore to a synthetic reversal without inventing lot when unknown
    balance += params.qty;
    await tx.stockMovement.create({
      data: {
        organizationId: params.organizationId,
        productId: params.productId,
        type: "SALE_REVERSAL",
        qtyDelta: params.qty,
        balanceAfter: balance,
        userId: params.userId ?? null,
        orderId: params.orderId,
        reason: "Estorno por cancelamento",
      },
    });
  }

  return { balanceAfter: balance };
}
