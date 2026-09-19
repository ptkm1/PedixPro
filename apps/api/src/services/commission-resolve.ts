import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";

export type CommissionResolveContext = {
  /** Faturamento confirmado no mês antes do pedido atual (para faixa progressiva). */
  mtdConfirmedRevenue: number;
};

async function loadApplicableProgressiveTiers(
  organizationId: string,
  sellerId: string,
) {
  const specific = await prisma.commissionProgressiveTier.findMany({
    where: { organizationId, sellerId, active: true },
    orderBy: [{ thresholdAmount: "asc" }, { priority: "desc" }],
  });
  if (specific.length) return specific;
  return prisma.commissionProgressiveTier.findMany({
    where: { organizationId, sellerId: null, active: true },
    orderBy: [{ thresholdAmount: "asc" }, { priority: "desc" }],
  });
}

/** Percentual da faixa progressiva aplicável ao MTD (sem regras por SKU/categoria). */
export async function resolveProgressiveCommissionPercent(
  organizationId: string,
  sellerId: string,
  mtdRevenue: number,
): Promise<number | null> {
  const list = await loadApplicableProgressiveTiers(organizationId, sellerId);
  if (!list.length) return null;
  let picked: (typeof list)[number] | null = null;
  for (const t of list) {
    if (mtdRevenue + 1e-6 >= decToNum(t.thresholdAmount)) picked = t;
  }
  return picked ? decToNum(picked.commissionPercent) : null;
}

function percentFromRules(
  rules: Array<{
    productId: string | null;
    categoryId: string | null;
    commissionPercent: { toString(): string };
  }>,
  productId: string,
  categoryId: string | null,
): number | null {
  for (const r of rules) {
    if (r.productId && r.productId === productId)
      return decToNum(r.commissionPercent);
  }
  for (const r of rules) {
    if (
      !r.productId &&
      r.categoryId &&
      categoryId &&
      r.categoryId === categoryId
    ) {
      return decToNum(r.commissionPercent);
    }
  }
  for (const r of rules) {
    if (!r.productId && !r.categoryId) return decToNum(r.commissionPercent);
  }
  return null;
}

/** Linha base exibida ao vendedor: regra geral > progressiva MTD > % cadastro / tipo. */
export async function resolveCommissionBaselinePercent(
  organizationId: string,
  sellerId: string,
  mtdRevenue: number,
): Promise<number> {
  const seller = await prisma.seller.findFirst({
    where: { id: sellerId, organizationId },
    select: { commissionType: true, commissionPercent: true },
  });
  if (!seller) throw new Error("Vendedor não encontrado");

  const rules = await prisma.sellerCommissionRule.findMany({
    where: {
      organizationId,
      sellerId,
      active: true,
      productId: null,
      categoryId: null,
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
  if (rules.length) return decToNum(rules[0].commissionPercent);

  if (seller.commissionType === "FIXED") {
    const prog = await resolveProgressiveCommissionPercent(
      organizationId,
      sellerId,
      mtdRevenue,
    );
    if (prog != null) return prog;
  }

  if (
    seller.commissionType === "BY_PRODUCT" ||
    seller.commissionType === "BY_CATEGORY"
  ) {
    return decToNum(seller.commissionPercent);
  }

  return decToNum(seller.commissionPercent);
}

/**
 * Comissão efetiva por linha:
 * regra por produto > por categoria > regra geral > tipo do vendedor > faixa progressiva (FIXED) > % cadastro.
 * Sem vendedor (venda direta) → 0.
 */
export async function resolveCommissionPercent(
  organizationId: string,
  sellerId: string | null | undefined,
  productId: string,
  categoryId: string | null,
  ctx?: CommissionResolveContext,
): Promise<number> {
  if (!sellerId) return 0;

  const seller = await prisma.seller.findFirst({
    where: { id: sellerId, organizationId },
    select: { commissionType: true, commissionPercent: true },
  });
  if (!seller) throw new Error("Vendedor não encontrado");

  const rules = await prisma.sellerCommissionRule.findMany({
    where: { organizationId, sellerId, active: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  const fromRules = percentFromRules(rules, productId, categoryId);
  if (fromRules != null) return fromRules;

  const mtd = ctx?.mtdConfirmedRevenue;

  switch (seller.commissionType) {
    case "BY_PRODUCT": {
      const product = await prisma.product.findFirst({
        where: { id: productId, organizationId },
        select: { commissionPercent: true },
      });
      if (product?.commissionPercent != null)
        return decToNum(product.commissionPercent);
      return decToNum(seller.commissionPercent);
    }
    case "BY_CATEGORY": {
      if (categoryId) {
        const category = await prisma.productCategory.findFirst({
          where: { id: categoryId, organizationId },
          select: { commissionPercent: true },
        });
        if (category?.commissionPercent != null)
          return decToNum(category.commissionPercent);
      }
      return decToNum(seller.commissionPercent);
    }
    case "BY_SUPPLIER":
      return decToNum(seller.commissionPercent);
    case "FIXED":
    default: {
      if (mtd != null && mtd >= 0) {
        const prog = await resolveProgressiveCommissionPercent(
          organizationId,
          sellerId,
          mtd,
        );
        if (prog != null) return prog;
      }
      return decToNum(seller.commissionPercent);
    }
  }
}

export async function getProgressiveTierRowsForSeller(
  organizationId: string,
  sellerId: string,
): Promise<
  Array<{
    id: string;
    thresholdAmount: number;
    commissionPercent: number;
    label: string | null;
    priority: number;
    scope: "SELLER" | "ORG";
  }>
> {
  const specific = await prisma.commissionProgressiveTier.findMany({
    where: { organizationId, sellerId, active: true },
    orderBy: [{ thresholdAmount: "asc" }, { priority: "desc" }],
  });
  const list =
    specific.length > 0
      ? specific
      : await prisma.commissionProgressiveTier.findMany({
          where: { organizationId, sellerId: null, active: true },
          orderBy: [{ thresholdAmount: "asc" }, { priority: "desc" }],
        });
  return list.map((t) => ({
    id: t.id,
    thresholdAmount: decToNum(t.thresholdAmount),
    commissionPercent: decToNum(t.commissionPercent),
    label: t.label,
    priority: t.priority,
    scope: t.sellerId ? ("SELLER" as const) : ("ORG" as const),
  }));
}
