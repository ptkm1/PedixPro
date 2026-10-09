import { prisma } from "../db.js";
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  auditFromAuth,
} from "./audit-log.js";
import { evaluateOrderCredit, violationsToJson } from "./credit.js";
import {
  SaleCreateError,
  orgAllowedProductIds,
} from "./create-sale-order.js";
import {
  computeSaleOrder,
  type SaleLineInput,
} from "./order-pricing.js";
import {
  applyStockOnStatusChange,
  assertSufficientStockForReplace,
} from "./product-stock.js";

const EDITABLE_STATUSES = new Set([
  "DRAFT",
  "CONFIRMED",
  "PENDING_CREDIT_APPROVAL",
]);

const updatedOrderInclude = {
  items: {
    include: {
      product: {
        select: { id: true, name: true, sku: true, imageUrl: true },
      },
    },
  },
  customer: { select: { id: true, name: true, email: true } },
  paymentCondition: true,
  createdByUser: { select: { id: true, name: true, email: true } },
  situation: {
    select: {
      id: true,
      code: true,
      name: true,
      sortOrder: true,
      active: true,
      isSystem: true,
      mapsToCancel: true,
    },
  },
  seller: {
    include: {
      user: { select: { name: true, email: true, phone: true } },
    },
  },
} as const;

export type UpdateSaleOrderItemsParams = {
  organizationId: string;
  orderId: string;
  actorUserId: string;
  items: SaleLineInput[];
};

/**
 * Substitui os itens de um pedido existente (somente ADM via rota).
 * Recalcula preços/comissões/totais; ajusta estoque se CONFIRMED.
 */
export async function updateSaleOrderItems(params: UpdateSaleOrderItemsParams) {
  if (params.items.length === 0) {
    throw new SaleCreateError("Informe ao menos um item", 400);
  }

  const order = await prisma.order.findFirst({
    where: { id: params.orderId, organizationId: params.organizationId },
    include: {
      items: { select: { id: true, productId: true, quantity: true } },
      expedition: { select: { id: true, status: true } },
    },
  });
  if (!order) throw new SaleCreateError("Pedido não encontrado", 404);

  if (!EDITABLE_STATUSES.has(order.status)) {
    throw new SaleCreateError(
      "Só é possível editar itens em pedidos em rascunho, confirmados ou aguardando crédito.",
      400,
    );
  }
  if (order.status === "CANCELLED") {
    throw new SaleCreateError("Pedido cancelado não pode ser editado", 400);
  }
  if (order.expedition) {
    throw new SaleCreateError(
      "Pedido com expedição iniciada não pode ter itens alterados.",
      400,
    );
  }
  if (!order.customerId) {
    throw new SaleCreateError("Pedido sem cliente não pode ser editado", 400);
  }

  // ADM pode incluir qualquer produto da org (não fica limitado ao catálogo do vendedor).
  const allowedProductIds = await orgAllowedProductIds(params.organizationId);

  const sale = await computeSaleOrder({
    organizationId: params.organizationId,
    sellerId: order.sellerId,
    customerId: order.customerId,
    priceTableId: order.priceTableId,
    items: params.items,
    allowedProductIds,
    at: order.createdAt,
  });

  let creditHoldPayload: ReturnType<typeof violationsToJson> | undefined;
  if (order.status === "PENDING_CREDIT_APPROVAL") {
    const ev = await evaluateOrderCredit({
      organizationId: params.organizationId,
      customerId: order.customerId,
      proposedOrderTotal: sale.netTotal,
    });
    if (ev.action === "BLOCK") {
      throw new SaleCreateError(
        ev.violations.map((v) => v.message).join(" "),
        403,
        { creditDenied: true, violations: ev.violations },
      );
    }
    creditHoldPayload = violationsToJson(ev.violations);
  }

  const wasConfirmed = order.status === "CONFIRMED";
  const previousLines = order.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
  }));
  const nextLines = sale.lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
  }));

  if (wasConfirmed) {
    await assertSufficientStockForReplace(
      params.organizationId,
      previousLines,
      nextLines,
    );
    // Devolve estoque das quantidades antigas antes de trocar as linhas.
    await applyStockOnStatusChange(
      order.id,
      "CONFIRMED",
      "CANCELLED",
      params.actorUserId,
    );
  }

  let itemsReplaced = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      await tx.orderItem.createMany({
        data: sale.lines.map((l) => ({
          orderId: order.id,
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          productName: l.productName,
          commissionPercent: l.commissionPercent,
          commissionAmount: l.commissionAmount,
          commissionOrigin: l.commissionOrigin,
          priceTableId: l.priceTableId,
          priceTableName: l.priceTableName,
          priceOrigin: l.priceOrigin,
          priceOriginLabel: l.priceOriginLabel,
        })),
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          totalAmount: sale.netTotal,
          comboDiscountTotal: sale.comboDiscountTotal,
          ...(creditHoldPayload !== undefined
            ? { creditHoldReasons: creditHoldPayload }
            : {}),
        },
      });
    });
    itemsReplaced = true;

    if (wasConfirmed) {
      await applyStockOnStatusChange(
        order.id,
        "DRAFT",
        "CONFIRMED",
        params.actorUserId,
      );
    }
  } catch (err) {
    if (wasConfirmed && !itemsReplaced) {
      // Estorno feito, linhas ainda antigas — rebaixa o estoque original.
      try {
        await applyStockOnStatusChange(
          order.id,
          "DRAFT",
          "CONFIRMED",
          params.actorUserId,
        );
      } catch (restoreErr) {
        console.error(
          "[update-sale-order-items] falha ao restaurar estoque após erro",
          restoreErr,
        );
      }
    }
    throw err;
  }

  const updated = await prisma.order.findFirstOrThrow({
    where: { id: order.id },
    include: updatedOrderInclude,
  });

  await auditFromAuth(
    { organizationId: params.organizationId, sub: params.actorUserId },
    {
      action: AUDIT_ACTION.UPDATE,
      entityType: AUDIT_ENTITY.Order,
      entityId: order.id,
      metadata: {
        kind: "items",
        previousItemCount: order.items.length,
        itemCount: updated.items.length,
        totalAmount: Number(updated.totalAmount),
        previousTotalAmount: Number(order.totalAmount),
        status: updated.status,
      },
    },
  );

  return updated;
}
