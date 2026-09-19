import type { HomeChartIndicatorKey } from "@pedidos/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import { sellerLabelOrDirect } from "../util/order-seller-filter.js";

/**
 * Rentabilidade = receita − custo.
 * Custo usa `Product.costPrice` (último custo cadastrado). Linhas sem custo
 * entram com custo 0 e incrementam `linesMissingCost` — sem inventar números.
 */
export type HomeIndicatorRow = {
  id: string;
  label: string;
  /** Valor principal: vendas (sales_*) ou margem (profit_*). */
  value: number;
  secondary?: number;
  orderCount?: number;
};

export type HomeIndicatorSummary = {
  key: HomeChartIndicatorKey;
  generatedAt: string;
  period: { from: string; to: string };
  metric: "sales" | "profit";
  totals: {
    totalAmount: number;
    orderCount: number;
    linesMissingCost?: number;
  };
  rows: HomeIndicatorRow[];
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
}

function parseOptionalDate(raw: string | undefined): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function emptySummary(
  key: HomeChartIndicatorKey,
  metric: "sales" | "profit",
  fromDt: Date,
  toDt: Date,
): HomeIndicatorSummary {
  return {
    key,
    generatedAt: new Date().toISOString(),
    period: { from: fromDt.toISOString(), to: toDt.toISOString() },
    metric,
    totals: { totalAmount: 0, orderCount: 0 },
    rows: [],
  };
}

export async function buildHomeIndicator(params: {
  organizationId: string;
  key: HomeChartIndicatorKey;
  sellerIds?: string[];
  establishmentId?: string | null;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<HomeIndicatorSummary> {
  const limit = params.limit ?? 5;
  const fromDt = parseOptionalDate(params.from) ?? startOfCurrentMonthUtc();
  const toDt = parseOptionalDate(params.to) ?? new Date();
  const metric = params.key.startsWith("profit_") ? "profit" : "sales";

  if (params.sellerIds && params.sellerIds.length === 0) {
    return emptySummary(params.key, metric, fromDt, toDt);
  }

  const orderWhere: Prisma.OrderWhereInput = {
    organizationId: params.organizationId,
    status: "CONFIRMED",
    createdAt: { gte: fromDt, lte: toDt },
  };
  if (params.sellerIds && params.sellerIds.length > 0) {
    orderWhere.sellerId = { in: params.sellerIds };
  }
  if (params.establishmentId) {
    orderWhere.establishmentId = params.establishmentId;
  }

  if (params.key === "sales_by_seller") {
    return buildSalesBySeller({
      orderWhere,
      fromDt,
      toDt,
      limit,
    });
  }

  if (params.key === "sales_by_supplier") {
    return buildSalesBySupplierRows({
      orderWhere,
      fromDt,
      toDt,
      limit,
    });
  }

  return buildProfitRows({
    key: params.key,
    orderWhere,
    fromDt,
    toDt,
    limit,
  });
}

async function buildSalesBySeller(params: {
  orderWhere: Prisma.OrderWhereInput;
  fromDt: Date;
  toDt: Date;
  limit: number;
}): Promise<HomeIndicatorSummary> {
  const orders = await prisma.order.findMany({
    where: params.orderWhere,
    select: {
      id: true,
      sellerId: true,
      totalAmount: true,
      seller: { select: { user: { select: { name: true } } } },
    },
  });

  type Acc = { label: string; totalAmount: number; orderCount: number };
  const map = new Map<string, Acc>();
  let totalAmount = 0;

  for (const o of orders) {
    const amount = decToNum(o.totalAmount);
    totalAmount += amount;
    const sellerKey = o.sellerId ?? "__direct__";
    const row = map.get(sellerKey) ?? {
      label: sellerLabelOrDirect(o.seller?.user.name),
      totalAmount: 0,
      orderCount: 0,
    };
    row.totalAmount += amount;
    row.orderCount += 1;
    map.set(sellerKey, row);
  }

  const rows = [...map.entries()]
    .map(([id, r]) => ({
      id,
      label: r.label,
      value: roundMoney(r.totalAmount),
      orderCount: r.orderCount,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, params.limit);

  return {
    key: "sales_by_seller",
    generatedAt: new Date().toISOString(),
    period: {
      from: params.fromDt.toISOString(),
      to: params.toDt.toISOString(),
    },
    metric: "sales",
    totals: {
      totalAmount: roundMoney(totalAmount),
      orderCount: orders.length,
    },
    rows,
  };
}

async function buildSalesBySupplierRows(params: {
  orderWhere: Prisma.OrderWhereInput;
  fromDt: Date;
  toDt: Date;
  limit: number;
}): Promise<HomeIndicatorSummary> {
  const orders = await prisma.order.findMany({
    where: params.orderWhere,
    select: {
      id: true,
      items: {
        select: {
          quantity: true,
          unitPrice: true,
          product: {
            select: {
              supplierId: true,
              supplier: { select: { id: true, tradeName: true } },
            },
          },
        },
      },
    },
  });

  type Acc = {
    supplierId: string | null;
    label: string;
    totalAmount: number;
    orderIds: Set<string>;
  };
  const map = new Map<string, Acc>();
  let totalAmount = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const line = decToNum(item.unitPrice) * item.quantity;
      totalAmount += line;
      const supplierId = item.product.supplierId ?? null;
      const label = item.product.supplier?.tradeName ?? "Sem fornecedor";
      const key = supplierId ?? "__none__";
      const row = map.get(key) ?? {
        supplierId,
        label,
        totalAmount: 0,
        orderIds: new Set<string>(),
      };
      row.totalAmount += line;
      row.orderIds.add(order.id);
      map.set(key, row);
    }
  }

  const named = [...map.values()]
    .filter((r) => r.supplierId != null)
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const unnamed = map.get("__none__");
  const ranked =
    named.length >= params.limit
      ? named.slice(0, params.limit)
      : [...named, ...(unnamed && named.length < params.limit ? [unnamed] : [])].slice(
          0,
          params.limit,
        );

  return {
    key: "sales_by_supplier",
    generatedAt: new Date().toISOString(),
    period: {
      from: params.fromDt.toISOString(),
      to: params.toDt.toISOString(),
    },
    metric: "sales",
    totals: {
      totalAmount: roundMoney(totalAmount),
      orderCount: orders.length,
    },
    rows: ranked.map((r) => ({
      id: r.supplierId ?? "__none__",
      label: r.label,
      value: roundMoney(r.totalAmount),
      orderCount: r.orderIds.size,
    })),
  };
}

async function buildProfitRows(params: {
  key: "profit_by_city" | "profit_by_product" | "profit_by_customer";
  orderWhere: Prisma.OrderWhereInput;
  fromDt: Date;
  toDt: Date;
  limit: number;
}): Promise<HomeIndicatorSummary> {
  const orders = await prisma.order.findMany({
    where: params.orderWhere,
    select: {
      id: true,
      customerId: true,
      customer: {
        select: {
          id: true,
          name: true,
          tradeName: true,
          city: true,
          state: true,
        },
      },
      items: {
        select: {
          productId: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          product: { select: { costPrice: true } },
        },
      },
    },
  });

  type Acc = {
    label: string;
    revenue: number;
    cost: number;
    orderIds: Set<string>;
  };
  const map = new Map<string, Acc>();
  let totalRevenue = 0;
  let linesMissingCost = 0;

  for (const order of orders) {
    for (const item of order.items) {
      const revenue = decToNum(item.unitPrice) * item.quantity;
      const unitCost =
        item.product.costPrice != null
          ? decToNum(item.product.costPrice)
          : null;
      const cost = unitCost != null ? unitCost * item.quantity : 0;
      if (unitCost == null) linesMissingCost += 1;
      totalRevenue += revenue;

      let id: string;
      let label: string;
      if (params.key === "profit_by_product") {
        id = item.productId;
        label = item.productName;
      } else if (params.key === "profit_by_customer") {
        id = order.customerId ?? "__none__";
        label =
          order.customer?.tradeName?.trim() ||
          order.customer?.name?.trim() ||
          "Sem cliente";
      } else {
        const city = order.customer?.city?.trim();
        const state = order.customer?.state?.trim();
        if (!city) {
          id = "__none__";
          label = "Sem cidade";
        } else {
          id = state ? `${city}|${state}` : city;
          label = state ? `${city}/${state}` : city;
        }
      }

      const row = map.get(id) ?? {
        label,
        revenue: 0,
        cost: 0,
        orderIds: new Set<string>(),
      };
      row.revenue += revenue;
      row.cost += cost;
      row.orderIds.add(order.id);
      map.set(id, row);
    }
  }

  const rows = [...map.entries()]
    .map(([id, r]) => {
      const margin = roundMoney(r.revenue - r.cost);
      const marginPct =
        r.revenue > 0 ? roundMoney((margin / r.revenue) * 100) : 0;
      return {
        id,
        label: r.label,
        value: margin,
        secondary: marginPct,
        orderCount: r.orderIds.size,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, params.limit);

  const totalMargin = [...map.values()].reduce(
    (sum, r) => sum + (r.revenue - r.cost),
    0,
  );

  return {
    key: params.key,
    generatedAt: new Date().toISOString(),
    period: {
      from: params.fromDt.toISOString(),
      to: params.toDt.toISOString(),
    },
    metric: "profit",
    totals: {
      totalAmount: roundMoney(totalMargin),
      orderCount: orders.length,
      linesMissingCost,
    },
    rows,
  };
}
