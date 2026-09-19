import { cheapestPlanWithFeature, type PlanFeature } from "@pedidos/shared";
import type { FastifyReply } from "fastify";
import { getOrgEntitlements, orgHasPlanFeature } from "./entitlements.js";

/**
 * Mapeia path admin (routeOptions.url) → feature de plano.
 * Ajuste aqui quando o catálogo de features mudar.
 */
export function adminPathToPlanFeature(routePath: string): PlanFeature | null {
  const p = routePath.split("?")[0] ?? routePath;

  if (p.startsWith("/fiscal") || p === "/reports/invoiced-orders") {
    return "fiscal_nfe";
  }
  if (p.startsWith("/establishments") && p !== "/establishments" && !p.endsWith("/preferred")) {
    // list/preferred always allowed; create second CNPJ gated in service
    return null;
  }
  if (p.startsWith("/expedition")) return "expedition";
  if (
    p.startsWith("/seller-locations") ||
    p.includes("/location-history") ||
    p === "/reports/seller-tracking"
  ) {
    return "tracking";
  }
  if (
    p.startsWith("/seller-customer-visits") ||
    p.includes("/visits") ||
    p === "/reports/visit-effectiveness"
  ) {
    return "visits";
  }
  if (
    p.startsWith("/commission") ||
    p.startsWith("/seller-monthly-goals") ||
    p.startsWith("/commission-progressive") ||
    p === "/reports/commission-statement" ||
    p === "/reports/commission-by-order" ||
    p === "/reports/commissions-payable" ||
    p === "/reports/commissions-payable.pdf" ||
    p === "/reports/commissions-payable.xlsx" ||
    p === "/commission-settings"
  ) {
    return "commissions";
  }
  if (p.startsWith("/price-tables")) return "price_tables";
  if (p.startsWith("/sales-teams") || p.startsWith("/teams")) return "teams";
  if (
    p.startsWith("/insights") ||
    p.includes("morning-brief") ||
    p === "/reports/insights" ||
    p === "/reports/distributor-insights"
  ) {
    return "insights";
  }
  if (
    p === "/reports/scorecard" ||
    p === "/reports/margin" ||
    p === "/reports/financial-result" ||
    p === "/reports/financial-result.pdf" ||
    p === "/reports/stock-health" ||
    p === "/reports/credit-aging" ||
    p === "/reports/fiscal-outbound-summary" ||
    p === "/reports/fiscal-reconciliation" ||
    p === "/reports/customer-abc" ||
    p === "/reports/customer-positivacao" ||
    p === "/reports/portfolio-by-seller" ||
    p === "/reports/top-products" ||
    p === "/reports/product-positivacao" ||
    p.startsWith("/reports/management")
  ) {
    return "reports_advanced";
  }
  if (p === "/notifications/send" || p.startsWith("/broadcast")) {
    return "broadcast";
  }
  if (p.startsWith("/audit")) return "audit";
  if (p === "/organization/branding") return "whitelabel";

  return null;
}

export async function assertPlanFeature(
  reply: FastifyReply,
  organizationId: string,
  feature: PlanFeature,
): Promise<boolean> {
  const ok = await orgHasPlanFeature(organizationId, feature);
  if (ok) return true;

  const ent = await getOrgEntitlements(organizationId);
  const upgrade = cheapestPlanWithFeature(feature);
  reply.status(403).send({
    error: "Este recurso não está incluído no seu plano",
    code: "PLAN_FEATURE_REQUIRED",
    planId: ent.planId,
    feature,
    upgradeTo: upgrade?.id ?? null,
    upgradeName: upgrade?.name ?? null,
  });
  return false;
}

/** Responde 403 se o path exigir feature ausente. Retorna false se bloqueou. */
export async function assertAdminPathPlanFeature(
  reply: FastifyReply,
  organizationId: string,
  routePath: string,
): Promise<boolean> {
  const feature = adminPathToPlanFeature(routePath);
  if (!feature) return true;
  return assertPlanFeature(reply, organizationId, feature);
}
