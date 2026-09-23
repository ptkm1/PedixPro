import type { CommissionPayableCriterion, Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import { orderCode } from "./reports/pdf-common.js";

const REPORT_TZ = "America/Sao_Paulo";

export type CommissionPayableCriterionValue = CommissionPayableCriterion;

export const COMMISSION_PAYABLE_CRITERIA = [
  {
    value: "EMITTED" as const,
    title: "PEDIDOS EMITIDOS",
    shortLabel: "Pedidos emitidos",
    description:
      "Considera a comissão assim que o pedido for emitido/concluído.",
  },
  {
    value: "INVOICED" as const,
    title: "PEDIDOS FATURADOS",
    shortLabel: "Pedidos faturados",
    description: "Considera a comissão somente quando o pedido for faturado.",
  },
  {
    value: "SETTLED" as const,
    title: "PEDIDOS LIQUIDADOS",
    shortLabel: "Pedidos liquidados",
    description:
      "Considera a comissão somente quando o pagamento do pedido estiver totalmente recebido.",
  },
] as const;

export function criterionShortLabel(
  criterion: CommissionPayableCriterionValue,
): string {
  return (
    COMMISSION_PAYABLE_CRITERIA.find((c) => c.value === criterion)
      ?.shortLabel ?? criterion
  );
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function civilInSaoPaulo(d: Date): { y: number; m: number; day: number } {
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

export function saoPauloMonthBounds(
  year: number,
  month1: number,
): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month1 - 1, 1, 3, 0, 0, 0)),
    end: new Date(Date.UTC(year, month1, 1, 2, 59, 59, 999)),
  };
}

function parseOptionalDate(raw: string | undefined): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function resolvePayablePeriod(
  from?: string,
  to?: string,
): { start: Date; end: Date } {
  const fromDt = parseOptionalDate(from);
  const toDt = parseOptionalDate(to);
  if (fromDt && toDt) return { start: fromDt, end: toDt };
  if (fromDt && !toDt) return { start: fromDt, end: new Date() };
  const now = civilInSaoPaulo(new Date());
  const month = saoPauloMonthBounds(now.y, now.m);
  if (!fromDt && toDt) return { start: month.start, end: toDt };
  return month;
}

export type PayableItemRow = {
  productName: string;
  quantity: number;
  saleAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  priceTableName: string;
};

export type PayableOrderRow = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  referenceDate: string;
  saleAmount: number;
  commissionAmount: number;
  items: PayableItemRow[];
};

export type PayableSellerRow = {
  sellerId: string;
  sellerName: string;
  orderCount: number;
  saleAmount: number;
  commissionAmount: number;
  orders: PayableOrderRow[];
};

export type CommissionPayableReport = {
  criterion: CommissionPayableCriterionValue;
  criterionLabel: string;
  period: { from: string; to: string };
  totals: {
    sellerCount: number;
    orderCount: number;
    saleAmount: number;
    commissionAmount: number;
  };
  sellers: PayableSellerRow[];
};

type PaymentSlice = { amount: number; at: Date };

/** Data em que o pedido ficou totalmente recebido (sem rateio). */
export function settlementDateFromPayments(
  totalDue: number,
  payments: PaymentSlice[],
): Date | null {
  const due = roundMoney(totalDue);
  if (due <= 0) return null;
  const ordered = [...payments]
    .filter((p) => p.amount > 0 && !Number.isNaN(p.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  let acc = 0;
  for (const p of ordered) {
    acc = roundMoney(acc + p.amount);
    if (acc + 1e-6 >= due) return p.at;
  }
  return null;
}

function mapItems(
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: unknown;
    commissionPercent: unknown;
    commissionAmount: unknown;
    priceTableName: string | null;
  }>,
): { commissionAmount: number; items: PayableItemRow[] } {
  const rows = items.map((it) => {
    const qty = it.quantity;
    const unit = roundMoney(decToNum(it.unitPrice));
    return {
      productName: it.productName,
      quantity: qty,
      saleAmount: roundMoney(unit * qty),
      commissionPercent: roundMoney(decToNum(it.commissionPercent ?? 0)),
      commissionAmount: roundMoney(decToNum(it.commissionAmount ?? 0)),
      priceTableName: it.priceTableName?.trim() || "—",
    };
  });
  return {
    commissionAmount: roundMoney(
      rows.reduce((s, r) => s + r.commissionAmount, 0),
    ),
    items: rows,
  };
}

async function loadOrgCriterion(
  organizationId: string,
): Promise<CommissionPayableCriterionValue> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { commissionPayableCriterion: true },
  });
  return org?.commissionPayableCriterion ?? "EMITTED";
}

const itemSelect = {
  productName: true,
  quantity: true,
  unitPrice: true,
  commissionPercent: true,
  commissionAmount: true,
  priceTableName: true,
} as const;

type EligibleOrder = {
  orderId: string;
  sellerId: string;
  sellerName: string;
  customerName: string;
  orderNumber: number | null;
  saleAmount: number;
  commissionAmount: number;
  referenceDate: Date;
  items: PayableItemRow[];
};

function payableSeller(
  sellerId: string | null,
  seller: { user: { name: string } } | null,
): { sellerId: string; sellerName: string } | null {
  if (!sellerId || !seller) return null;
  return { sellerId, sellerName: seller.user.name };
}

async function eligibleEmitted(
  organizationId: string,
  skipIds: Set<string>,
): Promise<EligibleOrder[]> {
  const orders = await prisma.order.findMany({
    where: {
      organizationId,
      status: "CONFIRMED",
      ...(skipIds.size ? { id: { notIn: [...skipIds] } } : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      totalAmount: true,
      sellerId: true,
      seller: { select: { user: { select: { name: true } } } },
      customer: { select: { name: true, tradeName: true } },
      items: { select: itemSelect },
    },
  });
  return orders.flatMap((o) => {
    const seller = payableSeller(o.sellerId, o.seller);
    if (!seller) return [];
    const mapped = mapItems(o.items);
    return [
      {
        orderId: o.id,
        sellerId: seller.sellerId,
        sellerName: seller.sellerName,
        customerName: o.customer?.tradeName || o.customer?.name || "—",
        orderNumber: o.orderNumber,
        saleAmount: roundMoney(decToNum(o.totalAmount)),
        commissionAmount: mapped.commissionAmount,
        referenceDate: o.createdAt,
        items: mapped.items,
      },
    ];
  });
}

async function eligibleInvoiced(
  organizationId: string,
  skipIds: Set<string>,
): Promise<EligibleOrder[]> {
  const invoices = await prisma.fiscalInvoice.findMany({
    where: {
      organizationId,
      direction: "OUTBOUND",
      status: "AUTHORIZED",
      orderId: { not: null },
      order: { status: "CONFIRMED" },
    },
    select: {
      issuedAt: true,
      createdAt: true,
      orderId: true,
    },
    orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
  });

  const firstByOrder = new Map<string, Date>();
  for (const inv of invoices) {
    if (!inv.orderId || skipIds.has(inv.orderId)) continue;
    if (firstByOrder.has(inv.orderId)) continue;
    firstByOrder.set(inv.orderId, inv.issuedAt ?? inv.createdAt);
  }
  if (!firstByOrder.size) return [];

  const orders = await prisma.order.findMany({
    where: {
      organizationId,
      status: "CONFIRMED",
      id: { in: [...firstByOrder.keys()] },
    },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      sellerId: true,
      seller: { select: { user: { select: { name: true } } } },
      customer: { select: { name: true, tradeName: true } },
      items: { select: itemSelect },
    },
  });

  return orders.flatMap((o) => {
    const seller = payableSeller(o.sellerId, o.seller);
    if (!seller) return [];
    const mapped = mapItems(o.items);
    return [
      {
        orderId: o.id,
        sellerId: seller.sellerId,
        sellerName: seller.sellerName,
        customerName: o.customer?.tradeName || o.customer?.name || "—",
        orderNumber: o.orderNumber,
        saleAmount: roundMoney(decToNum(o.totalAmount)),
        commissionAmount: mapped.commissionAmount,
        referenceDate: firstByOrder.get(o.id) ?? new Date(),
        items: mapped.items,
      },
    ];
  });
}

async function eligibleSettled(
  organizationId: string,
  skipIds: Set<string>,
): Promise<EligibleOrder[]> {
  const orders = await prisma.order.findMany({
    where: {
      organizationId,
      status: "CONFIRMED",
      ...(skipIds.size ? { id: { notIn: [...skipIds] } } : {}),
    },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      sellerId: true,
      seller: { select: { user: { select: { name: true } } } },
      customer: { select: { name: true, tradeName: true } },
      items: { select: itemSelect },
      receipts: { select: { amount: true, receivedAt: true } },
      receivables: {
        select: {
          amount: true,
          paidAmount: true,
          paidAt: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });

  const out: EligibleOrder[] = [];
  for (const o of orders) {
    const due = roundMoney(decToNum(o.totalAmount));
    const payments: PaymentSlice[] = o.receipts.map((r) => ({
      amount: roundMoney(decToNum(r.amount)),
      at: r.receivedAt,
    }));
    const activeRec = o.receivables.filter((r) => r.status !== "CANCELLED");
    for (const rec of o.receivables) {
      const paid = roundMoney(decToNum(rec.paidAmount));
      if (paid <= 0) continue;
      payments.push({
        amount: paid,
        at: rec.paidAt ?? rec.updatedAt,
      });
    }
    const byAmount = settlementDateFromPayments(due, payments);
    const allTitlesSettled =
      activeRec.length > 0 &&
      activeRec.every((r) => r.status === "PAID");
    let at = byAmount;
    if (!at && allTitlesSettled) {
      const dates = activeRec
        .map((r) => r.paidAt ?? r.updatedAt)
        .filter((d): d is Date => d != null);
      if (dates.length) {
        at = new Date(Math.max(...dates.map((d) => d.getTime())));
      }
    }
    if (!at) continue;
    const seller = payableSeller(o.sellerId, o.seller);
    if (!seller) continue;
    const mapped = mapItems(o.items);
    out.push({
      orderId: o.id,
      sellerId: seller.sellerId,
      sellerName: seller.sellerName,
      customerName: o.customer?.tradeName || o.customer?.name || "—",
      orderNumber: o.orderNumber,
      saleAmount: due,
      commissionAmount: mapped.commissionAmount,
      referenceDate: at,
      items: mapped.items,
    });
  }
  return out;
}

async function eligibleForCriterion(
  organizationId: string,
  criterion: CommissionPayableCriterionValue,
  skipIds: Set<string>,
): Promise<EligibleOrder[]> {
  if (criterion === "INVOICED") return eligibleInvoiced(organizationId, skipIds);
  if (criterion === "SETTLED") return eligibleSettled(organizationId, skipIds);
  return eligibleEmitted(organizationId, skipIds);
}

/** Grava no ledger pedidos que já cumpriram o critério atual e ainda não foram considerados. */
export async function syncCommissionPayableLedger(
  organizationId: string,
  criterion?: CommissionPayableCriterionValue,
): Promise<void> {
  const used = criterion ?? (await loadOrgCriterion(organizationId));
  const existing = await prisma.orderCommissionPayableLedger.findMany({
    where: { organizationId },
    select: { orderId: true },
  });
  const skip = new Set(existing.map((r) => r.orderId));
  const fresh = await eligibleForCriterion(organizationId, used, skip);
  if (!fresh.length) return;
  await prisma.orderCommissionPayableLedger.createMany({
    data: fresh.map((o) => ({
      organizationId,
      orderId: o.orderId,
      criterion: used,
      referenceDate: o.referenceDate,
      commissionAmount: o.commissionAmount,
      saleAmount: o.saleAmount,
    })),
    skipDuplicates: true,
  });
}

export async function getCommissionPayableSettings(organizationId: string) {
  const criterion = await loadOrgCriterion(organizationId);
  return {
    criterion,
    criterionLabel: criterionShortLabel(criterion),
    options: COMMISSION_PAYABLE_CRITERIA.map((c) => ({
      value: c.value,
      title: c.title,
      shortLabel: c.shortLabel,
      description: c.description,
    })),
  };
}

export async function setCommissionPayableCriterion(
  organizationId: string,
  criterion: CommissionPayableCriterionValue,
) {
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { commissionPayableCriterion: criterion },
    select: { commissionPayableCriterion: true },
  });
  return getCommissionPayableSettings(organizationId).then((s) => ({
    ...s,
    criterion: updated.commissionPayableCriterion,
    criterionLabel: criterionShortLabel(updated.commissionPayableCriterion),
  }));
}

export async function buildCommissionPayableReport(params: {
  organizationId: string;
  from?: string;
  to?: string;
  sellerId?: string;
}): Promise<CommissionPayableReport> {
  const criterion = await loadOrgCriterion(params.organizationId);
  await syncCommissionPayableLedger(params.organizationId, criterion);
  const period = resolvePayablePeriod(params.from, params.to);

  const where: Prisma.OrderCommissionPayableLedgerWhereInput = {
    organizationId: params.organizationId,
    referenceDate: { gte: period.start, lte: period.end },
    order: {
      status: "CONFIRMED",
      ...(params.sellerId ? { sellerId: params.sellerId } : {}),
    },
  };

  const rows = await prisma.orderCommissionPayableLedger.findMany({
    where,
    select: {
      referenceDate: true,
      commissionAmount: true,
      saleAmount: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          sellerId: true,
          seller: { select: { user: { select: { name: true } } } },
          customer: { select: { name: true, tradeName: true } },
          items: { select: itemSelect },
        },
      },
    },
  });

  const bySeller = new Map<string, PayableSellerRow>();
  for (const row of rows) {
    const mapped = mapItems(row.order.items);
    const saleAmount = roundMoney(decToNum(row.saleAmount));
    const commissionAmount = roundMoney(decToNum(row.commissionAmount));
    const seller = payableSeller(row.order.sellerId, row.order.seller);
    if (!seller) continue;
    const { sellerId, sellerName } = seller;
    const current = bySeller.get(sellerId) ?? {
      sellerId,
      sellerName,
      orderCount: 0,
      saleAmount: 0,
      commissionAmount: 0,
      orders: [],
    };
    current.orderCount += 1;
    current.saleAmount = roundMoney(current.saleAmount + saleAmount);
    current.commissionAmount = roundMoney(
      current.commissionAmount + commissionAmount,
    );
    current.orders.push({
      orderId: row.order.id,
      orderNumber: orderCode(row.order),
      customerName:
        row.order.customer?.tradeName || row.order.customer?.name || "—",
      referenceDate: row.referenceDate.toISOString(),
      saleAmount,
      commissionAmount,
      items: mapped.items,
    });
    bySeller.set(sellerId, current);
  }

  const sellers = [...bySeller.values()].sort((a, b) =>
    a.sellerName.localeCompare(b.sellerName, "pt-BR"),
  );
  for (const s of sellers) {
    s.orders.sort(
      (a, b) =>
        new Date(a.referenceDate).getTime() -
        new Date(b.referenceDate).getTime(),
    );
  }

  const totals = sellers.reduce(
    (acc, s) => {
      acc.orderCount += s.orderCount;
      acc.saleAmount = roundMoney(acc.saleAmount + s.saleAmount);
      acc.commissionAmount = roundMoney(
        acc.commissionAmount + s.commissionAmount,
      );
      return acc;
    },
    { sellerCount: sellers.length, orderCount: 0, saleAmount: 0, commissionAmount: 0 },
  );
  totals.sellerCount = sellers.length;

  return {
    criterion,
    criterionLabel: criterionShortLabel(criterion),
    period: {
      from: period.start.toISOString(),
      to: period.end.toISOString(),
    },
    totals,
    sellers,
  };
}
