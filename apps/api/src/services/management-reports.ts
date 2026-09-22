import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import { sellerLabelOrDirect } from "../util/order-seller-filter.js";
import { calendarMonthBounds } from "./seller-metrics.js";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseOptionalDate(raw: string | undefined): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function resolvePeriod(from?: string, to?: string): { start: Date; end: Date } {
  const fromDt = parseOptionalDate(from);
  const toDt = parseOptionalDate(to);
  if (fromDt && toDt) return { start: fromDt, end: toDt };
  if (fromDt && !toDt) return { start: fromDt, end: new Date() };
  if (!fromDt && toDt) {
    const start = new Date(toDt);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end: toDt };
  }
  const m = calendarMonthBounds(new Date());
  return { start: m.start, end: m.end };
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 1. Scorecard de vendas do período */
export async function buildSalesScorecard(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerIds?: string[];
}) {
  const { start, end } = resolvePeriod(params.from, params.to);
  const where: Prisma.OrderWhereInput = {
    organizationId: params.organizationId,
    status: "CONFIRMED",
    createdAt: { gte: start, lte: end },
  };
  if (params.sellerIds?.length) where.sellerId = { in: params.sellerIds };

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      sellerId: true,
      totalAmount: true,
      createdAt: true,
      seller: {
        select: {
          user: { select: { name: true } },
          team: { select: { id: true, name: true } },
        },
      },
      items: {
        select: {
          productId: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          product: {
            select: {
              supplierId: true,
              supplier: { select: { tradeName: true, legalName: true } },
            },
          },
        },
      },
    },
  });

  const bySeller = new Map<
    string,
    { name: string; orderCount: number; totalAmount: number }
  >();
  const byTeam = new Map<
    string,
    {
      teamId: string;
      teamName: string;
      orderCount: number;
      totalAmount: number;
    }
  >();
  const byDay = new Map<string, { orderCount: number; totalAmount: number }>();
  const bySupplier = new Map<
    string,
    {
      supplierId: string | null;
      name: string;
      orderIds: Set<string>;
      totalAmount: number;
    }
  >();
  const byProduct = new Map<
    string,
    {
      name: string;
      quantity: number;
      orderIds: Set<string>;
      totalAmount: number;
    }
  >();

  let totalAmount = 0;
  for (const o of orders) {
    const amount = decToNum(o.totalAmount);
    totalAmount += amount;

    const sellerKey = o.sellerId ?? "__direct__";
    const s = bySeller.get(sellerKey) ?? {
      name: sellerLabelOrDirect(o.seller?.user.name),
      orderCount: 0,
      totalAmount: 0,
    };
    s.orderCount += 1;
    s.totalAmount += amount;
    bySeller.set(sellerKey, s);

    const team = o.seller?.team;
    if (team) {
      const t = byTeam.get(team.id) ?? {
        teamId: team.id,
        teamName: team.name,
        orderCount: 0,
        totalAmount: 0,
      };
      t.orderCount += 1;
      t.totalAmount += amount;
      byTeam.set(team.id, t);
    }

    const dk = dayKey(o.createdAt);
    const day = byDay.get(dk) ?? { orderCount: 0, totalAmount: 0 };
    day.orderCount += 1;
    day.totalAmount += amount;
    byDay.set(dk, day);

    for (const it of o.items) {
      const lineTotal = decToNum(it.unitPrice) * it.quantity;

      const supplierKey = it.product.supplierId ?? "__none__";
      const supplierName =
        it.product.supplier?.tradeName ??
        it.product.supplier?.legalName ??
        "Sem fornecedor";
      const sup = bySupplier.get(supplierKey) ?? {
        supplierId: it.product.supplierId ?? null,
        name: supplierName,
        orderIds: new Set<string>(),
        totalAmount: 0,
      };
      sup.orderIds.add(o.id);
      sup.totalAmount += lineTotal;
      bySupplier.set(supplierKey, sup);

      const prod = byProduct.get(it.productId) ?? {
        name: it.productName,
        quantity: 0,
        orderIds: new Set<string>(),
        totalAmount: 0,
      };
      prod.quantity += it.quantity;
      prod.orderIds.add(o.id);
      prod.totalAmount += lineTotal;
      byProduct.set(it.productId, prod);
    }
  }

  const orderCount = orders.length;
  const avgTicket = orderCount ? roundMoney(totalAmount / orderCount) : 0;

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      orderCount,
      totalAmount: roundMoney(totalAmount),
      avgTicket,
    },
    bySeller: [...bySeller.entries()]
      .map(([sellerId, r]) => ({
        sellerId,
        name: r.name,
        orderCount: r.orderCount,
        totalAmount: roundMoney(r.totalAmount),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount),
    byTeam: [...byTeam.values()]
      .map((t) => ({
        ...t,
        totalAmount: roundMoney(t.totalAmount),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount),
    bySupplier: [...bySupplier.values()]
      .map((r) => ({
        supplierId: r.supplierId,
        name: r.name,
        orderCount: r.orderIds.size,
        totalAmount: roundMoney(r.totalAmount),
      }))
      .sort((a, b) => {
        if (a.supplierId == null) return 1;
        if (b.supplierId == null) return -1;
        return b.totalAmount - a.totalAmount;
      }),
    byProduct: [...byProduct.entries()]
      .map(([productId, r]) => ({
        productId,
        name: r.name,
        quantity: r.quantity,
        orderCount: r.orderIds.size,
        totalAmount: roundMoney(r.totalAmount),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount),
    daily: [...byDay.entries()]
      .map(([date, r]) => ({
        date,
        orderCount: r.orderCount,
        totalAmount: roundMoney(r.totalAmount),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** 2. Margem por produto / fornecedor / vendedor */
export async function buildMarginReport(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerIds?: string[];
}) {
  const { start, end } = resolvePeriod(params.from, params.to);
  const where: Prisma.OrderWhereInput = {
    organizationId: params.organizationId,
    status: "CONFIRMED",
    createdAt: { gte: start, lte: end },
  };
  if (params.sellerIds?.length) where.sellerId = { in: params.sellerIds };

  const orders = await prisma.order.findMany({
    where,
    select: {
      sellerId: true,
      seller: { select: { user: { select: { name: true } } } },
      items: {
        select: {
          productId: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          product: {
            select: {
              costPrice: true,
              categoryId: true,
              category: { select: { name: true } },
              supplierId: true,
              supplier: { select: { tradeName: true, legalName: true } },
            },
          },
        },
      },
    },
  });

  type Acc = {
    revenue: number;
    cost: number;
    quantity: number;
    label: string;
  };

  const byProduct = new Map<string, Acc>();
  const bySupplier = new Map<string, Acc>();
  const bySeller = new Map<string, Acc>();
  const byCategory = new Map<string, Acc>();

  let totalRevenue = 0;
  let totalCost = 0;
  let linesMissingCost = 0;

  for (const o of orders) {
    for (const it of o.items) {
      const revenue = decToNum(it.unitPrice) * it.quantity;
      const unitCost =
        it.product.costPrice != null ? decToNum(it.product.costPrice) : null;
      const cost = unitCost != null ? unitCost * it.quantity : 0;
      if (unitCost == null) linesMissingCost += 1;

      totalRevenue += revenue;
      totalCost += cost;

      const prod = byProduct.get(it.productId) ?? {
        revenue: 0,
        cost: 0,
        quantity: 0,
        label: it.productName,
      };
      prod.revenue += revenue;
      prod.cost += cost;
      prod.quantity += it.quantity;
      byProduct.set(it.productId, prod);

      const supplierKey = it.product.supplierId ?? "_none";
      const supplierLabel =
        it.product.supplier?.tradeName ??
        it.product.supplier?.legalName ??
        "Sem fornecedor";
      const sup = bySupplier.get(supplierKey) ?? {
        revenue: 0,
        cost: 0,
        quantity: 0,
        label: supplierLabel,
      };
      sup.revenue += revenue;
      sup.cost += cost;
      sup.quantity += it.quantity;
      bySupplier.set(supplierKey, sup);

      const sellerKey = o.sellerId ?? "__direct__";
      const sellerAcc = bySeller.get(sellerKey) ?? {
        revenue: 0,
        cost: 0,
        quantity: 0,
        label: sellerLabelOrDirect(o.seller?.user.name),
      };
      sellerAcc.revenue += revenue;
      sellerAcc.cost += cost;
      sellerAcc.quantity += it.quantity;
      bySeller.set(sellerKey, sellerAcc);

      const catKey = it.product.categoryId ?? "_none";
      const catLabel = it.product.category?.name ?? "Sem categoria";
      const cat = byCategory.get(catKey) ?? {
        revenue: 0,
        cost: 0,
        quantity: 0,
        label: catLabel,
      };
      cat.revenue += revenue;
      cat.cost += cost;
      cat.quantity += it.quantity;
      byCategory.set(catKey, cat);
    }
  }

  function mapRows(m: Map<string, Acc>) {
    return [...m.entries()]
      .map(([id, r]) => {
        const margin = roundMoney(r.revenue - r.cost);
        const marginPct =
          r.revenue > 0 ? roundMoney((margin / r.revenue) * 100) : 0;
        return {
          id,
          label: r.label,
          quantity: r.quantity,
          revenue: roundMoney(r.revenue),
          cost: roundMoney(r.cost),
          margin,
          marginPct,
        };
      })
      .sort((a, b) => b.margin - a.margin);
  }

  const margin = roundMoney(totalRevenue - totalCost);
  const marginPct =
    totalRevenue > 0 ? roundMoney((margin / totalRevenue) * 100) : 0;

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      revenue: roundMoney(totalRevenue),
      cost: roundMoney(totalCost),
      margin,
      marginPct,
      linesMissingCost,
    },
    byProduct: mapRows(byProduct).slice(0, 50),
    bySupplier: mapRows(bySupplier),
    bySeller: mapRows(bySeller),
    byCategory: mapRows(byCategory),
  };
}

/** 3. Comissão consolidada admin (mês civil) */
export async function buildCommissionStatement(params: {
  organizationId: string;
  year?: number;
  month?: number;
}) {
  const ref = new Date();
  const year = params.year ?? ref.getFullYear();
  const month = params.month ?? ref.getMonth() + 1;
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const sellers = await prisma.seller.findMany({
    where: { organizationId: params.organizationId },
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const goals = await prisma.sellerMonthlyGoal.findMany({
    where: { organizationId: params.organizationId, year, month },
  });
  const sellerGoal = new Map(
    goals
      .filter((g) => g.scope === "SELLER" && g.sellerId)
      .map((g) => [g.sellerId!, g]),
  );
  const teamGoal = new Map(
    goals
      .filter((g) => g.scope === "TEAM" && g.teamId)
      .map((g) => [g.teamId!, g]),
  );
  const allGoal = goals.find((g) => g.scope === "ALL") ?? null;

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        organizationId: params.organizationId,
        status: "CONFIRMED",
        createdAt: { gte: start, lte: end },
      },
    },
    select: {
      commissionAmount: true,
      quantity: true,
      unitPrice: true,
      order: { select: { sellerId: true } },
    },
  });

  const agg = new Map<
    string,
    { revenue: number; commission: number; orderIds: Set<string> }
  >();
  // Re-query orders for counts
  const orders = await prisma.order.findMany({
    where: {
      organizationId: params.organizationId,
      status: "CONFIRMED",
      createdAt: { gte: start, lte: end },
    },
    select: { id: true, sellerId: true, totalAmount: true },
  });

  for (const o of orders) {
    if (!o.sellerId) continue;
    const row = agg.get(o.sellerId) ?? {
      revenue: 0,
      commission: 0,
      orderIds: new Set<string>(),
    };
    row.revenue += decToNum(o.totalAmount);
    row.orderIds.add(o.id);
    agg.set(o.sellerId, row);
  }
  for (const it of items) {
    const sid = it.order.sellerId;
    if (!sid) continue;
    const row = agg.get(sid) ?? {
      revenue: 0,
      commission: 0,
      orderIds: new Set<string>(),
    };
    row.commission += decToNum(it.commissionAmount ?? 0);
    agg.set(sid, row);
  }

  const sellersWithTeam = await prisma.seller.findMany({
    where: { organizationId: params.organizationId },
    select: { id: true, teamId: true },
  });
  const teamIdBySeller = new Map(sellersWithTeam.map((s) => [s.id, s.teamId]));

  const teamRevenue = new Map<string, number>();
  let orgRevenue = 0;
  for (const s of sellers) {
    const rev = roundMoney(agg.get(s.id)?.revenue ?? 0);
    orgRevenue = roundMoney(orgRevenue + rev);
    const tid = teamIdBySeller.get(s.id);
    if (tid) {
      teamRevenue.set(tid, roundMoney((teamRevenue.get(tid) ?? 0) + rev));
    }
  }

  const rows = sellers
    .map((s) => {
      const a = agg.get(s.id);
      const revenue = roundMoney(a?.revenue ?? 0);
      const commission = roundMoney(a?.commission ?? 0);
      const tid = teamIdBySeller.get(s.id);
      const goal =
        sellerGoal.get(s.id) ??
        (tid ? teamGoal.get(tid) : undefined) ??
        allGoal;
      const target = goal ? decToNum(goal.targetAmount) : null;
      let achieved = revenue;
      if (goal?.scope === "TEAM" && tid) {
        achieved = teamRevenue.get(tid) ?? 0;
      } else if (goal?.scope === "ALL") {
        achieved = orgRevenue;
      }
      const goalPct =
        target != null && target > 0
          ? roundMoney((achieved / target) * 100)
          : null;
      return {
        sellerId: s.id,
        name: s.user.name,
        orderCount: a?.orderIds.size ?? 0,
        revenue,
        commission,
        goalTarget: target != null ? roundMoney(target) : null,
        goalPct,
        goalScope: goal?.scope ?? null,
      };
    })
    .filter((r) => r.orderCount > 0 || r.commission > 0 || r.goalTarget != null)
    .sort((a, b) => b.commission - a.commission);

  return {
    generatedAt: new Date().toISOString(),
    period: { year, month, from: start.toISOString(), to: end.toISOString() },
    totals: {
      revenue: roundMoney(rows.reduce((s, r) => s + r.revenue, 0)),
      commission: roundMoney(rows.reduce((s, r) => s + r.commission, 0)),
      sellersWithSales: rows.filter((r) => r.orderCount > 0).length,
    },
    bySeller: rows,
  };
}

/** 4. Saúde de estoque */
export async function buildStockHealthReport(organizationId: string) {
  const products = await prisma.product.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      sku: true,
      stockQty: true,
      minStockQty: true,
      maxStockQty: true,
      costPrice: true,
      productStock: { select: { quantityOnHand: true } },
      orderItems: {
        where: { order: { status: "CONFIRMED" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const now = Date.now();
  const stagnantDays = 30;
  const belowMin: Array<Record<string, unknown>> = [];
  const aboveMax: Array<Record<string, unknown>> = [];
  const stagnantWithStock: Array<Record<string, unknown>> = [];
  let valuation = 0;

  for (const p of products) {
    const qty =
      p.productStock != null
        ? Number(p.productStock.quantityOnHand)
        : p.stockQty;
    const cost = p.costPrice != null ? decToNum(p.costPrice) : 0;
    valuation += qty * cost;

    const lastSale = p.orderItems[0]?.createdAt ?? null;
    const daysSince = lastSale
      ? Math.floor((now - lastSale.getTime()) / 86_400_000)
      : null;
    const neverSold = !lastSale;

    if (p.minStockQty > 0 && qty < p.minStockQty) {
      belowMin.push({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        quantity: qty,
        minStockQty: p.minStockQty,
        deficit: roundMoney(p.minStockQty - qty),
      });
    }
    if (p.maxStockQty != null && qty > p.maxStockQty) {
      aboveMax.push({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        quantity: qty,
        maxStockQty: p.maxStockQty,
        excess: roundMoney(qty - p.maxStockQty),
      });
    }
    if (
      qty > 0 &&
      (neverSold || (daysSince != null && daysSince >= stagnantDays))
    ) {
      stagnantWithStock.push({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        quantity: qty,
        daysSinceLastSale: daysSince,
        neverSold,
        approxValue: roundMoney(qty * cost),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      productCount: products.length,
      belowMinCount: belowMin.length,
      aboveMaxCount: aboveMax.length,
      stagnantWithStockCount: stagnantWithStock.length,
      approxValuation: roundMoney(valuation),
    },
    belowMin: belowMin.sort((a, b) => Number(b.deficit) - Number(a.deficit)),
    aboveMax: aboveMax.sort((a, b) => Number(b.excess) - Number(a.excess)),
    stagnantWithStock: stagnantWithStock.sort(
      (a, b) => Number(b.approxValue) - Number(a.approxValue),
    ),
  };
}

/** 5. Aging de crédito */
export async function buildCreditAgingReport(organizationId: string) {
  const titles = await prisma.customerCreditTitle.findMany({
    where: { organizationId, status: "OPEN" },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          creditLimit: true,
          creditBlocked: true,
          seller: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  type BucketKey = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";
  const buckets: Record<BucketKey, number> = {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90_plus: 0,
  };

  type CustomerAcc = {
    customerId: string;
    name: string;
    sellerName: string | null;
    creditLimit: number | null;
    creditBlocked: boolean;
    openBalance: number;
    buckets: Record<BucketKey, number>;
  };
  const byCustomer = new Map<string, CustomerAcc>();

  for (const t of titles) {
    const open = Math.max(0, decToNum(t.amount) - decToNum(t.paidAmount));
    if (open <= 0) continue;
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    const daysOverdue = Math.floor(
      (today.getTime() - due.getTime()) / 86_400_000,
    );

    let key: BucketKey = "current";
    if (daysOverdue >= 91) key = "d90_plus";
    else if (daysOverdue >= 61) key = "d61_90";
    else if (daysOverdue >= 31) key = "d31_60";
    else if (daysOverdue >= 1) key = "d1_30";

    buckets[key] += open;

    const c = t.customer;
    const acc = byCustomer.get(c.id) ?? {
      customerId: c.id,
      name: c.name,
      sellerName: c.seller?.user.name ?? null,
      creditLimit: c.creditLimit != null ? decToNum(c.creditLimit) : null,
      creditBlocked: c.creditBlocked,
      openBalance: 0,
      buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
    };
    acc.openBalance += open;
    acc.buckets[key] += open;
    byCustomer.set(c.id, acc);
  }

  const customers = [...byCustomer.values()]
    .map((c) => ({
      ...c,
      openBalance: roundMoney(c.openBalance),
      buckets: {
        current: roundMoney(c.buckets.current),
        d1_30: roundMoney(c.buckets.d1_30),
        d31_60: roundMoney(c.buckets.d31_60),
        d61_90: roundMoney(c.buckets.d61_90),
        d90_plus: roundMoney(c.buckets.d90_plus),
      },
      limitUtilizationPct:
        c.creditLimit != null && c.creditLimit > 0
          ? roundMoney((c.openBalance / c.creditLimit) * 100)
          : null,
      overLimit:
        c.creditLimit != null ? c.openBalance > c.creditLimit + 1e-6 : false,
    }))
    .sort((a, b) => b.openBalance - a.openBalance);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      openTitles: titles.length,
      openBalance: roundMoney(
        Object.values(buckets).reduce((s, n) => s + n, 0),
      ),
      buckets: {
        current: roundMoney(buckets.current),
        d1_30: roundMoney(buckets.d1_30),
        d31_60: roundMoney(buckets.d31_60),
        d61_90: roundMoney(buckets.d61_90),
        d90_plus: roundMoney(buckets.d90_plus),
      },
      blockedCustomers: customers.filter((c) => c.creditBlocked).length,
      overLimitCustomers: customers.filter((c) => c.overLimit).length,
    },
    customers,
  };
}

/** 6. Conciliação NF-e × vendas */
export async function buildFiscalReconciliation(params: {
  organizationId: string;
  from?: string;
  to?: string;
}) {
  const { start, end } = resolvePeriod(params.from, params.to);

  const confirmedOrders = await prisma.order.findMany({
    where: {
      organizationId: params.organizationId,
      status: "CONFIRMED",
      createdAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      totalAmount: true,
      createdAt: true,
      customer: { select: { name: true } },
      seller: { select: { user: { select: { name: true } } } },
      fiscalInvoices: {
        where: { direction: "OUTBOUND" },
        select: {
          id: true,
          status: true,
          number: true,
          series: true,
          totalAmount: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const withoutNfe: Array<Record<string, unknown>> = [];
  const rejected: Array<Record<string, unknown>> = [];
  let commercialTotal = 0;
  let authorizedCount = 0;

  for (const o of confirmedOrders) {
    commercialTotal += decToNum(o.totalAmount);
    const inv = o.fiscalInvoices[0];
    if (!inv) {
      withoutNfe.push({
        orderId: o.id,
        createdAt: o.createdAt.toISOString(),
        customerName: o.customer?.name ?? "—",
        sellerName: sellerLabelOrDirect(o.seller?.user.name),
        totalAmount: roundMoney(decToNum(o.totalAmount)),
      });
      continue;
    }
    if (inv.status === "AUTHORIZED") authorizedCount += 1;
    if (inv.status === "REJECTED" || inv.status === "CANCELLED") {
      rejected.push({
        orderId: o.id,
        invoiceId: inv.id,
        status: inv.status,
        number: inv.number,
        series: inv.series,
        customerName: o.customer?.name ?? "—",
        totalAmount: roundMoney(decToNum(o.totalAmount)),
      });
    }
  }

  const outbound = await prisma.fiscalInvoice.aggregate({
    where: {
      organizationId: params.organizationId,
      direction: "OUTBOUND",
      status: "AUTHORIZED",
      issuedAt: { gte: start, lte: end },
    },
    _sum: { totalAmount: true },
    _count: true,
  });

  const inbound = await prisma.fiscalInvoice.aggregate({
    where: {
      organizationId: params.organizationId,
      direction: "INBOUND",
      status: { in: ["IMPORTED", "AUTHORIZED"] },
      OR: [
        { issuedAt: { gte: start, lte: end } },
        { issuedAt: null, createdAt: { gte: start, lte: end } },
      ],
    },
    _sum: { totalAmount: true },
    _count: true,
  });

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      confirmedOrders: confirmedOrders.length,
      commercialTotal: roundMoney(commercialTotal),
      ordersWithoutNfe: withoutNfe.length,
      ordersWithAuthorizedNfe: authorizedCount,
      outboundAuthorizedCount: outbound._count,
      outboundAuthorizedTotal: roundMoney(
        decToNum(outbound._sum.totalAmount ?? 0),
      ),
      inboundCount: inbound._count,
      inboundTotal: roundMoney(decToNum(inbound._sum.totalAmount ?? 0)),
    },
    ordersWithoutNfe: withoutNfe,
    rejectedOrCancelled: rejected,
  };
}

/** Resumo operacional NF-e de saída (fila, rejeições, status). */
export async function buildFiscalOutboundSummary(params: {
  organizationId: string;
  from?: string;
  to?: string;
}) {
  const { start, end } = resolvePeriod(params.from, params.to);
  const orgId = params.organizationId;

  const [
    drafts,
    authorized,
    rejected,
    transmitted,
    queuedPending,
    queuedFailed,
    recentRejected,
  ] = await Promise.all([
    prisma.fiscalInvoice.count({
      where: {
        organizationId: orgId,
        direction: "OUTBOUND",
        status: "DRAFT",
        createdAt: { gte: start, lte: end },
      },
    }),
    prisma.fiscalInvoice.count({
      where: {
        organizationId: orgId,
        direction: "OUTBOUND",
        status: "AUTHORIZED",
        issuedAt: { gte: start, lte: end },
      },
    }),
    prisma.fiscalInvoice.count({
      where: {
        organizationId: orgId,
        direction: "OUTBOUND",
        status: "REJECTED",
        createdAt: { gte: start, lte: end },
      },
    }),
    prisma.fiscalInvoice.count({
      where: {
        organizationId: orgId,
        direction: "OUTBOUND",
        status: "TRANSMITTED",
      },
    }),
    prisma.fiscalTransmitJob.count({
      where: {
        organizationId: orgId,
        status: { in: ["PENDING", "RUNNING"] },
      },
    }),
    prisma.fiscalTransmitJob.count({
      where: { organizationId: orgId, status: "FAILED" },
    }),
    prisma.fiscalInvoice.findMany({
      where: {
        organizationId: orgId,
        direction: "OUTBOUND",
        status: "REJECTED",
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        number: true,
        series: true,
        rejectionReason: true,
        updatedAt: true,
        order: {
          select: {
            orderNumber: true,
            customer: { select: { name: true, tradeName: true } },
          },
        },
      },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    counts: {
      drafts,
      authorized,
      rejected,
      transmitted,
      queuePending: queuedPending,
      queueFailed: queuedFailed,
    },
    recentRejected: recentRejected.map((r) => ({
      id: r.id,
      number: r.number,
      series: r.series,
      rejectionReason: r.rejectionReason,
      updatedAt: r.updatedAt.toISOString(),
      orderNumber: r.order?.orderNumber ?? null,
      customerName:
        r.order?.customer?.tradeName || r.order?.customer?.name || "—",
    })),
  };
}

/** 7. Efetividade de visitas */
export async function buildVisitEffectiveness(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerIds?: string[];
  /** Janela em dias após a visita para considerar venda convertida */
  conversionWindowDays?: number;
}) {
  const { start, end } = resolvePeriod(params.from, params.to);
  const windowDays = params.conversionWindowDays ?? 1;

  const visitWhere: Prisma.SellerCustomerVisitWhereInput = {
    organizationId: params.organizationId,
    checkedInAt: { gte: start, lte: end },
  };
  if (params.sellerIds?.length) visitWhere.sellerId = { in: params.sellerIds };

  const visits = await prisma.sellerCustomerVisit.findMany({
    where: visitWhere,
    select: {
      id: true,
      sellerId: true,
      customerId: true,
      checkedInAt: true,
      seller: { select: { user: { select: { name: true } } } },
      customer: { select: { name: true } },
    },
  });

  const orders = await prisma.order.findMany({
    where: {
      organizationId: params.organizationId,
      status: "CONFIRMED",
      customerId: { not: null },
      createdAt: {
        gte: start,
        lte: new Date(end.getTime() + windowDays * 86_400_000),
      },
      ...(params.sellerIds?.length
        ? { sellerId: { in: params.sellerIds } }
        : {}),
    },
    select: {
      id: true,
      sellerId: true,
      customerId: true,
      createdAt: true,
      totalAmount: true,
    },
  });

  // Index orders by seller+customer
  const ordersByPair = new Map<string, typeof orders>();
  for (const o of orders) {
    if (!o.customerId) continue;
    const key = `${o.sellerId}:${o.customerId}`;
    const list = ordersByPair.get(key) ?? [];
    list.push(o);
    ordersByPair.set(key, list);
  }

  let converted = 0;
  let convertedAmount = 0;
  const bySeller = new Map<
    string,
    { name: string; visits: number; converted: number; revenue: number }
  >();
  const withoutSale: Array<{
    visitId: string;
    sellerName: string;
    customerName: string;
    checkedInAt: string;
  }> = [];

  for (const v of visits) {
    const sellerRow = bySeller.get(v.sellerId) ?? {
      name: v.seller.user.name,
      visits: 0,
      converted: 0,
      revenue: 0,
    };
    sellerRow.visits += 1;

    const key = `${v.sellerId}:${v.customerId}`;
    const candidates = ordersByPair.get(key) ?? [];
    const visitDayStart = new Date(v.checkedInAt);
    visitDayStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(
      visitDayStart.getTime() + windowDays * 86_400_000 + 86_400_000 - 1,
    );

    const match = candidates.find(
      (o) => o.createdAt >= visitDayStart && o.createdAt <= windowEnd,
    );
    if (match) {
      converted += 1;
      convertedAmount += decToNum(match.totalAmount);
      sellerRow.converted += 1;
      sellerRow.revenue += decToNum(match.totalAmount);
    } else {
      withoutSale.push({
        visitId: v.id,
        sellerName: v.seller.user.name,
        customerName: v.customer.name,
        checkedInAt: v.checkedInAt.toISOString(),
      });
    }
    bySeller.set(v.sellerId, sellerRow);
  }

  // Cobertura: clientes na carteira visitados no período
  const assignedCustomers = await prisma.customer.count({
    where: {
      organizationId: params.organizationId,
      sellerId: params.sellerIds?.length
        ? { in: params.sellerIds }
        : { not: null },
    },
  });
  const visitedCustomerIds = new Set(visits.map((v) => v.customerId));

  const conversionRate =
    visits.length > 0 ? roundMoney((converted / visits.length) * 100) : 0;
  const coveragePct =
    assignedCustomers > 0
      ? roundMoney((visitedCustomerIds.size / assignedCustomers) * 100)
      : 0;

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    conversionWindowDays: windowDays,
    totals: {
      visits: visits.length,
      converted,
      conversionRate,
      convertedAmount: roundMoney(convertedAmount),
      assignedCustomers,
      visitedCustomers: visitedCustomerIds.size,
      coveragePct,
    },
    bySeller: [...bySeller.entries()]
      .map(([sellerId, r]) => ({
        sellerId,
        name: r.name,
        visits: r.visits,
        converted: r.converted,
        conversionRate:
          r.visits > 0 ? roundMoney((r.converted / r.visits) * 100) : 0,
        revenue: roundMoney(r.revenue),
      }))
      .sort((a, b) => b.converted - a.converted),
    visitsWithoutSale: withoutSale.slice(0, 50),
  };
}
