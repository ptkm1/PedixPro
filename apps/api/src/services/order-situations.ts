import type { OrderStatus } from "@prisma/client";
import {
  isLifecycleSituationCode,
  isReservedSituationCode,
  orderStatusFromSituation,
  situationCodeFromOrderStatus,
  SYSTEM_SITUATION_CODES,
} from "@pedidos/shared";
import { prisma } from "../db.js";

/** Etapas padrão do fluxo do pedido (sistema + fulfillment). Por organização. */
export const DEFAULT_ORDER_SITUATIONS = [
  {
    code: SYSTEM_SITUATION_CODES.DRAFT,
    name: "Rascunho",
    sortOrder: 0,
    mapsToCancel: false,
  },
  {
    code: SYSTEM_SITUATION_CODES.CREDIT,
    name: "Aguardando liberação",
    sortOrder: 1,
    mapsToCancel: false,
  },
  {
    code: SYSTEM_SITUATION_CODES.OPEN,
    name: "Aberto",
    sortOrder: 2,
    mapsToCancel: false,
  },
  {
    code: SYSTEM_SITUATION_CODES.PICKING,
    name: "Separando",
    sortOrder: 3,
    mapsToCancel: false,
  },
  {
    code: SYSTEM_SITUATION_CODES.PACKED,
    name: "Separação concluída",
    sortOrder: 4,
    mapsToCancel: false,
  },
  {
    code: SYSTEM_SITUATION_CODES.SENT,
    name: "Aguardando entrega",
    sortOrder: 5,
    mapsToCancel: false,
  },
  {
    code: SYSTEM_SITUATION_CODES.DELIVERED,
    name: "Entregue",
    sortOrder: 6,
    mapsToCancel: false,
  },
  {
    code: SYSTEM_SITUATION_CODES.CANCELLED,
    name: "Cancelado",
    sortOrder: 7,
    mapsToCancel: true,
  },
] as const;

export {
  isLifecycleSituationCode,
  isReservedSituationCode,
  SYSTEM_SITUATION_CODES,
};

export async function ensureDefaultOrderSituations(
  organizationId: string,
): Promise<void> {
  const existingCount = await prisma.orderSituation.count({
    where: { organizationId },
  });
  const defaults =
    existingCount === 0
      ? DEFAULT_ORDER_SITUATIONS
      : DEFAULT_ORDER_SITUATIONS.filter((d) => isLifecycleSituationCode(d.code));

  for (const d of defaults) {
    await prisma.orderSituation.upsert({
      where: {
        organizationId_code: { organizationId, code: d.code },
      },
      create: {
        organizationId,
        code: d.code,
        name: d.name,
        sortOrder: d.sortOrder,
        mapsToCancel: d.mapsToCancel,
        isSystem: true,
        active: true,
      },
      update: {
        isSystem: true,
        mapsToCancel: d.mapsToCancel,
      },
    });
  }
}

export function normalizeSituationCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "_");
}

export async function findOrgSituationId(
  organizationId: string,
  code: string,
): Promise<string | null> {
  await ensureDefaultOrderSituations(organizationId);
  const row = await prisma.orderSituation.findUnique({
    where: { organizationId_code: { organizationId, code } },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function requireOrgSituationId(
  organizationId: string,
  code: string,
): Promise<string> {
  const id = await findOrgSituationId(organizationId, code);
  if (!id) {
    throw new Error(`Etapa ${code} não encontrada para a organização`);
  }
  return id;
}

export function statusFromSituationRow(sit: {
  code: string;
  mapsToCancel: boolean;
}): OrderStatus {
  return orderStatusFromSituation(sit.code, sit.mapsToCancel);
}

export async function situationIdForOrderStatus(
  organizationId: string,
  status: OrderStatus,
): Promise<string> {
  return requireOrgSituationId(
    organizationId,
    situationCodeFromOrderStatus(status),
  );
}
