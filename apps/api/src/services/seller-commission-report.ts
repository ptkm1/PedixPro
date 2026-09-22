import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value?.trim()) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function defaultStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type SellerCommissionRow = {
  orderId: string;
  orderNumber: number | null;
  createdAt: string;
  customerName: string;
  saleAmount: number;
  commissionBase: number;
  commissionPercent: number;
  commissionAmount: number;
};

function mapRow(order: {
  id: string;
  orderNumber: number | null;
  createdAt: Date;
  totalAmount: unknown;
  customer: { name: string } | null;
  items: { commissionAmount: unknown }[];
}): SellerCommissionRow {
  const saleAmount = roundMoney(decToNum(order.totalAmount));
  const commissionAmount = roundMoney(
    order.items.reduce((sum, item) => sum + decToNum(item.commissionAmount ?? 0), 0),
  );
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    customerName: order.customer?.name ?? "—",
    saleAmount,
    commissionBase: saleAmount,
    commissionPercent:
      saleAmount > 0 ? roundMoney((commissionAmount / saleAmount) * 100) : 0,
    commissionAmount,
  };
}

export function sellerCommissionPeriod(from?: string, to?: string) {
  return {
    from: parseDate(from, defaultStart()),
    to: parseDate(to, new Date()),
  };
}

function whereFor(params: {
  organizationId: string;
  sellerId: string;
  from?: string;
  to?: string;
}): Prisma.OrderWhereInput {
  const period = sellerCommissionPeriod(params.from, params.to);
  return {
    organizationId: params.organizationId,
    sellerId: params.sellerId,
    status: "CONFIRMED",
    createdAt: { gte: period.from, lte: period.to },
  };
}

export async function listSellerCommissions(params: {
  organizationId: string;
  sellerId: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}) {
  const where = whereFor(params);
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const [orders, sales, commissions] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true, orderNumber: true, createdAt: true, totalAmount: true,
        customer: { select: { name: true } },
        items: { select: { commissionAmount: true } },
      },
    }),
    prisma.order.aggregate({ where, _sum: { totalAmount: true }, _count: true }),
    prisma.orderItem.aggregate({
      where: { order: where, commissionAmount: { not: null } },
      _sum: { commissionAmount: true },
    }),
  ]);
  const hasMore = orders.length > limit;
  const rows = orders.slice(0, limit).map(mapRow);
  const period = sellerCommissionPeriod(params.from, params.to);
  return {
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    totals: {
      saleAmount: roundMoney(decToNum(sales._sum.totalAmount ?? 0)),
      commissionAmount: roundMoney(decToNum(commissions._sum.commissionAmount ?? 0)),
      orderCount: sales._count,
    },
    rows,
    nextCursor: hasMore ? rows.at(-1)?.orderId ?? null : null,
  };
}

export async function getSellerCommissionDetail(params: {
  organizationId: string;
  sellerId: string;
  orderId: string;
}) {
  const order = await prisma.order.findFirst({
    where: { id: params.orderId, organizationId: params.organizationId, sellerId: params.sellerId, status: "CONFIRMED" },
    select: {
      id: true, orderNumber: true, createdAt: true, totalAmount: true,
      customer: { select: { name: true } },
      items: {
        select: {
          productName: true,
          quantity: true,
          unitPrice: true,
          commissionPercent: true,
          commissionAmount: true,
          commissionOrigin: true,
          priceTableName: true,
        },
      },
    },
  });
  if (!order) return null;
  const summary = mapRow(order);
  return {
    ...summary,
    items: order.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: roundMoney(decToNum(item.unitPrice)),
      commissionPercent: roundMoney(decToNum(item.commissionPercent ?? 0)),
      commissionAmount: roundMoney(decToNum(item.commissionAmount ?? 0)),
      commissionOrigin: item.commissionOrigin ?? null,
      priceTableName: item.priceTableName ?? null,
    })),
  };
}
