import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import { sellerLabelOrDirect } from "../util/order-seller-filter.js";

export type TeamSalesSummary = {
  generatedAt: string;
  period: { from: string | null; to: string | null };
  teamName: string | null;
  totals: {
    orderCount: number;
    totalAmount: number;
  };
  bySeller: Array<{
    sellerId: string;
    name: string;
    orderCount: number;
    totalAmount: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    totalAmount: number;
  }>;
};

function parseOptionalDate(raw: string | undefined): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function buildTeamSalesSummary(params: {
  organizationId: string;
  sellerIds: string[];
  teamName?: string | null;
  from?: string;
  to?: string;
}): Promise<TeamSalesSummary> {
  const fromDt = parseOptionalDate(params.from);
  const toDt = parseOptionalDate(params.to);

  const where: Prisma.OrderWhereInput = {
    organizationId: params.organizationId,
    status: "CONFIRMED",
    sellerId: { in: params.sellerIds },
  };

  const createdAt: Prisma.DateTimeFilter = {};
  if (fromDt) createdAt.gte = fromDt;
  if (toDt) createdAt.lte = toDt;
  if (Object.keys(createdAt).length) where.createdAt = createdAt;

  const orders = await prisma.order.findMany({
    where,
    select: {
      sellerId: true,
      totalAmount: true,
      seller: { include: { user: { select: { name: true } } } },
      items: {
        select: {
          productId: true,
          productName: true,
          quantity: true,
          unitPrice: true,
        },
      },
    },
  });

  const bySellerMap = new Map<
    string,
    { name: string; orderCount: number; totalAmount: number }
  >();
  const productMap = new Map<
    string,
    { productName: string; quantity: number; totalAmount: number }
  >();

  let orderCount = 0;
  let totalAmount = 0;

  for (const o of orders) {
    orderCount += 1;
    const amount = decToNum(o.totalAmount);
    totalAmount += amount;

    if (o.sellerId) {
      const sellerRow = bySellerMap.get(o.sellerId) ?? {
        name: sellerLabelOrDirect(o.seller?.user.name),
        orderCount: 0,
        totalAmount: 0,
      };
      sellerRow.orderCount += 1;
      sellerRow.totalAmount += amount;
      bySellerMap.set(o.sellerId, sellerRow);
    }

    for (const it of o.items) {
      const lineTotal = decToNum(it.unitPrice) * it.quantity;
      const prod = productMap.get(it.productId) ?? {
        productName: it.productName,
        quantity: 0,
        totalAmount: 0,
      };
      prod.quantity += it.quantity;
      prod.totalAmount += lineTotal;
      productMap.set(it.productId, prod);
    }
  }

  const sellers = await prisma.seller.findMany({
    where: { id: { in: params.sellerIds } },
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const bySeller = sellers.map((s) => {
    const agg = bySellerMap.get(s.id);
    return {
      sellerId: s.id,
      name: s.user.name,
      orderCount: agg?.orderCount ?? 0,
      totalAmount: agg?.totalAmount ?? 0,
    };
  });

  const topProducts = [...productMap.entries()]
    .map(([productId, p]) => ({
      productId,
      productName: p.productName,
      quantity: p.quantity,
      totalAmount: p.totalAmount,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 15);

  return {
    generatedAt: new Date().toISOString(),
    period: {
      from: fromDt?.toISOString() ?? null,
      to: toDt?.toISOString() ?? null,
    },
    teamName: params.teamName ?? null,
    totals: { orderCount, totalAmount },
    bySeller,
    topProducts,
  };
}
