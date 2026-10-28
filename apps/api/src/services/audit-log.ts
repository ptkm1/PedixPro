import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Política: falha ao gravar AuditLog NÃO deve derrubar a operação de negócio.
 * O erro é registrado no console do servidor; a request principal segue.
 */

export const AUDIT_ENTITY = {
  Product: "Product",
  Customer: "Customer",
  Order: "Order",
  User: "User",
  Supplier: "Supplier",
  SalesTeam: "SalesTeam",
  PriceTable: "PriceTable",
  ProductPromotion: "ProductPromotion",
  FiscalInvoice: "FiscalInvoice",
  FiscalConfig: "FiscalConfig",
  OrganizationRolePermission: "OrganizationRolePermission",
} as const;

export type AuditEntityType = (typeof AUDIT_ENTITY)[keyof typeof AUDIT_ENTITY];

export const AUDIT_ACTION = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  STATUS_CHANGE: "STATUS_CHANGE",
  STOCK_ENTRY: "STOCK_ENTRY",
  STOCK_SALE: "STOCK_SALE",
  STOCK_SALE_REVERSAL: "STOCK_SALE_REVERSAL",
  NFE_EMIT: "NFE_EMIT",
  NFE_TRANSMIT: "NFE_TRANSMIT",
  NFE_CANCEL: "NFE_CANCEL",
  NFE_CCE: "NFE_CCE",
  NFE_INUTILIZACAO: "NFE_INUTILIZACAO",
  NFE_CONSULTA: "NFE_CONSULTA",
  NFE_EMAIL: "NFE_EMAIL",
  NFE_IMPORT: "NFE_IMPORT",
  NFE_CONFIRM_IMPORT: "NFE_CONFIRM_IMPORT",
  FISCAL_SETTINGS: "FISCAL_SETTINGS",
  FISCAL_CERTIFICATE: "FISCAL_CERTIFICATE",
  FISCAL_LOGO: "FISCAL_LOGO",
  PERMISSIONS_UPDATE: "PERMISSIONS_UPDATE",
  EXPEDITION_START: "EXPEDITION_START",
  EXPEDITION_COMPLETE: "EXPEDITION_COMPLETE",
  ORDER_RELEASE: "ORDER_RELEASE",
} as const;

export type AuditAction =
  | (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION]
  | string;

export type AuditInput = {
  organizationId: string;
  userId?: string | null;
  userMatricula?: string | null;
  action: AuditAction;
  entityType: AuditEntityType | string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAuditLog(
  input: AuditInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  try {
    await db.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        userMatricula: input.userMatricula ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (err) {
    console.error("[audit-log] Failed to persist audit entry:", {
      err,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      organizationId: input.organizationId,
      userId: input.userId,
    });
  }
}

/** Busca matrícula do User no banco (JWT não carrega o campo). */
export async function resolveUserMatricula(
  userId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { matricula: true },
  });
  return user?.matricula ?? null;
}

export async function getActorAuditFields(userId: string): Promise<{
  userId: string;
  userMatricula: string | null;
}> {
  return {
    userId,
    userMatricula: await resolveUserMatricula(userId),
  };
}

/** Atalho: grava audit com organizationId + userId/matricula do ator autenticado. */
export async function auditFromAuth(
  auth: { organizationId: string; sub: string },
  fields: {
    action: AuditAction;
    entityType: AuditEntityType | string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const actor = await getActorAuditFields(auth.sub);
  await writeAuditLog(
    {
      organizationId: auth.organizationId,
      ...actor,
      ...fields,
    },
    tx,
  );
}
