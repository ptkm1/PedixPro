import type { OrderStatus } from "@prisma/client";
import type { FastifyReply } from "fastify";
import { prisma } from "../db.js";
import { situationIdForOrderStatus } from "./order-situations.js";
import {
  notifyAdminsCreditPending,
  notifySaleConfirmed,
} from "./admin-notifications.js";
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  auditFromAuth,
} from "./audit-log.js";
import { evaluateOrderCredit, violationsToJson } from "./credit.js";
import { reactivateCustomerOnSale } from "./customer-status.js";
import { nextOrderNumber } from "./order-number.js";
import {
  computeSaleOrder,
  OrderPricingError,
  type SaleLineInput,
} from "./order-pricing.js";
import {
  assertPriceTableForNewOrder,
  PriceTableServiceError,
} from "./price-tables.js";
import {
  applyStockOnStatusChange,
  assertSufficientStock,
  StockError,
  stockErrorPayload,
} from "./product-stock.js";
import { listSellerCatalogProductIds } from "./seller-product-catalog.js";
import { resolveEstablishmentForOrder, EstablishmentError } from "./establishments.js";

const createdOrderInclude = {
  items: true,
  customer: true,
  paymentCondition: true,
  establishment: {
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      cnpj: true,
      isPrimary: true,
    },
  },
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

export class SaleCreateError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly payload: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SaleCreateError";
  }
}

export async function sellerAllowedProductIds(
  sellerId: string,
  organizationId: string,
): Promise<Set<string>> {
  const ids = await listSellerCatalogProductIds(organizationId, sellerId);
  return new Set(ids);
}

export type CreateSaleOrderParams = {
  organizationId: string;
  actorUserId: string;
  sellerId: string;
  customerId: string;
  paymentConditionId: string;
  priceTableId?: string | null;
  items: SaleLineInput[];
  notes?: string;
  status?: "DRAFT" | "CONFIRMED" | "CANCELLED";
  operation?: "SALE";
  clientMutationId?: string;
  source: "seller" | "admin";
  allowedProductIds: Set<string>;
  /** CNPJ emissor; se omitido, usa preferência do usuário ou o principal. */
  establishmentId?: string | null;
  actorRole?: import("@prisma/client").Role;
  allowedEstablishmentIds?: unknown;
};

/** Envia 400/403 se for erro de venda conhecido. */
export function replySaleCreateError(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof SaleCreateError) {
    void reply.status(err.httpStatus).send({
      error: err.message,
      ...err.payload,
    });
    return true;
  }
  if (err instanceof OrderPricingError) {
    void reply.status(400).send({ error: err.message });
    return true;
  }
  if (err instanceof StockError) {
    void reply.status(400).send(stockErrorPayload(err));
    return true;
  }
  if (err instanceof PriceTableServiceError) {
    void reply.status(err.httpStatus).send({ error: err.message });
    return true;
  }
  return false;
}

export async function findIdempotentSale(params: {
  clientMutationId: string;
  organizationId: string;
  sellerId: string;
}) {
  const dup = await prisma.order.findUnique({
    where: { clientMutationId: params.clientMutationId },
    include: createdOrderInclude,
  });
  if (!dup) return null;
  if (
    dup.sellerId !== params.sellerId ||
    dup.organizationId !== params.organizationId
  ) {
    throw new SaleCreateError("Pedido já registado por outra conta.", 403);
  }
  return dup;
}

export async function createSaleOrder(params: CreateSaleOrderParams) {
  const clientMutationId = params.clientMutationId?.trim();
  if (clientMutationId) {
    const dup = await findIdempotentSale({
      clientMutationId,
      organizationId: params.organizationId,
      sellerId: params.sellerId,
    });
    if (dup) return dup;
  }

  const seller = await prisma.seller.findFirst({
    where: { id: params.sellerId, organizationId: params.organizationId },
    select: { id: true },
  });
  if (!seller) throw new SaleCreateError("Vendedor inválido", 400);

  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, organizationId: params.organizationId },
    select: { id: true, regionId: true },
  });
  if (!customer) throw new SaleCreateError("Cliente inválido", 400);

  const paymentCondition = await prisma.paymentCondition.findFirst({
    where: {
      id: params.paymentConditionId,
      organizationId: params.organizationId,
      active: true,
    },
    select: { id: true },
  });
  if (!paymentCondition) {
    throw new SaleCreateError("Condição de pagamento inválida", 400);
  }

  if (params.priceTableId) {
    try {
      await assertPriceTableForNewOrder({
        organizationId: params.organizationId,
        priceTableId: params.priceTableId,
        sellerId: params.sellerId,
        customerId: params.customerId,
        regionId: customer.regionId,
      });
    } catch (e) {
      if (e instanceof PriceTableServiceError) {
        throw new SaleCreateError(e.message, e.httpStatus);
      }
      throw e;
    }
  }

  const sale = await computeSaleOrder({
    organizationId: params.organizationId,
    sellerId: params.sellerId,
    customerId: params.customerId,
    priceTableId: params.priceTableId ?? null,
    items: params.items,
    allowedProductIds: params.allowedProductIds,
  });

  let orderStatus: OrderStatus = (params.status ?? "CONFIRMED") as OrderStatus;
  let creditHoldPayload: ReturnType<typeof violationsToJson> | undefined;

  if (orderStatus === "CONFIRMED") {
    const ev = await evaluateOrderCredit({
      organizationId: params.organizationId,
      customerId: params.customerId,
      proposedOrderTotal: sale.netTotal,
    });
    if (ev.action === "BLOCK") {
      throw new SaleCreateError(
        ev.violations.map((v) => v.message).join(" "),
        403,
        { creditDenied: true, violations: ev.violations },
      );
    }
    if (ev.action === "APPROVAL") {
      orderStatus = "PENDING_CREDIT_APPROVAL";
      creditHoldPayload = violationsToJson(ev.violations);
    }
  }

  if (orderStatus === "CONFIRMED") {
    await assertSufficientStock(
      params.organizationId,
      sale.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
      })),
    );
  }

  const situationId = await situationIdForOrderStatus(
    params.organizationId,
    orderStatus,
  );

  const actor = await prisma.user.findUnique({
    where: { id: params.actorUserId },
    select: {
      role: true,
      preferredEstablishmentId: true,
      allowedEstablishmentIds: true,
    },
  });

  let establishment;
  try {
    establishment = await resolveEstablishmentForOrder({
      organizationId: params.organizationId,
      establishmentId: params.establishmentId,
      preferredEstablishmentId: actor?.preferredEstablishmentId,
      role: params.actorRole ?? actor?.role ?? "SELLER",
      allowedEstablishmentIds:
        params.allowedEstablishmentIds ?? actor?.allowedEstablishmentIds,
    });
  } catch (e) {
    if (e instanceof EstablishmentError) {
      throw new SaleCreateError(e.message, e.httpStatus, { code: e.code });
    }
    throw e;
  }

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await nextOrderNumber(tx, params.organizationId);
    return tx.order.create({
      data: {
        organizationId: params.organizationId,
        establishmentId: establishment.id,
        sellerId: params.sellerId,
        customerId: params.customerId,
        paymentConditionId: params.paymentConditionId,
        priceTableId: params.priceTableId ?? null,
        operation: params.operation ?? "SALE",
        status: orderStatus,
        situationId,
        totalAmount: sale.netTotal,
        comboDiscountTotal: sale.comboDiscountTotal,
        notes: params.notes,
        orderNumber,
        ...(creditHoldPayload !== undefined
          ? { creditHoldReasons: creditHoldPayload }
          : {}),
        ...(clientMutationId ? { clientMutationId } : {}),
        items: {
          create: sale.lines.map((l) => ({
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
        },
      },
      include: createdOrderInclude,
    });
  });

  if (order.status === "PENDING_CREDIT_APPROVAL") {
    await notifyAdminsCreditPending({
      organizationId: params.organizationId,
      order: {
        id: order.id,
        totalAmount: order.totalAmount,
        sellerId: order.sellerId,
        seller: {
          user: order.seller.user,
          managerUserId: order.seller.managerUserId,
        },
        customer: order.customer,
      },
    });
  }

  if (order.status === "CONFIRMED") {
    await applyStockOnStatusChange(order.id, "DRAFT", "CONFIRMED", params.actorUserId);
    void reactivateCustomerOnSale(order.customerId);
    void notifySaleConfirmed({
      organizationId: params.organizationId,
      order: {
        id: order.id,
        totalAmount: order.totalAmount,
        sellerId: order.sellerId,
        seller: {
          user: order.seller.user,
          managerUserId: order.seller.managerUserId,
        },
        customer: order.customer,
      },
    });
  }

  await auditFromAuth(
    { organizationId: params.organizationId, sub: params.actorUserId },
    {
      action: AUDIT_ACTION.CREATE,
      entityType: AUDIT_ENTITY.Order,
      entityId: order.id,
      metadata: {
        status: order.status,
        sellerId: order.sellerId,
        customerId: order.customerId,
        itemCount: order.items.length,
        totalAmount: Number(order.totalAmount),
        source: params.source,
      },
    },
  );

  return order;
}
