import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import { sellerLabelOrDirect } from "../util/order-seller-filter.js";
import {
  COLORS,
  drawHeader,
  drawTableHeader,
  drawTableRow,
  ensureSpace,
  money,
  PAGE,
  withPdfDoc,
  type PdfTable,
} from "./reports/pdf-common.js";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Brasil sem horário de verão desde 2019: 00:00 BRT = 03:00 UTC. */
const REPORT_TZ = "America/Sao_Paulo";

type CivilDate = { y: number; m: number; day: number };

function civilInSaoPaulo(d: Date): CivilDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { y: num("year"), m: num("month"), day: num("day") };
}

function startOfSaoPauloDay(y: number, month1: number, day: number): Date {
  return new Date(Date.UTC(y, month1 - 1, day, 3, 0, 0, 0));
}

function endOfSaoPauloDay(y: number, month1: number, day: number): Date {
  return new Date(Date.UTC(y, month1 - 1, day + 1, 2, 59, 59, 999));
}

function daysInMonth(y: number, month1: number): number {
  return new Date(Date.UTC(y, month1, 0)).getUTCDate();
}

function civilDayKey(c: CivilDate): string {
  return `${c.y}-${String(c.m).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}

function periodDayKey(d: Date): string {
  return civilDayKey(civilInSaoPaulo(d));
}

function periodMonthKey(d: Date): string {
  const c = civilInSaoPaulo(d);
  return `${c.y}-${String(c.m).padStart(2, "0")}`;
}

function periodWeekKey(d: Date): string {
  const c = civilInSaoPaulo(d);
  const dow = new Date(Date.UTC(c.y, c.m - 1, c.day)).getUTCDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const monday = new Date(Date.UTC(c.y, c.m - 1, c.day - offset));
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
}

function daysInclusiveCivil(a: CivilDate, b: CivilDate): number {
  const start = Date.UTC(a.y, a.m - 1, a.day);
  const end = Date.UTC(b.y, b.m - 1, b.day);
  return Math.floor((end - start) / 86_400_000) + 1;
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
    const c = civilInSaoPaulo(toDt);
    return { start: startOfSaoPauloDay(c.y, c.m, 1), end: toDt };
  }
  const now = new Date();
  const c = civilInSaoPaulo(now);
  return { start: startOfSaoPauloDay(c.y, c.m, 1), end: now };
}

function previousPeriod(start: Date, end: Date): { start: Date; end: Date } {
  const s = civilInSaoPaulo(start);
  const e = civilInSaoPaulo(end);
  if (s.day === 1) {
    const prevM = s.m === 1 ? 12 : s.m - 1;
    const prevY = s.m === 1 ? s.y - 1 : s.y;
    const prevEndDay = Math.min(e.day, daysInMonth(prevY, prevM));
    return {
      start: startOfSaoPauloDay(prevY, prevM, 1),
      end: endOfSaoPauloDay(prevY, prevM, prevEndDay),
    };
  }
  const duration = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);
  return { start: prevStart, end: prevEnd };
}

/** Rateia o valor mensal das despesas fixas ativas pelos dias civis em São Paulo. */
export async function sumProratedFixedCosts(params: {
  organizationId: string;
  start: Date;
  end: Date;
}): Promise<number> {
  const templates = await prisma.operationalFixedExpense.findMany({
    where: { organizationId: params.organizationId, active: true },
    select: { amount: true },
  });
  if (templates.length === 0) return 0;
  const monthly = templates.reduce((acc, row) => acc + decToNum(row.amount), 0);
  if (monthly <= 0) return 0;

  const startC = civilInSaoPaulo(params.start);
  const endC = civilInSaoPaulo(params.end);
  let fraction = 0;
  let y = startC.y;
  let m = startC.m;
  while (y < endC.y || (y === endC.y && m <= endC.m)) {
    const monthDays = daysInMonth(y, m);
    const overlapStart: CivilDate =
      y === startC.y && m === startC.m ? startC : { y, m, day: 1 };
    const overlapEnd: CivilDate =
      y === endC.y && m === endC.m ? endC : { y, m, day: monthDays };
    if (daysInclusiveCivil(overlapStart, overlapEnd) > 0) {
      fraction += daysInclusiveCivil(overlapStart, overlapEnd) / monthDays;
    }
    if (m === 12) {
      m = 1;
      y += 1;
    } else {
      m += 1;
    }
  }
  return roundMoney(monthly * fraction);
}

export type FinancialPeriodGroup = "day" | "week" | "month";

export type FinancialResultTotals = {
  orderCount: number;
  revenue: number;
  avgTicket: number;
  productCost: number;
  commission: number;
  profit: number;
  marginPct: number;
  fixedCosts: number;
  finalProfit: number;
  finalMarginPct: number;
  linesMissingCost: number;
};

type Acc = {
  label: string;
  orderIds: Set<string>;
  revenue: number;
  productCost: number;
  commission: number;
};

function emptyAcc(label: string): Acc {
  return {
    label,
    orderIds: new Set(),
    revenue: 0,
    productCost: 0,
    commission: 0,
  };
}

function accRow(id: string, a: Acc) {
  const profit = roundMoney(a.revenue - a.productCost - a.commission);
  const marginPct =
    a.revenue > 0 ? roundMoney((profit / a.revenue) * 100) : 0;
  return {
    id,
    label: a.label,
    orderCount: a.orderIds.size,
    revenue: roundMoney(a.revenue),
    productCost: roundMoney(a.productCost),
    commission: roundMoney(a.commission),
    profit,
    marginPct,
  };
}

function totalsFromParts(parts: {
  orderCount: number;
  revenue: number;
  productCost: number;
  commission: number;
  linesMissingCost: number;
  fixedCosts: number;
  includeFixedCosts: boolean;
}): FinancialResultTotals {
  const profit = roundMoney(
    parts.revenue - parts.productCost - parts.commission,
  );
  const marginPct =
    parts.revenue > 0 ? roundMoney((profit / parts.revenue) * 100) : 0;
  const fixed = parts.fixedCosts;
  const finalProfit = parts.includeFixedCosts
    ? roundMoney(profit - fixed)
    : profit;
  const finalMarginPct = parts.includeFixedCosts
    ? parts.revenue > 0
      ? roundMoney((finalProfit / parts.revenue) * 100)
      : 0
    : marginPct;
  return {
    orderCount: parts.orderCount,
    revenue: roundMoney(parts.revenue),
    avgTicket:
      parts.orderCount > 0
        ? roundMoney(parts.revenue / parts.orderCount)
        : 0,
    productCost: roundMoney(parts.productCost),
    commission: roundMoney(parts.commission),
    profit,
    marginPct,
    fixedCosts: roundMoney(fixed),
    finalProfit,
    finalMarginPct,
    linesMissingCost: parts.linesMissingCost,
  };
}

function evolutionPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return roundMoney(((current - previous) / Math.abs(previous)) * 100);
}

const CRITERIA_WITHOUT_FIXED =
  "Critérios deste relatório: faturamento é o valor líquido do pedido (já com desconto de combo). Lucro = faturamento − custo dos produtos − comissões. Não entram impostos, fretes, taxas nem custos fixos.";

const CRITERIA_WITH_FIXED =
  "Critérios deste relatório: faturamento é o valor líquido do pedido (já com desconto de combo). Lucro = faturamento − custo dos produtos − comissões. Lucro final ainda desconta os custos fixos rateados pelos dias do período. Não entram impostos, fretes ou taxas.";

const orderSelect = {
  id: true,
  orderNumber: true,
  sellerId: true,
  createdAt: true,
  totalAmount: true,
  seller: { select: { user: { select: { name: true } } } },
  customer: { select: { name: true } },
  items: {
    select: {
      productId: true,
      productName: true,
      quantity: true,
      unitPrice: true,
      commissionAmount: true,
      product: {
        select: {
          costPrice: true,
          supplierId: true,
          supplier: { select: { tradeName: true, legalName: true } },
        },
      },
    },
  },
} as const;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

async function loadOrders(params: {
  organizationId: string;
  start: Date;
  end: Date;
  sellerIds?: string[];
}): Promise<OrderRow[]> {
  const where: Prisma.OrderWhereInput = {
    organizationId: params.organizationId,
    status: "CONFIRMED",
    createdAt: { gte: params.start, lte: params.end },
  };
  if (params.sellerIds?.length) where.sellerId = { in: params.sellerIds };
  return prisma.order.findMany({
    where,
    select: orderSelect,
    orderBy: { createdAt: "asc" },
  });
}

function aggregateOrders(
  orders: OrderRow[],
  periodGroup: FinancialPeriodGroup,
): {
  orderCount: number;
  revenue: number;
  productCost: number;
  commission: number;
  linesMissingCost: number;
  byOrder: Array<{
    orderId: string;
    orderNumber: string;
    date: string;
    customer: string;
    seller: string;
    revenue: number;
    productCost: number;
    commission: number;
    profit: number;
    marginPct: number;
  }>;
  bySeller: Map<string, Acc>;
  bySupplier: Map<string, Acc>;
  byProduct: Map<string, Acc>;
  byPeriod: Map<string, Acc>;
} {
  const bySeller = new Map<string, Acc>();
  const bySupplier = new Map<string, Acc>();
  const byProduct = new Map<string, Acc>();
  const byPeriod = new Map<string, Acc>();
  const byOrder: Array<{
    orderId: string;
    orderNumber: string;
    date: string;
    customer: string;
    seller: string;
    revenue: number;
    productCost: number;
    commission: number;
    profit: number;
    marginPct: number;
  }> = [];

  let revenue = 0;
  let productCost = 0;
  let commission = 0;
  let linesMissingCost = 0;

  function bump(map: Map<string, Acc>, id: string, label: string, delta: {
    orderId: string;
    revenue: number;
    productCost: number;
    commission: number;
  }) {
    const acc = map.get(id) ?? emptyAcc(label);
    acc.orderIds.add(delta.orderId);
    acc.revenue += delta.revenue;
    acc.productCost += delta.productCost;
    acc.commission += delta.commission;
    map.set(id, acc);
  }

  for (const order of orders) {
    const billed = roundMoney(decToNum(order.totalAmount));
    const lineParts = order.items.map((item) => {
      const lineGross = roundMoney(decToNum(item.unitPrice) * item.quantity);
      const unitCost =
        item.product.costPrice != null ? decToNum(item.product.costPrice) : null;
      if (unitCost == null) linesMissingCost += 1;
      return {
        item,
        lineGross,
        lineCost:
          unitCost != null ? roundMoney(unitCost * item.quantity) : 0,
        lineCommission: item.commissionAmount
          ? decToNum(item.commissionAmount)
          : 0,
      };
    });
    const gross = roundMoney(
      lineParts.reduce((s, p) => s + p.lineGross, 0),
    );

    let orderRevenue = 0;
    let orderCost = 0;
    let orderCommission = 0;
    let allocatedRevenue = 0;

    lineParts.forEach((part, idx) => {
      const isLast = idx === lineParts.length - 1;
      const lineRevenue =
        gross <= 0
          ? 0
          : isLast
            ? roundMoney(billed - allocatedRevenue)
            : roundMoney((part.lineGross / gross) * billed);
      if (!isLast) allocatedRevenue += lineRevenue;

      orderRevenue += lineRevenue;
      orderCost += part.lineCost;
      orderCommission += part.lineCommission;

      const delta = {
        orderId: order.id,
        revenue: lineRevenue,
        productCost: part.lineCost,
        commission: part.lineCommission,
      };
      bump(
        bySeller,
        order.sellerId ?? "__direct__",
        sellerLabelOrDirect(order.seller?.user.name),
        delta,
      );
      bump(byProduct, part.item.productId, part.item.productName, delta);
      const supplierId = part.item.product.supplierId ?? "_none";
      const supplierLabel =
        part.item.product.supplier?.tradeName ??
        part.item.product.supplier?.legalName ??
        "Sem fornecedor";
      bump(bySupplier, supplierId, supplierLabel, delta);
    });

    if (lineParts.length === 0) {
      orderRevenue = billed;
    }

    revenue += orderRevenue;
    productCost += orderCost;
    commission += orderCommission;

    const profit = roundMoney(orderRevenue - orderCost - orderCommission);
    const marginPct =
      orderRevenue > 0 ? roundMoney((profit / orderRevenue) * 100) : 0;
    byOrder.push({
      orderId: order.id,
      orderNumber:
        order.orderNumber != null ? String(order.orderNumber) : order.id.slice(-6),
      date: order.createdAt.toISOString(),
      customer: order.customer?.name ?? "—",
      seller: sellerLabelOrDirect(order.seller?.user.name),
      revenue: roundMoney(orderRevenue),
      productCost: roundMoney(orderCost),
      commission: roundMoney(orderCommission),
      profit,
      marginPct,
    });

    const periodKey =
      periodGroup === "month"
        ? periodMonthKey(order.createdAt)
        : periodGroup === "week"
          ? periodWeekKey(order.createdAt)
          : periodDayKey(order.createdAt);
    bump(byPeriod, periodKey, periodKey, {
      orderId: order.id,
      revenue: orderRevenue,
      productCost: orderCost,
      commission: orderCommission,
    });
  }

  return {
    orderCount: orders.length,
    revenue,
    productCost,
    commission,
    linesMissingCost,
    byOrder,
    bySeller,
    bySupplier,
    byProduct,
    byPeriod,
  };
}

function mapAcc(map: Map<string, Acc>) {
  return [...map.entries()]
    .map(([id, acc]) => accRow(id, acc))
    .sort((a, b) => b.profit - a.profit);
}

export type FinancialResultReport = {
  generatedAt: string;
  includeFixedCosts: boolean;
  periodGroup: FinancialPeriodGroup;
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  criteria: string;
  totals: FinancialResultTotals;
  previous: FinancialResultTotals;
  evolution: {
    revenuePct: number | null;
    profitPct: number | null;
    finalProfitPct: number | null;
    marginPctPoints: number;
  };
  byOrder: ReturnType<typeof aggregateOrders>["byOrder"];
  bySeller: ReturnType<typeof mapAcc>;
  bySupplier: ReturnType<typeof mapAcc>;
  byProduct: ReturnType<typeof mapAcc>;
  byPeriod: ReturnType<typeof mapAcc>;
};

const MAX_ORDER_ROWS = 400;

export async function buildFinancialResult(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerIds?: string[];
  includeFixedCosts?: boolean;
  periodGroup?: FinancialPeriodGroup;
}): Promise<FinancialResultReport> {
  const includeFixedCosts = Boolean(params.includeFixedCosts);
  const periodGroup = params.periodGroup ?? "day";
  const { start, end } = resolvePeriod(params.from, params.to);
  const prev = previousPeriod(start, end);

  const [orders, prevOrders, fixedCosts, prevFixedCosts] = await Promise.all([
    loadOrders({
      organizationId: params.organizationId,
      start,
      end,
      sellerIds: params.sellerIds,
    }),
    loadOrders({
      organizationId: params.organizationId,
      start: prev.start,
      end: prev.end,
      sellerIds: params.sellerIds,
    }),
    sumProratedFixedCosts({
      organizationId: params.organizationId,
      start,
      end,
    }),
    sumProratedFixedCosts({
      organizationId: params.organizationId,
      start: prev.start,
      end: prev.end,
    }),
  ]);

  const current = aggregateOrders(orders, periodGroup);
  const previous = aggregateOrders(prevOrders, periodGroup);

  const totals = totalsFromParts({
    ...current,
    fixedCosts,
    includeFixedCosts,
  });
  const previousTotals = totalsFromParts({
    ...previous,
    fixedCosts: prevFixedCosts,
    includeFixedCosts,
  });

  return {
    generatedAt: new Date().toISOString(),
    includeFixedCosts,
    periodGroup,
    period: { from: start.toISOString(), to: end.toISOString() },
    previousPeriod: {
      from: prev.start.toISOString(),
      to: prev.end.toISOString(),
    },
    criteria: includeFixedCosts ? CRITERIA_WITH_FIXED : CRITERIA_WITHOUT_FIXED,
    totals,
    previous: previousTotals,
    evolution: {
      revenuePct: evolutionPct(totals.revenue, previousTotals.revenue),
      profitPct: evolutionPct(totals.profit, previousTotals.profit),
      finalProfitPct: evolutionPct(
        totals.finalProfit,
        previousTotals.finalProfit,
      ),
      marginPctPoints: roundMoney(
        (includeFixedCosts ? totals.finalMarginPct : totals.marginPct) -
          (includeFixedCosts
            ? previousTotals.finalMarginPct
            : previousTotals.marginPct),
      ),
    },
    byOrder: current.byOrder.slice(0, MAX_ORDER_ROWS),
    bySeller: mapAcc(current.bySeller),
    bySupplier: mapAcc(current.bySupplier),
    byProduct: mapAcc(current.byProduct).slice(0, 80),
    byPeriod: mapAcc(current.byPeriod).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
  };
}

function fmtPct(n: number): string {
  return `${n.toFixed(2).replace(".", ",")}%`;
}

function fmtPeriodLabel(fromIso: string, toIso: string): string {
  const opts: Intl.DateTimeFormatOptions = { timeZone: REPORT_TZ };
  const from = new Date(fromIso).toLocaleDateString("pt-BR", opts);
  const to = new Date(toIso).toLocaleDateString("pt-BR", opts);
  return `${from} — ${to}`;
}

function drawSummaryCards(
  doc: PDFKit.PDFDocument,
  items: Array<{ label: string; value: string }>,
) {
  const cols = 3;
  const gap = 6;
  const boxH = 38;
  const boxW = (PAGE.width - gap * (cols - 1)) / cols;
  for (let i = 0; i < items.length; i += cols) {
    ensureSpace(doc, boxH + gap);
    const y = doc.y;
    const slice = items.slice(i, i + cols);
    slice.forEach((item, col) => {
      const x = PAGE.left + col * (boxW + gap);
      doc
        .roundedRect(x, y, boxW, boxH, 3)
        .fillAndStroke("#f8fafc", COLORS.border);
      doc
        .fillColor(COLORS.muted)
        .fontSize(7)
        .font("Helvetica")
        .text(item.label, x + 8, y + 6, {
          width: boxW - 16,
          lineBreak: false,
        });
      doc
        .fillColor(COLORS.text)
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(item.value, x + 8, y + 18, {
          width: boxW - 16,
          lineBreak: false,
        });
    });
    doc.y = y + boxH + gap;
  }
  doc.font("Helvetica").fillColor(COLORS.text);
}

export async function buildFinancialResultPdf(params: {
  organizationId: string;
  orgName?: string | null;
  from?: string;
  to?: string;
  sellerIds?: string[];
  includeFixedCosts?: boolean;
  periodGroup?: FinancialPeriodGroup;
}): Promise<Buffer> {
  const report = await buildFinancialResult(params);
  return renderFinancialResultPdf(report, params.orgName);
}

export function renderFinancialResultPdf(
  report: FinancialResultReport,
  orgName?: string | null,
): Promise<Buffer> {
  const t = report.totals;
  const p = report.previous;
  const profitKey = report.includeFixedCosts ? "finalProfit" : "profit";
  const marginKey = report.includeFixedCosts ? "finalMarginPct" : "marginPct";

  return withPdfDoc((doc) => {
    drawHeader(
      doc,
      "Resultado financeiro",
      orgName ?? undefined,
      fmtPeriodLabel(report.period.from, report.period.to),
    );
    if (report.includeFixedCosts) {
      doc
        .fillColor("#b45309")
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("Custos fixos considerados neste resultado.", PAGE.left, doc.y, {
          width: PAGE.width,
        });
      doc.moveDown(0.4);
    }

    const kpis: Array<{ label: string; value: string }> = [
      { label: "Pedidos", value: String(t.orderCount) },
      { label: "Faturamento", value: money(t.revenue) },
      { label: "Ticket médio", value: money(t.avgTicket) },
      { label: "Custo dos produtos", value: money(t.productCost) },
      { label: "Comissões", value: money(t.commission) },
      { label: "Lucro", value: money(t.profit) },
      { label: "Margem", value: fmtPct(t.marginPct) },
      { label: "Custos fixos", value: money(t.fixedCosts) },
      { label: "Lucro final", value: money(t.finalProfit) },
      { label: "Margem final", value: fmtPct(t.finalMarginPct) },
    ];
    drawSummaryCards(doc, kpis);
    doc.moveDown(0.3);
    doc
      .fontSize(8)
      .fillColor("#64748b")
      .text(
        `Período anterior (${fmtPeriodLabel(report.previousPeriod.from, report.previousPeriod.to)}): Faturamento ${money(p.revenue)} · Lucro ${money(p[profitKey])} · Margem ${fmtPct(p[marginKey])}`,
        PAGE.left,
        doc.y,
        { width: PAGE.width },
      );
    const evo = report.includeFixedCosts
      ? report.evolution.finalProfitPct
      : report.evolution.profitPct;
    doc.text(
      `Evolução do lucro: ${evo == null ? "—" : `${evo > 0 ? "+" : ""}${fmtPct(evo)}`}`,
      PAGE.left,
      doc.y,
      { width: PAGE.width },
    );
    doc.moveDown(0.8);

    const table: PdfTable = {
      columns: [
        { key: "order", label: "Pedido", width: 52 },
        { key: "date", label: "Data", width: 72 },
        { key: "customer", label: "Cliente", width: 110 },
        { key: "revenue", label: "Venda", width: 68, align: "right" },
        { key: "cost", label: "Custo", width: 68, align: "right" },
        { key: "commission", label: "Comissão", width: 68, align: "right" },
        { key: "profit", label: "Lucro", width: 68, align: "right" },
        { key: "margin", label: "Margem", width: 41, align: "right" },
      ],
      rowHeight: 16,
      headerHeight: 18,
    };
    drawTableHeader(doc, table);
    report.byOrder.forEach((row, index) => {
      drawTableRow(
        doc,
        table,
        {
          order: row.orderNumber,
          date: new Date(row.date).toLocaleDateString("pt-BR", {
            timeZone: REPORT_TZ,
          }),
          customer: row.customer,
          revenue: money(row.revenue),
          cost: money(row.productCost),
          commission: money(row.commission),
          profit: money(row.profit),
          margin: fmtPct(row.marginPct),
        },
        { index },
      );
    });
    if (report.byOrder.length > 0) {
      drawTableRow(
        doc,
        table,
        {
          order: "",
          date: "",
          customer: "TOTAL",
          revenue: money(t.revenue),
          cost: money(t.productCost),
          commission: money(t.commission),
          profit: money(t.profit),
          margin: fmtPct(t.marginPct),
        },
        { emphasize: true },
      );
    }

    doc.moveDown(1.2);
    doc
      .fillColor("#64748b")
      .fontSize(8)
      .font("Helvetica")
      .text(report.criteria, PAGE.left, doc.y, {
        width: PAGE.width,
        align: "left",
      });
    if (t.linesMissingCost > 0) {
      doc.moveDown(0.4);
      doc.text(
        `${t.linesMissingCost} linha(s) sem custo cadastrado (consideradas com custo zero).`,
        PAGE.left,
        doc.y,
        { width: PAGE.width },
      );
    }
  });
}
