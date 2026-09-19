import {
  resolveCommissionFromFacts,
  type CommissionOrigin,
  type ResolvedCommission,
} from "@pedidos/shared";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";

export type CommissionResolveContext = {
  /** Faturamento confirmado no mês antes do pedido atual (para faixa progressiva). */
  mtdConfirmedRevenue: number;
  /** Tabela efetivamente usada na linha (exceção produto+tabela). */
  priceTableId?: string | null;
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
 * tabela do produto > vendedor no produto > regras atuais (produto/grupo/indústria).
 * Sem vendedor (venda direta) → 0 (via resolveCommissionPercent).
 */
export async function resolveCommission(
  organizationId: string,
  sellerId: string,
  productId: string,
  categoryId: string | null,
  ctx?: CommissionResolveContext,
): Promise<ResolvedCommission> {
  const seller = await prisma.seller.findFirst({
    where: { id: sellerId, organizationId },
    select: { commissionType: true, commissionPercent: true },
  });
  if (!seller) throw new Error("Vendedor não encontrado");

  const priceTableId = ctx?.priceTableId ?? null;
  const [tableExc, sellerExc, product, category, rules] = await Promise.all([
    priceTableId
      ? prisma.productPriceTableCommission.findFirst({
          where: { organizationId, productId, priceTableId },
          select: { commissionPercent: true },
        })
      : Promise.resolve(null),
    prisma.productSellerCommission.findFirst({
      where: { organizationId, productId, sellerId },
      select: { commissionPercent: true },
    }),
    prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: { commissionPercent: true },
    }),
    categoryId
      ? prisma.productCategory.findFirst({
          where: { id: categoryId, organizationId },
          select: { commissionPercent: true },
        })
      : Promise.resolve(null),
    prisma.sellerCommissionRule.findMany({
      where: { organizationId, sellerId, active: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const mtd = ctx?.mtdConfirmedRevenue;
  let progressivePercent: number | null = null;
  if (seller.commissionType === "FIXED" && mtd != null && mtd >= 0) {
    progressivePercent = await resolveProgressiveCommissionPercent(
      organizationId,
      sellerId,
      mtd,
    );
  }

  return resolveCommissionFromFacts({
    priceTablePercent:
      tableExc != null ? decToNum(tableExc.commissionPercent) : null,
    sellerProductPercent:
      sellerExc != null ? decToNum(sellerExc.commissionPercent) : null,
    productDefaultPercent:
      product?.commissionPercent != null
        ? decToNum(product.commissionPercent)
        : null,
    sellerRulePercent: percentFromRules(rules, productId, categoryId),
    groupPercent:
      category?.commissionPercent != null
        ? decToNum(category.commissionPercent)
        : null,
    progressivePercent,
    sellerType: seller.commissionType,
    sellerDefaultPercent: decToNum(seller.commissionPercent),
  });
}

export async function resolveCommissionPercent(
  organizationId: string,
  sellerId: string | null | undefined,
  productId: string,
  categoryId: string | null,
  ctx?: CommissionResolveContext,
): Promise<number> {
  if (!sellerId) return 0;
  const resolved = await resolveCommission(
    organizationId,
    sellerId,
    productId,
    categoryId,
    ctx,
  );
  return resolved.percent;
}

export type { CommissionOrigin, ResolvedCommission };

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
