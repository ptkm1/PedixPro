import type { Prisma, Role } from "@prisma/client";
import type { FastifyReply } from "fastify";
import type { AccessPayload } from "../auth/jwt.js";

/** Papéis que podem usar o app mobile (rotas /seller). */
export function isMobileAppRole(role: Role): boolean {
  return role === "SELLER" || role === "ADMIN" || role === "MANAGER";
}

export function canAccessSellerApi(auth: AccessPayload): boolean {
  if (!auth.organizationId?.trim()) return false;
  if (auth.role === "ADMIN" || auth.role === "MANAGER") return true;
  return auth.role === "SELLER" && Boolean(auth.sellerId);
}

/** Staff (ADM/Gestor) pode lançar venda no app com vendedor opcional. */
export function isStaffSaleActor(auth: AccessPayload): boolean {
  return auth.role === "ADMIN" || auth.role === "MANAGER";
}

/**
 * Pedidos: admin/gestor vê a org (gestor ainda filtrado por scope nas rotas admin);
 * no app mobile, admin vê org; gestor vê próprias diretas + carteira gerida via queries;
 * vendedor só a carteira dele.
 */
export function mobileOrderWhere(
  auth: AccessPayload,
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    organizationId: auth.organizationId,
  };
  if (auth.role === "ADMIN") return where;
  if (auth.role === "MANAGER") {
    return {
      ...where,
      OR: [
        { seller: { managerUserId: auth.sub } },
        { sellerId: null, createdByUserId: auth.sub },
      ],
    };
  }
  if (auth.sellerId) {
    where.sellerId = auth.sellerId;
  }
  return where;
}

/**
 * Operações que exigem perfil de vendedor (criar venda como si mesmo).
 * Staff usa resolveSaleSellerId em vez desta função.
 */
export function requireSellerActor(
  auth: AccessPayload,
  reply: FastifyReply,
): string | null {
  if (auth.role === "SELLER" && auth.sellerId) return auth.sellerId;
  void reply.status(403).send({
    error:
      auth.role === "ADMIN" || auth.role === "MANAGER"
        ? "Informe o vendedor responsável ou marque Venda Direta."
        : "Apenas vendedores",
  });
  return null;
}

/**
 * Resolve o sellerId da venda:
 * - SELLER → sempre o próprio (ignora body)
 * - ADMIN/MANAGER → body.sellerId opcional (null/omitido = venda direta)
 */
export function resolveSaleSellerId(
  auth: AccessPayload,
  bodySellerId: string | null | undefined,
  reply: FastifyReply,
): { ok: true; sellerId: string | null } | { ok: false } {
  if (auth.role === "SELLER") {
    if (!auth.sellerId) {
      void reply.status(403).send({ error: "Apenas vendedores" });
      return { ok: false };
    }
    return { ok: true, sellerId: auth.sellerId };
  }
  if (auth.role === "ADMIN" || auth.role === "MANAGER") {
    const raw = bodySellerId?.trim();
    return { ok: true, sellerId: raw ? raw : null };
  }
  void reply.status(403).send({ error: "Sem permissão para lançar venda" });
  return { ok: false };
}
