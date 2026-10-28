import { SYSTEM_SITUATION_CODES } from "@pedidos/shared";
import type { AccessPayload } from "../auth/jwt.js";
import { prisma } from "../db.js";
import {
  notifyCreditResolved,
} from "./admin-notifications.js";
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  auditFromAuth,
} from "./audit-log.js";
import {
  applyOrderStageChange,
  OrderStageError,
  orderStageInclude,
  StockError,
} from "./order-stage.js";
import { findOrgSituationId } from "./order-situations.js";

export type OrderReleaseAction = "APPROVE" | "REJECT" | "HOLD";

export class OrderReleaseError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "OrderReleaseError";
  }
}

export { OrderStageError, StockError };

function notifySellerPayload(order: {
  id: string;
  totalAmount: unknown;
  sellerId: string | null;
  seller: {
    user: { name: string };
    managerUserId: string | null;
  } | null;
  customer: { name: string } | null;
}) {
  return {
    id: order.id,
    totalAmount: order.totalAmount,
    sellerId: order.sellerId,
    seller: order.seller
      ? {
          user: order.seller.user,
          managerUserId: order.seller.managerUserId,
        }
      : { user: { name: "VENDA DIRETA" }, managerUserId: null },
    customer: order.customer,
  };
}

/**
 * Liberação de pedidos (escritório):
 * - APPROVE → CONFIRMED + etapa PICKING (Separando), baixa estoque
 * - REJECT → CANCELLED
 * - HOLD → permanece em PENDING_CREDIT_APPROVAL, registra nota/histórico
 */
export async function releaseOrder(params: {
  organizationId: string;
  orderId: string;
  action: OrderReleaseAction;
  note?: string | null;
  actorUserId: string;
  auth: Pick<AccessPayload, "organizationId" | "sub" | "role">;
}) {
  const note = params.note?.trim() || null;

  const existing = await prisma.order.findFirst({
    where: {
      id: params.orderId,
      organizationId: params.organizationId,
    },
    include: {
      situation: { select: { id: true, code: true, name: true } },
      seller: {
        include: {
          user: { select: { name: true } },
        },
      },
      customer: { select: { name: true } },
      releasedByUser: { select: { id: true, name: true, email: true } },
    },
  });
  if (!existing) {
    throw new OrderReleaseError("Não encontrado", 404);
  }
  if (existing.status !== "PENDING_CREDIT_APPROVAL") {
    throw new OrderReleaseError(
      "Pedido não está aguardando liberação",
      400,
    );
  }

  const now = new Date();

  if (params.action === "HOLD") {
    const updated = await prisma.order.update({
      where: { id: existing.id },
      data: {
        releaseDecision: "HOLD",
        releaseNote: note,
        releasedAt: now,
        releasedByUserId: params.actorUserId,
      },
      include: {
        ...orderStageInclude,
        releasedByUser: { select: { id: true, name: true, email: true } },
        items: { include: { product: true } },
        paymentCondition: {
          select: { id: true, name: true, days: true, sortOrder: true },
        },
        createdByUser: { select: { id: true, name: true, email: true } },
      },
    });

    await auditFromAuth(params.auth, {
      action: AUDIT_ACTION.ORDER_RELEASE,
      entityType: AUDIT_ENTITY.Order,
      entityId: existing.id,
      metadata: {
        decision: "HOLD",
        note,
        fromStatus: existing.status,
        fromSituationCode: existing.situation?.code ?? null,
      },
    });

    return updated;
  }

  const targetCode =
    params.action === "APPROVE"
      ? SYSTEM_SITUATION_CODES.PICKING
      : SYSTEM_SITUATION_CODES.CANCELLED;

  const situationId = await findOrgSituationId(
    params.organizationId,
    targetCode,
  );
  if (!situationId) {
    throw new OrderReleaseError(
      params.action === "APPROVE"
        ? "Etapa de separação (PICKING) não configurada"
        : "Etapa de cancelamento não configurada",
      400,
    );
  }

  const staged = await applyOrderStageChange({
    organizationId: params.organizationId,
    orderId: params.orderId,
    situationId,
    actorUserId: params.actorUserId,
    auth: params.auth,
  });

  const updated = await prisma.order.update({
    where: { id: params.orderId },
    data: {
      releaseDecision: params.action,
      releaseNote: note,
      releasedAt: now,
      releasedByUserId: params.actorUserId,
    },
    include: {
      ...orderStageInclude,
      releasedByUser: { select: { id: true, name: true, email: true } },
      items: { include: { product: true } },
      paymentCondition: {
        select: { id: true, name: true, days: true, sortOrder: true },
      },
      createdByUser: { select: { id: true, name: true, email: true } },
    },
  });

  await auditFromAuth(params.auth, {
    action: AUDIT_ACTION.ORDER_RELEASE,
    entityType: AUDIT_ENTITY.Order,
    entityId: params.orderId,
    metadata: {
      decision: params.action,
      note,
      fromStatus: existing.status,
      toStatus: staged.status,
      fromSituationCode: existing.situation?.code ?? null,
      toSituationCode: targetCode,
    },
  });

  void notifyCreditResolved({
    organizationId: params.organizationId,
    decision: params.action === "APPROVE" ? "APPROVED" : "REJECTED",
    order: notifySellerPayload(updated),
  });

  return updated;
}
