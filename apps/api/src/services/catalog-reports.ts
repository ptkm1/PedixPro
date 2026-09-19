import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import { sellerLabelOrDirect } from "../util/order-seller-filter.js";
import { calendarMonthBounds } from "./seller-metrics.js";
import { orderCode } from "./reports/pdf-common.js";

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

/** Curva ABC de clientes por faturamento confirmado no período. */
export async function buildCustomerAbcReport(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerId?: string;
  sellerIds?: string[];
}) {
  const { start, end } = resolvePeriod(params.from, params.to);
  const where: Prisma.OrderWhereInput = {
    organizationId: params.organizationId,
    status: "CONFIRMED",
    createdAt: { gte: start, lte: end },
    customerId: { not: null },
  };
  if (params.sellerId) where.sellerId = params.sellerId;
  else if (params.sellerIds?.length) where.sellerId = { in: params.sellerIds };

  const orders = await prisma.order.findMany({
    where,
    select: {
      customerId: true,
      totalAmount: true,
      customer: { select: { name: true } },
      seller: { select: { user: { select: { name: true } } } },
    },
  });

  const byCustomer = new Map<
    string,
    {
      customerId: string;
      name: string;
      sellerName: string | null;
      orderCount: number;
      totalAmount: number;
    }
  >();

  for (const o of orders) {
    if (!o.customerId) continue;
    const row = byCustomer.get(o.customerId) ?? {
      customerId: o.customerId,
      name: o.customer?.name ?? "—",
      sellerName: sellerLabelOrDirect(o.seller?.user.name),
      orderCount: 0,
      totalAmount: 0,
    };
    row.orderCount += 1;
    row.totalAmount += decToNum(o.totalAmount);
    byCustomer.set(o.customerId, row);
  }

  const ranked = [...byCustomer.values()]
    .map((r) => ({ ...r, totalAmount: roundMoney(r.totalAmount) }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const grandTotal = ranked.reduce((s, r) => s + r.totalAmount, 0);
  let cumulative = 0;
  const rows = ranked.map((r, index) => {
    cumulative += r.totalAmount;
    const sharePct =
      grandTotal > 0 ? roundMoney((r.totalAmount / grandTotal) * 100) : 0;
    const cumulativePct =
      grandTotal > 0 ? roundMoney((cumulative / grandTotal) * 100) : 0;
    let abcClass: "A" | "B" | "C" = "C";
    if (cumulativePct <= 80 || (index === 0 && sharePct >= 80)) abcClass = "A";
    else if (cumulativePct <= 95) abcClass = "B";
    return {
      ...r,
      rank: index + 1,
      sharePct,
      cumulativePct,
      abcClass,
    };
  });

  // Reclassificar: A até 80%, B até 95%, resto C (pelo cumulado no momento da linha).
  for (const r of rows) {
    if (r.cumulativePct <= 80) r.abcClass = "A";
    else if (r.cumulativePct <= 95) r.abcClass = "B";
    else r.abcClass = "C";
  }

  const counts = { A: 0, B: 0, C: 0 };
  for (const r of rows) counts[r.abcClass] += 1;

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      customerCount: rows.length,
      totalAmount: roundMoney(grandTotal),
      classCounts: counts,
    },
    rows,
  };
}

/** Dias desde a última compra para classificar inativo recente vs antigo. */
const POSITIVACAO_RECENT_INACTIVE_DAYS = 90;
const DAY_MS = 86_400_000;

function classifyPositivacaoCategory(params: {
  createdAt: Date;
  lastPurchase: Date | null;
  boughtInPeriod: boolean;
  periodStart: Date;
  periodEnd: Date;
  recentCutoff: Date;
}): keyof {
  novos: number;
  ativos: number;
  inativosRecentes: number;
  inativosAntigos: number;
} {
  const createdInPeriod =
    params.createdAt >= params.periodStart &&
    params.createdAt <= params.periodEnd;
  if (createdInPeriod) return "novos";
  if (params.boughtInPeriod) return "ativos";
  if (params.lastPurchase && params.lastPurchase >= params.recentCutoff) {
    return "inativosRecentes";
  }
  return "inativosAntigos";
}

/** Positivação de clientes: quem comprou (e quem não) no período. */
export async function buildCustomerPositivacaoReport(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerId?: string;
  sellerIds?: string[];
}) {
  const { start, end } = resolvePeriod(params.from, params.to);
  const customerWhere: Prisma.CustomerWhereInput = {
    organizationId: params.organizationId,
    status: "ACTIVE",
    approvalStatus: "APPROVED",
  };
  if (params.sellerId) customerWhere.sellerId = params.sellerId;
  else if (params.sellerIds?.length) {
    customerWhere.sellerId = { in: params.sellerIds };
  }

  const baseWhere: Prisma.CustomerWhereInput = {
    organizationId: params.organizationId,
    approvalStatus: "APPROVED",
  };
  if (params.sellerId) baseWhere.sellerId = params.sellerId;
  else if (params.sellerIds?.length) {
    baseWhere.sellerId = { in: params.sellerIds };
  }

  const orderSellerFilter: Prisma.OrderWhereInput = {};
  if (params.sellerId) orderSellerFilter.sellerId = params.sellerId;
  else if (params.sellerIds?.length) {
    orderSellerFilter.sellerId = { in: params.sellerIds };
  }

  const [customers, portfolio, periodBuys] = await Promise.all([
    prisma.customer.findMany({
      where: customerWhere,
      select: {
        id: true,
        name: true,
        seller: { select: { user: { select: { name: true } } } },
        orders: {
          where: {
            status: "CONFIRMED",
            createdAt: { gte: start, lte: end },
          },
          select: { id: true, totalAmount: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({
      where: baseWhere,
      select: {
        id: true,
        createdAt: true,
        orders: {
          where: { status: "CONFIRMED" },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.order.findMany({
      where: {
        organizationId: params.organizationId,
        status: "CONFIRMED",
        createdAt: { gte: start, lte: end },
        customerId: { not: null },
        ...orderSellerFilter,
      },
      select: { customerId: true },
      distinct: ["customerId"],
    }),
  ]);

  const positivados = [];
  const semPositivacao = [];
  const boughtInPeriod = new Set(
    periodBuys
      .map((o) => o.customerId)
      .filter((id): id is string => typeof id === "string"),
  );

  for (const c of customers) {
    const orderCount = c.orders.length;
    const totalAmount = roundMoney(
      c.orders.reduce((s, o) => s + decToNum(o.totalAmount), 0),
    );
    const lastPurchaseAt = c.orders[0]?.createdAt.toISOString() ?? null;
    const row = {
      customerId: c.id,
      name: c.name,
      sellerName: c.seller?.user.name ?? null,
      orderCount,
      totalAmount,
      lastPurchaseAt,
    };
    if (orderCount > 0) positivados.push(row);
    else semPositivacao.push(row);
  }

  const recentCutoff = new Date(
    end.getTime() - POSITIVACAO_RECENT_INACTIVE_DAYS * DAY_MS,
  );
  const categories = {
    novos: 0,
    ativos: 0,
    inativosRecentes: 0,
    inativosAntigos: 0,
  };

  for (const c of portfolio) {
    const key = classifyPositivacaoCategory({
      createdAt: c.createdAt,
      lastPurchase: c.orders[0]?.createdAt ?? null,
      boughtInPeriod: boughtInPeriod.has(c.id),
      periodStart: start,
      periodEnd: end,
      recentCutoff,
    });
    categories[key] += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      customerCount: customers.length,
      positivados: positivados.length,
      semPositivacao: semPositivacao.length,
      positivacaoPct:
        customers.length > 0
          ? roundMoney((positivados.length / customers.length) * 100)
          : 0,
      totalAmount: roundMoney(
        positivados.reduce((s, r) => s + r.totalAmount, 0),
      ),
    },
    categories,
    positivados: positivados.sort((a, b) => b.totalAmount - a.totalAmount),
    semPositivacao,
  };
}

/** Situação da carteira agregada por vendedor (crédito em aberto). */
export async function buildPortfolioBySellerReport(params: {
  organizationId: string;
}) {
  const titles = await prisma.customerCreditTitle.findMany({
    where: { organizationId: params.organizationId, status: "OPEN" },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          creditLimit: true,
          creditBlocked: true,
          sellerId: true,
          seller: { select: { id: true, user: { select: { name: true } } } },
        },
      },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  type SellerAcc = {
    sellerId: string | null;
    sellerName: string;
    customerIds: Set<string>;
    blockedCustomerIds: Set<string>;
    overLimitCustomerIds: Set<string>;
    openBalance: number;
    overdueBalance: number;
  };

  const bySeller = new Map<string, SellerAcc>();
  const openByCustomer = new Map<
    string,
    {
      sellerKey: string;
      creditLimit: number | null;
      creditBlocked: boolean;
      openBalance: number;
    }
  >();

  for (const t of titles) {
    const open = Math.max(0, decToNum(t.amount) - decToNum(t.paidAmount));
    if (open <= 0) continue;
    const c = t.customer;
    const sellerKey = c.sellerId ?? "__none__";
    const sellerName = c.seller?.user.name ?? "Sem vendedor";

    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    const overdue = due.getTime() < today.getTime();

    const acc = bySeller.get(sellerKey) ?? {
      sellerId: c.sellerId,
      sellerName,
      customerIds: new Set<string>(),
      blockedCustomerIds: new Set<string>(),
      overLimitCustomerIds: new Set<string>(),
      openBalance: 0,
      overdueBalance: 0,
    };
    acc.customerIds.add(c.id);
    if (c.creditBlocked) acc.blockedCustomerIds.add(c.id);
    acc.openBalance += open;
    if (overdue) acc.overdueBalance += open;
    bySeller.set(sellerKey, acc);

    const cust = openByCustomer.get(c.id) ?? {
      sellerKey,
      creditLimit: c.creditLimit != null ? decToNum(c.creditLimit) : null,
      creditBlocked: c.creditBlocked,
      openBalance: 0,
    };
    cust.openBalance += open;
    openByCustomer.set(c.id, cust);
  }

  for (const [customerId, cust] of openByCustomer) {
    if (
      cust.creditLimit != null &&
      cust.openBalance > cust.creditLimit + 1e-6
    ) {
      const acc = bySeller.get(cust.sellerKey);
      if (acc) acc.overLimitCustomerIds.add(customerId);
    }
  }

  // Incluir vendedores com carteira ativa mesmo sem títulos (contagem de clientes).
  const sellers = await prisma.seller.findMany({
    where: { organizationId: params.organizationId },
    select: {
      id: true,
      user: { select: { name: true } },
      _count: { select: { customers: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  const rows: Array<{
    sellerId: string | null;
    sellerName: string;
    assignedCustomers: number;
    customersWithOpenCredit: number;
    blockedCustomers: number;
    overLimitCustomers: number;
    openBalance: number;
    overdueBalance: number;
  }> = sellers.map((s) => {
    const acc = bySeller.get(s.id);
    return {
      sellerId: s.id,
      sellerName: s.user.name,
      assignedCustomers: s._count.customers,
      customersWithOpenCredit: acc?.customerIds.size ?? 0,
      blockedCustomers: acc?.blockedCustomerIds.size ?? 0,
      overLimitCustomers: acc?.overLimitCustomerIds.size ?? 0,
      openBalance: roundMoney(acc?.openBalance ?? 0),
      overdueBalance: roundMoney(acc?.overdueBalance ?? 0),
    };
  });

  const orphan = bySeller.get("__none__");
  if (orphan) {
    rows.push({
      sellerId: null,
      sellerName: orphan.sellerName,
      assignedCustomers: orphan.customerIds.size,
      customersWithOpenCredit: orphan.customerIds.size,
      blockedCustomers: orphan.blockedCustomerIds.size,
      overLimitCustomers: orphan.overLimitCustomerIds.size,
      openBalance: roundMoney(orphan.openBalance),
      overdueBalance: roundMoney(orphan.overdueBalance),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      sellers: rows.length,
      openBalance: roundMoney(rows.reduce((s, r) => s + r.openBalance, 0)),
      overdueBalance: roundMoney(
        rows.reduce((s, r) => s + r.overdueBalance, 0),
      ),
      customersWithOpenCredit: rows.reduce(
        (s, r) => s + r.customersWithOpenCredit,
        0,
      ),
    },
    rows: rows.sort((a, b) => b.openBalance - a.openBalance),
  };
}

/** Produtos mais vendidos no período. */
export async function buildTopProductsReport(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerId?: string;
  sellerIds?: string[];
  limit?: number;
}) {
  const { start, end } = resolvePeriod(params.from, params.to);
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const orderWhere: Prisma.OrderWhereInput = {
    organizationId: params.organizationId,
    status: "CONFIRMED",
    createdAt: { gte: start, lte: end },
  };
  if (params.sellerId) orderWhere.sellerId = params.sellerId;
  else if (params.sellerIds?.length) orderWhere.sellerId = { in: params.sellerIds };

  const items = await prisma.orderItem.findMany({
    where: { order: orderWhere },
    select: {
      productId: true,
      productName: true,
      quantity: true,
      unitPrice: true,
      product: { select: { sku: true } },
    },
  });

  const map = new Map<
    string,
    {
      productId: string;
      productName: string;
      sku: string | null;
      quantity: number;
      totalAmount: number;
      orderLines: number;
    }
  >();

  for (const it of items) {
    const amount = decToNum(it.unitPrice) * it.quantity;
    const row = map.get(it.productId) ?? {
      productId: it.productId,
      productName: it.productName,
      sku: it.product.sku,
      quantity: 0,
      totalAmount: 0,
      orderLines: 0,
    };
    row.quantity += it.quantity;
    row.totalAmount += amount;
    row.orderLines += 1;
    map.set(it.productId, row);
  }

  const rows = [...map.values()]
    .map((r) => ({
      ...r,
      totalAmount: roundMoney(r.totalAmount),
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount || b.quantity - a.quantity)
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      productCount: map.size,
      shown: rows.length,
      totalAmount: roundMoney(rows.reduce((s, r) => s + r.totalAmount, 0)),
      totalQuantity: rows.reduce((s, r) => s + r.quantity, 0),
    },
    rows,
  };
}

/** Positivação de produtos por cliente (quais SKUs cada cliente comprou). */
export async function buildProductPositivacaoByCustomerReport(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerId?: string;
  sellerIds?: string[];
  customerId?: string;
  limit?: number;
}) {
  const { start, end } = resolvePeriod(params.from, params.to);
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 2000);
  const orderWhere: Prisma.OrderWhereInput = {
    organizationId: params.organizationId,
    status: "CONFIRMED",
    createdAt: { gte: start, lte: end },
    customerId: { not: null },
  };
  if (params.sellerId) orderWhere.sellerId = params.sellerId;
  else if (params.sellerIds?.length) orderWhere.sellerId = { in: params.sellerIds };
  if (params.customerId) orderWhere.customerId = params.customerId;

  const items = await prisma.orderItem.findMany({
    where: { order: orderWhere },
    select: {
      productId: true,
      productName: true,
      quantity: true,
      unitPrice: true,
      product: { select: { sku: true } },
      order: {
        select: {
          customerId: true,
          customer: { select: { name: true } },
          seller: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  const map = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      sellerName: string | null;
      productId: string;
      productName: string;
      sku: string | null;
      quantity: number;
      totalAmount: number;
      orderLines: number;
    }
  >();

  for (const it of items) {
    const customerId = it.order.customerId;
    if (!customerId) continue;
    const key = `${customerId}:${it.productId}`;
    const row = map.get(key) ?? {
      customerId,
      customerName: it.order.customer?.name ?? "—",
      sellerName: sellerLabelOrDirect(it.order.seller?.user.name),
      productId: it.productId,
      productName: it.productName,
      sku: it.product.sku,
      quantity: 0,
      totalAmount: 0,
      orderLines: 0,
    };
    row.quantity += it.quantity;
    row.totalAmount += decToNum(it.unitPrice) * it.quantity;
    row.orderLines += 1;
    map.set(key, row);
  }

  const rows = [...map.values()]
    .map((r) => ({ ...r, totalAmount: roundMoney(r.totalAmount) }))
    .sort(
      (a, b) =>
        a.customerName.localeCompare(b.customerName, "pt-BR") ||
        b.totalAmount - a.totalAmount,
    )
    .slice(0, limit);

  const distinctCustomers = new Set(rows.map((r) => r.customerId)).size;
  const distinctProducts = new Set(rows.map((r) => r.productId)).size;

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      rowCount: rows.length,
      customerCount: distinctCustomers,
      productCount: distinctProducts,
      totalAmount: roundMoney(rows.reduce((s, r) => s + r.totalAmount, 0)),
    },
    rows,
  };
}

/** Comissões por pedido (soma das linhas). */
export async function buildCommissionByOrderReport(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerId?: string;
}) {
  const { start, end } = resolvePeriod(params.from, params.to);
  const where: Prisma.OrderWhereInput = {
    organizationId: params.organizationId,
    status: "CONFIRMED",
    createdAt: { gte: start, lte: end },
  };
  if (params.sellerId) where.sellerId = params.sellerId;

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      createdAt: true,
      seller: { select: { user: { select: { name: true } } } },
      customer: { select: { name: true } },
      priceTable: { select: { id: true, name: true } },
      items: {
        select: {
          productName: true,
          commissionAmount: true,
          commissionPercent: true,
          commissionOrigin: true,
        },
      },
    },
  });

  const rows = orders.map((o) => {
    const commission = roundMoney(
      o.items.reduce((s, it) => s + decToNum(it.commissionAmount ?? 0), 0),
    );
    const revenue = roundMoney(decToNum(o.totalAmount));
    const origins = [
      ...new Set(
        o.items
          .map((it) => it.commissionOrigin)
          .filter((v): v is NonNullable<typeof v> => Boolean(v)),
      ),
    ];
    return {
      orderId: o.id,
      orderCode: orderCode(o),
      createdAt: o.createdAt.toISOString(),
      sellerName: sellerLabelOrDirect(o.seller?.user.name),
      customerName: o.customer?.name ?? "—",
      priceTableName: o.priceTable?.name ?? null,
      revenue,
      commission,
      commissionPct:
        revenue > 0 ? roundMoney((commission / revenue) * 100) : 0,
      commissionOrigin:
        origins.length === 1 ? origins[0] : origins.length > 1 ? "VARIAS" : null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      orderCount: rows.length,
      revenue: roundMoney(rows.reduce((s, r) => s + r.revenue, 0)),
      commission: roundMoney(rows.reduce((s, r) => s + r.commission, 0)),
    },
    rows,
  };
}

/** Pedidos com NF-e de saída autorizada (faturados). */
export async function buildInvoicedOrdersReport(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerId?: string;
}) {
  const { start, end } = resolvePeriod(params.from, params.to);
  const invoices = await prisma.fiscalInvoice.findMany({
    where: {
      organizationId: params.organizationId,
      direction: "OUTBOUND",
      status: "AUTHORIZED",
      issuedAt: { gte: start, lte: end },
      ...(params.sellerId
        ? { order: { sellerId: params.sellerId } }
        : {}),
    },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      number: true,
      series: true,
      accessKey: true,
      totalAmount: true,
      issuedAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          totalAmount: true,
          seller: { select: { user: { select: { name: true } } } },
          customer: { select: { name: true, tradeName: true } },
        },
      },
    },
  });

  const rows = invoices.map((inv) => ({
    invoiceId: inv.id,
    nfeNumber: inv.number,
    nfeSeries: inv.series,
    accessKey: inv.accessKey,
    issuedAt: inv.issuedAt?.toISOString() ?? null,
    invoiceAmount: roundMoney(decToNum(inv.totalAmount)),
    orderId: inv.order?.id ?? null,
    orderCode: inv.order ? orderCode(inv.order) : "—",
    orderCreatedAt: inv.order?.createdAt.toISOString() ?? null,
    orderAmount: inv.order
      ? roundMoney(decToNum(inv.order.totalAmount))
      : null,
    sellerName: inv.order
      ? sellerLabelOrDirect(inv.order.seller?.user.name)
      : "—",
    customerName:
      inv.order?.customer?.tradeName ||
      inv.order?.customer?.name ||
      "—",
  }));

  return {
    generatedAt: new Date().toISOString(),
    period: { from: start.toISOString(), to: end.toISOString() },
    totals: {
      invoiceCount: rows.length,
      invoiceAmount: roundMoney(
        rows.reduce((s, r) => s + r.invoiceAmount, 0),
      ),
    },
    rows,
  };
}
