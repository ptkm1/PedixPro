import { prisma } from "../db.js";
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  auditFromAuth,
} from "./audit-log.js";
import { resolveCommissionPercent } from "./commission-resolve.js";
import { calendarMonthBounds, sellerConfirmedRevenueInPeriod } from "./seller-metrics.js";
import { SaleCreateError } from "./create-sale-order.js";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

const EDITABLE_STATUSES = new Set([
  "DRAFT",
  "CONFIRMED",
  "PENDING_CREDIT_APPROVAL",
]);

/**
 * Troca vendedor ↔ venda direta e recalcula comissão nas linhas (sem duplicar pedido).
 * Metas passam a refletir o novo sellerId automaticamente (aggregates por sellerId).
 */
export async function reassignOrderSeller(params: {
  organizationId: string;
  orderId: string;
  actorUserId: string;
  /** Null = venda direta. */
  sellerId: string | null;
}) {
  const order = await prisma.order.findFirst({
    where: { id: params.orderId, organizationId: params.organizationId },
    include: {
      items: {
        include: { product: { select: { id: true, categoryId: true } } },
      },
    },
  });
  if (!order) throw new SaleCreateError("Pedido não encontrado", 404);
  if (!EDITABLE_STATUSES.has(order.status)) {
    throw new SaleCreateError(
      "Só é possível alterar o vendedor em pedidos editáveis (rascunho, confirmado ou aguardando crédito).",
      400,
    );
  }
  if (order.status === "CANCELLED") {
    throw new SaleCreateError("Pedido cancelado não pode ser reatribuído", 400);
  }

  if (params.sellerId) {
    const seller = await prisma.seller.findFirst({
      where: {
        id: params.sellerId,
        organizationId: params.organizationId,
        active: true,
      },
      select: { id: true },
    });
    if (!seller) throw new SaleCreateError("Vendedor inválido", 400);
  }

  if (order.sellerId === params.sellerId) {
    return prisma.order.findFirstOrThrow({
      where: { id: order.id },
      include: {
        items: true,
        seller: { include: { user: { select: { name: true, email: true } } } },
        createdByUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  const previousSellerId = order.sellerId;
  const at = order.createdAt;
  const periodBounds = calendarMonthBounds(at);
  const mtdBefore =
    params.sellerId != null
      ? await sellerConfirmedRevenueInPeriod(
          params.organizationId,
          params.sellerId,
          periodBounds.start,
          periodBounds.end,
        )
      : 0;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { sellerId: params.sellerId },
    });

    for (const item of order.items) {
      const lineTotal = roundMoney(Number(item.unitPrice) * item.quantity);
      const commissionPercent =
        params.sellerId != null
          ? await resolveCommissionPercent(
              params.organizationId,
              params.sellerId,
              item.productId,
              item.product.categoryId,
              { mtdConfirmedRevenue: mtdBefore },
            )
          : 0;
      const commissionAmount = roundMoney((lineTotal * commissionPercent) / 100);
      await tx.orderItem.update({
        where: { id: item.id },
        data: { commissionPercent, commissionAmount },
      });
    }
  });

  await auditFromAuth(
    { organizationId: params.organizationId, sub: params.actorUserId },
    {
      action: AUDIT_ACTION.UPDATE,
      entityType: AUDIT_ENTITY.Order,
      entityId: order.id,
      metadata: {
        field: "sellerId",
        previousSellerId,
        sellerId: params.sellerId,
        directSale: params.sellerId == null,
        commissionRecalculated: true,
      },
    },
  );

  return prisma.order.findFirstOrThrow({
    where: { id: order.id },
    include: {
      items: true,
      seller: { include: { user: { select: { name: true, email: true } } } },
      createdByUser: { select: { id: true, name: true, email: true } },
      customer: true,
      situation: true,
    },
  });
}
