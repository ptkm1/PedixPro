import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";

export type MonthPeriod = { start: Date; end: Date; year: number; month: number };

/** Limites inclusivos do mês civil local (alinha com filtros MTD das vendas). */
export function calendarMonthBounds(at: Date): MonthPeriod {
  const year = at.getFullYear();
  const month = at.getMonth();
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start, end, year, month: month + 1 };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Faturamento confirmado no período (total dos pedidos). */
export async function sellerConfirmedRevenueInPeriod(
  organizationId: string,
  sellerId: string,
  start: Date,
  end: Date,
): Promise<number> {
  const agg = await prisma.order.aggregate({
    where: {
      organizationId,
      sellerId,
      status: "CONFIRMED",
      createdAt: { gte: start, lte: end },
    },
    _sum: { totalAmount: true },
  });
  return roundMoney(decToNum(agg._sum.totalAmount ?? 0));
}

/** Comissão já registrada nas linhas de pedido no período (somatório). */
export async function sellerCommissionEarnedInPeriod(
  organizationId: string,
  sellerId: string,
  start: Date,
  end: Date,
): Promise<number> {
  const agg = await prisma.orderItem.aggregate({
    where: {
      commissionAmount: { not: null },
      order: {
        organizationId,
        sellerId,
        status: "CONFIRMED",
        createdAt: { gte: start, lte: end },
      },
    },
    _sum: { commissionAmount: true },
  });
  return roundMoney(decToNum(agg._sum.commissionAmount ?? 0));
}

export type RankingRow = {
  sellerId: string;
  name: string;
  totalAmount: number;
  rank: number;
};

/** Ranking por faturamento confirmado no período (ordenado descendente). */
export async function sellerRankingForPeriod(
  organizationId: string,
  start: Date,
  end: Date,
  opts?: { sellerIds?: string[] },
): Promise<RankingRow[]> {
  if (opts?.sellerIds && opts.sellerIds.length === 0) return [];

  const grouped = await prisma.order.groupBy({
    by: ["sellerId"],
    where: {
      organizationId,
      status: "CONFIRMED",
      createdAt: { gte: start, lte: end },
      ...(opts?.sellerIds ? { sellerId: { in: opts.sellerIds } } : {}),
    },
    _sum: { totalAmount: true },
  });

  const sellers = await prisma.seller.findMany({
    where: {
      organizationId,
      id: { in: grouped.map((g) => g.sellerId).filter((id): id is string => id != null) },
    },
    include: { user: { select: { name: true } } },
  });
  const nameBySeller = new Map(sellers.map((s) => [s.id, s.user.name]));

  const rows = grouped
    .filter((g): g is typeof g & { sellerId: string } => g.sellerId != null)
    .map((g) => ({
      sellerId: g.sellerId,
      name: nameBySeller.get(g.sellerId) ?? "—",
      totalAmount: roundMoney(decToNum(g._sum.totalAmount ?? 0)),
      rank: 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  return rows;
}
