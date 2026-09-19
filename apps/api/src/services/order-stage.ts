import { Prisma, type OrderStatus } from "@prisma/client";
import type { AccessPayload } from "../auth/jwt.js";
import { prisma } from "../db.js";
import {
  notifySaleConfirmed,
} from "./admin-notifications.js";
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  auditFromAuth,
} from "./audit-log.js";
import { reactivateCustomerOnSale } from "./customer-status.js";
import {
  applyStockOnStatusChange,
  StockError,
} from "./product-stock.js";
import { statusFromSituationRow } from "./order-situations.js";

export const orderStageInclude = {
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
  customer: true,
  seller: {
    include: {
      user: { select: { name: true, email: true } },
    },
  },
} as const;

export class OrderStageError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "OrderStageError";
  }
}

export { StockError };

export async function applyOrderStageChange(params: {
  organizationId: string;
  orderId: string;
  situationId: string;
  actorUserId: string;
  auth: Pick<AccessPayload, "organizationId" | "sub" | "role">;
}): Promise<Prisma.OrderGetPayload<{ include: typeof orderStageInclude }>> {
  const existing = await prisma.order.findFirst({
    where: {
      id: params.orderId,
      organizationId: params.organizationId,
    },
    include: {
      situation: { select: { id: true, code: true, mapsToCancel: true } },
    },
  });
  if (!existing) {
    throw new OrderStageError("Não encontrado", 404);
  }

  const situation = await prisma.orderSituation.findFirst({
    where: {
      id: params.situationId,
      organizationId: params.organizationId,
    },
  });
  if (!situation) {
    throw new OrderStageError("Etapa inválida", 400);
  }
  if (!situation.active && situation.id !== existing.situationId) {
    throw new OrderStageError("Etapa inválida ou inativa", 400);
  }

  const fromStatus = existing.status;
  const toStatus = statusFromSituationRow(situation);

  await applyStockOnStatusChange(
    params.orderId,
    fromStatus,
    toStatus,
    params.actorUserId,
  );

  const updated = await prisma.order.update({
    where: { id: params.orderId },
    data: {
      situationId: situation.id,
      status: toStatus,
      ...(toStatus !== "PENDING_CREDIT_APPROVAL"
        ? { creditHoldReasons: Prisma.DbNull }
        : {}),
    },
    include: orderStageInclude,
  });

  await auditFromAuth(params.auth, {
    action: AUDIT_ACTION.STATUS_CHANGE,
    entityType: AUDIT_ENTITY.Order,
    entityId: params.orderId,
    metadata: {
      field: "situationId",
      fromSituationId: existing.situationId,
      toSituationId: situation.id,
      fromStatus,
      toStatus,
    },
  });

  if (toStatus === "CONFIRMED" && fromStatus !== "CONFIRMED") {
    void reactivateCustomerOnSale(updated.customerId);
    void notifySaleConfirmed({
      organizationId: params.organizationId,
      order: {
        id: updated.id,
        totalAmount: updated.totalAmount,
        sellerId: updated.sellerId,
        seller: updated.seller
          ? {
              user: updated.seller.user,
              managerUserId: updated.seller.managerUserId,
            }
          : { user: { name: "VENDA DIRETA" }, managerUserId: null },
        customer: updated.customer,
      },
    });
  }

  return updated;
}

export function isConfirmingStatus(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return to === "CONFIRMED" && from !== "CONFIRMED";
}

export function isCancellingStatus(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return to === "CANCELLED" && from !== "CANCELLED";
}
