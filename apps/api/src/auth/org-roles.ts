import type { Prisma, Role } from "@prisma/client";
import type { FastifyReply } from "fastify";
import { prisma } from "../db.js";
import type { AccessPayload } from "./jwt.js";
import { canWrite } from "./permissions.js";

const STAFF_ROLES: Role[] = ["ADMIN", "MANAGER"];

/**
 * `routeOptions.url` chega com o prefixo do plugin (`/api/v1/admin/...`), mas as
 * allow-lists e os mapas de recurso/plano usam o caminho relativo ao plugin.
 */
export function adminRelativePath(routeUrl: string): string {
  const path = routeUrl.split("?")[0] ?? routeUrl;
  const relative = path.replace(/^\/api\/v\d+\/admin/, "");
  return relative === "" ? "/" : relative;
}

/** GET paths (relative to /admin plugin) allowed for MANAGER. */
const MANAGER_GET_ALLOW = [
  /^\/$/,
  /^\/managers$/,
  /^\/sellers$/,
  /^\/seller-locations$/,
  /^\/seller-locations\/ws$/,
  /^\/customer-visits$/,
  /^\/sellers\/[^/]+\/location-history$/,
  /^\/orders$/,
  /^\/orders\/[^/]+$/,
  /^\/orders\/[^/]+\/pdf$/,
  /^\/orders\/[^/]+\/pdf-80mm$/,
  /^\/order-situations$/,
  /^\/reports\/sales-by-supplier$/,
  /^\/reports\/scorecard$/,
  /^\/reports\/margin$/,
  /^\/reports\/financial-result$/,
  /^\/reports\/financial-result\.pdf$/,
  /^\/reports\/commission-statement$/,
  /^\/reports\/stock-health$/,
  /^\/reports\/credit-aging$/,
  /^\/reports\/fiscal-reconciliation$/,
  /^\/reports\/visit-effectiveness$/,
  /^\/reports\/customer-abc$/,
  /^\/reports\/customer-positivacao$/,
  /^\/reports\/portfolio-by-seller$/,
  /^\/reports\/top-products$/,
  /^\/reports\/product-positivacao$/,
  /^\/reports\/commission-by-order$/,
  /^\/reports\/commissions-payable$/,
  /^\/reports\/commissions-payable\.pdf$/,
  /^\/reports\/commissions-payable\.xlsx$/,
  /^\/commission-settings$/,
  /^\/reports\/invoiced-orders$/,
  /^\/reports\/home-dashboard-config$/,
  /^\/reports\/home-indicator$/,
  /^\/reports\/route-romaneio\.pdf$/,
  /^\/expedition/,
  /^\/notifications$/,
  /^\/notifications\/unread-count$/,
  /^\/push-vapid-public-key$/,
  /^\/banking\//,
  /^\/receivables$/,
  /^\/customers\/[^/]+\/credit-check$/,
  /^\/customers\/[^/]+\/receivables$/,
  /^\/establishments$/,
] as const;

/** Write paths managers may use (inbox + push + broadcast + aprovação de clientes). */
const MANAGER_WRITE_ALLOW = [
  /^\/notifications\/[^/]+\/read$/,
  /^\/notifications\/read-all$/,
  /^\/notifications\/send$/,
  /^\/push-devices$/,
  /^\/customers\/[^/]+\/approve$/,
  /^\/customers\/[^/]+\/reject$/,
  /^\/reports\/route-romaneio\.pdf$/,
  /^\/reports\/home-dashboard-config$/,
  /^\/expedition/,
  /^\/orders$/,
  /^\/orders\/preview$/,
  /^\/establishments\/preferred$/,
] as const;

export function isManagerWriteAllowed(routePath: string): boolean {
  const path = routePath.split("?")[0] ?? routePath;
  return MANAGER_WRITE_ALLOW.some((re) => re.test(path));
}

/** Write paths team leaders may use (ordem dos widgets da home). */
const TEAM_LEADER_WRITE_ALLOW = [
  /^\/reports\/home-dashboard-config$/,
] as const;

export function isTeamLeaderWriteAllowed(routePath: string): boolean {
  const path = routePath.split("?")[0] ?? routePath;
  return TEAM_LEADER_WRITE_ALLOW.some((re) => re.test(path));
}

/** GET paths allowed for team leader (seller with led team). */
const TEAM_LEADER_GET_ALLOW = [
  /^\/$/,
  /^\/sellers$/,
  /^\/seller-locations$/,
  /^\/seller-locations\/ws$/,
  /^\/customer-visits$/,
  /^\/sellers\/[^/]+\/location-history$/,
  /^\/orders$/,
  /^\/orders\/[^/]+$/,
  /^\/orders\/[^/]+\/pdf$/,
  /^\/orders\/[^/]+\/pdf-80mm$/,
  /^\/order-situations$/,
  /^\/reports\/team-summary$/,
  /^\/reports\/sales-by-supplier$/,
  /^\/reports\/scorecard$/,
  /^\/reports\/visit-effectiveness$/,
  /^\/reports\/top-products$/,
  /^\/reports\/customer-positivacao$/,
  /^\/reports\/customer-abc$/,
  /^\/reports\/product-positivacao$/,
  /^\/reports\/home-dashboard-config$/,
  /^\/reports\/home-indicator$/,
  /^\/reports\/route-romaneio\.pdf$/,
] as const;

export function isOrgStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}

export function isTeamLeaderAuth(auth: AccessPayload): boolean {
  return auth.role === "SELLER" && !!auth.teamLeaderTeamId;
}

export function canAccessAdminPanel(auth: AccessPayload): boolean {
  return isOrgStaff(auth.role) || isTeamLeaderAuth(auth);
}

export function sellerScopeWhere(auth: AccessPayload): Prisma.SellerWhereInput {
  const base: Prisma.SellerWhereInput = { organizationId: auth.organizationId };
  if (auth.role === "MANAGER") {
    return { ...base, managerUserId: auth.sub };
  }
  if (isTeamLeaderAuth(auth)) {
    return { ...base, teamId: auth.teamLeaderTeamId! };
  }
  return base;
}

export function orderScopeWhere(auth: AccessPayload): Prisma.OrderWhereInput {
  const base: Prisma.OrderWhereInput = { organizationId: auth.organizationId };
  if (auth.role === "MANAGER") {
    return {
      ...base,
      OR: [
        { seller: { managerUserId: auth.sub } },
        { sellerId: null, createdByUserId: auth.sub },
      ],
    };
  }
  if (isTeamLeaderAuth(auth)) {
    return {
      ...base,
      OR: [
        { seller: { teamId: auth.teamLeaderTeamId! } },
        { sellerId: null, createdByUserId: auth.sub },
      ],
    };
  }
  return base;
}

export function isManagerGetAllowed(routePath: string): boolean {
  const path = routePath.split("?")[0] ?? routePath;
  return MANAGER_GET_ALLOW.some((re) => re.test(path));
}

export function isTeamLeaderGetAllowed(routePath: string): boolean {
  const path = routePath.split("?")[0] ?? routePath;
  return TEAM_LEADER_GET_ALLOW.some((re) => re.test(path));
}

export function requireOrgStaff(
  reply: FastifyReply,
  auth: AccessPayload | undefined,
): auth is AccessPayload {
  if (!auth) {
    void reply.status(401).send({ error: "Não autorizado" });
    return false;
  }
  if (!auth.organizationId?.trim()) {
    void reply.status(401).send({ error: "Não autorizado" });
    return false;
  }
  if (!canAccessAdminPanel(auth)) {
    void reply.status(403).send({
      error: "Acesso restrito a administradores, gestores e líderes de equipe",
    });
    return false;
  }
  return true;
}

export function requireAdmin(
  reply: FastifyReply,
  auth: AccessPayload,
): boolean {
  if (!isAdmin(auth.role)) {
    void reply.status(403).send({ error: "Apenas administradores" });
    return false;
  }
  return true;
}

export async function assertSellerInScope(
  reply: FastifyReply,
  auth: AccessPayload,
  sellerId: string,
): Promise<boolean> {
  const row = await prisma.seller.findFirst({
    where: { id: sellerId, ...sellerScopeWhere(auth) },
    select: { id: true },
  });
  if (!row) {
    void reply.status(404).send({ error: "Vendedor não encontrado" });
    return false;
  }
  return true;
}

export async function validateManagerAssignment(
  organizationId: string,
  managerUserId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (managerUserId == null) return { ok: true };
  const mgr = await prisma.user.findFirst({
    where: { id: managerUserId, organizationId, role: "MANAGER" },
    select: { id: true },
  });
  if (!mgr) {
    return {
      ok: false,
      error:
        "Gestor inválido (deve ser utilizador MANAGER da mesma organização)",
    };
  }
  return { ok: true };
}

export async function teamMemberSellerIds(teamId: string): Promise<string[]> {
  const rows = await prisma.seller.findMany({
    where: { teamId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Invariante: Gestor não escreve estoque/produtos (sem perfil Seller). */
export function assertManagerHasNoStockWrite(): boolean {
  return (
    !canWrite("MANAGER", "stock") &&
    !canWrite("MANAGER", "products") &&
    canWrite("ADMIN", "stock")
  );
}
