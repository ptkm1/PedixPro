import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import { computeGreedyComboDiscount } from "./combo-discount.js";
import { resolveCommissionPercent } from "./commission-resolve.js";
import { resolveEffectiveUnitPrice } from "./price-resolve.js";
import { calendarMonthBounds, sellerConfirmedRevenueInPeriod } from "./seller-metrics.js";

export class OrderPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderPricingError";
  }
}

export type SaleLineInput = {
  productId: string;
  quantity: number;
  discountPercent?: number;
};

export type ComputedSaleLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  productName: string;
  commissionPercent: number;
  commissionAmount: number;
};

export type ComputeSaleOrderParams = {
  organizationId: string;
  /** Null = venda direta (comissão 0). */
  sellerId: string | null;
  customerId?: string | null;
  priceTableId?: string | null;
  items: SaleLineInput[];
  allowedProductIds?: Set<string>;
  at?: Date;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Monta linhas com preço efetivo + desconto do vendedor (limitado), comissão e total líquido após combos. */
export async function computeSaleOrder(params: ComputeSaleOrderParams): Promise<{
  lines: ComputedSaleLine[];
  comboDiscountTotal: number;
  grossLinesTotal: number;
  netTotal: number;
}> {
  const at = params.at ?? new Date();
  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { defaultMaxSellerDiscountPercent: true },
  });
  if (!org) throw new OrderPricingError("Organização inválida");
  const orgDefaultMaxDisc = decToNum(org.defaultMaxSellerDiscountPercent);

  let regionId: string | null = null;
  if (params.customerId) {
    const cust = await prisma.customer.findFirst({
      where: { id: params.customerId, organizationId: params.organizationId },
      select: { regionId: true },
    });
    regionId = cust?.regionId ?? null;
  }

  const periodBounds = calendarMonthBounds(at);
  const mtdBefore =
    params.sellerId != null
      ? await sellerConfirmedRevenueInPeriod(
          params.organizationId,
          params.sellerId,
          periodBounds.start,
          periodBounds.end,
        )
      : 0;

  const computedLines: ComputedSaleLine[] = [];

  for (const input of params.items) {
    if (params.allowedProductIds && !params.allowedProductIds.has(input.productId)) {
      throw new OrderPricingError(
        params.sellerId
          ? `Produto não liberado para este vendedor: ${input.productId}`
          : `Produto inválido: ${input.productId}`,
      );
    }

    const prod = await prisma.product.findFirst({
      where: { id: input.productId, organizationId: params.organizationId },
    });
    if (!prod) throw new OrderPricingError(`Produto inválido: ${input.productId}`);

    const priced = await resolveEffectiveUnitPrice(params.organizationId, input.productId, {
      sellerId: params.sellerId,
      customerId: params.customerId ?? null,
      regionId,
      priceTableId: params.priceTableId ?? null,
      quantity: input.quantity,
      at,
    });

    const maxSellerDisc =
      prod.maxSellerDiscountPercent != null ? decToNum(prod.maxSellerDiscountPercent) : orgDefaultMaxDisc;
    const requestedDisc = Math.min(100, Math.max(0, input.discountPercent ?? 0));
    const disc = Math.min(requestedDisc, maxSellerDisc);

    let unitPrice = priced.effectiveUnitPrice;
    if (disc > 0) unitPrice = roundMoney(unitPrice * (1 - disc / 100));

    const minSale =
      prod.minSaleUnitPrice != null ? roundMoney(decToNum(prod.minSaleUnitPrice)) : null;
    if (minSale != null && unitPrice + 1e-9 < minSale) {
      throw new OrderPricingError(
        `Preço unitário final inferior ao mínimo permitido (${minSale.toFixed(2)}) para «${prod.name}».`,
      );
    }

    const commissionPercent =
      params.sellerId != null
        ? await resolveCommissionPercent(
            params.organizationId,
            params.sellerId,
            prod.id,
            prod.categoryId,
            { mtdConfirmedRevenue: mtdBefore },
          )
        : 0;
    const lineTotal = roundMoney(unitPrice * input.quantity);
    const commissionAmount = roundMoney((lineTotal * commissionPercent) / 100);

    computedLines.push({
      productId: prod.id,
      quantity: input.quantity,
      unitPrice,
      productName: prod.name,
      commissionPercent,
      commissionAmount,
    });
  }

  const aggMap = new Map<string, { qty: number; weightedSum: number }>();
  for (const line of computedLines) {
    const cur = aggMap.get(line.productId) ?? { qty: 0, weightedSum: 0 };
    cur.qty += line.quantity;
    cur.weightedSum += line.unitPrice * line.quantity;
    aggMap.set(line.productId, cur);
  }

  const cartForCombo = new Map<string, { qty: number; unitPrice: number }>();
  for (const [pid, v] of aggMap) {
    cartForCombo.set(pid, {
      qty: v.qty,
      unitPrice: v.qty > 0 ? roundMoney(v.weightedSum / v.qty) : 0,
    });
  }

  const comboDiscountTotal = await computeGreedyComboDiscount(
    params.organizationId,
    cartForCombo,
    at,
  );

  const grossLinesTotal = roundMoney(
    computedLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
  );
  const netTotal = roundMoney(Math.max(0, grossLinesTotal - comboDiscountTotal));

  return {
    lines: computedLines,
    comboDiscountTotal,
    grossLinesTotal,
    netTotal,
  };
}
