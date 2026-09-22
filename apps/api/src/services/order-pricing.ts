import {
  applySellerDiscountWithMinPrice,
  COMMISSION_ORIGIN,
  type CommissionOrigin,
} from "@pedidos/shared";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import { computeGreedyComboDiscount } from "./combo-discount.js";
import { resolveCommission } from "./commission-resolve.js";
import {
  assertPriceTableApplicableForSale,
  resolveEffectiveUnitPrice,
} from "./price-resolve.js";
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
  /** Tabela escolhida para esta linha (opcional; senão usa a do pedido). */
  priceTableId?: string | null;
};

export type ComputedSaleLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  productName: string;
  commissionPercent: number;
  commissionAmount: number;
  commissionOrigin: CommissionOrigin;
  priceTableId: string | null;
  priceTableName: string | null;
  priceOrigin: string | null;
  priceOriginLabel: string | null;
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
  const priceCtxBase = {
    sellerId: params.sellerId,
    customerId: params.customerId ?? null,
    regionId,
    at,
  };
  /** Evita revalidar a mesma tabela N vezes no mesmo pedido. */
  const validatedPriceTables = new Set<string>();

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

    const linePriceTableId = input.priceTableId ?? params.priceTableId ?? null;
    if (linePriceTableId) {
      const validateKey = `${linePriceTableId}:${input.productId}`;
      if (!validatedPriceTables.has(validateKey)) {
        try {
          await assertPriceTableApplicableForSale({
            organizationId: params.organizationId,
            priceTableId: linePriceTableId,
            productId: input.productId,
            ctx: priceCtxBase,
          });
        } catch (e) {
          throw new OrderPricingError(
            e instanceof Error ? e.message : "Tabela de preço inválida.",
          );
        }
        validatedPriceTables.add(validateKey);
      }
    }

    const priced = await resolveEffectiveUnitPrice(params.organizationId, input.productId, {
      ...priceCtxBase,
      priceTableId: linePriceTableId,
      quantity: input.quantity,
    });

    const maxSellerDisc =
      prod.maxSellerDiscountPercent != null ? decToNum(prod.maxSellerDiscountPercent) : orgDefaultMaxDisc;
    const requestedDisc = Math.min(100, Math.max(0, input.discountPercent ?? 0));
    if (requestedDisc > maxSellerDisc + 1e-9) {
      throw new OrderPricingError(
        `Desconto de ${requestedDisc}% acima do máximo permitido (${maxSellerDisc}%) para «${prod.name}».`,
      );
    }
    const disc = requestedDisc;

    const tableMin = priced.minPrice;
    const productMin =
      prod.minSaleUnitPrice != null ? roundMoney(decToNum(prod.minSaleUnitPrice)) : null;
    const minSale =
      tableMin != null && productMin != null
        ? Math.max(tableMin, productMin)
        : (tableMin ?? productMin);

    const afterDisc = applySellerDiscountWithMinPrice({
      catalogUnitPrice: priced.effectiveUnitPrice,
      discountPercent: disc,
      minPrice: minSale,
    });
    if (!afterDisc.ok) {
      throw new OrderPricingError(afterDisc.message);
    }
    const unitPrice = afterDisc.unitPrice;

    const resolvedCommission = params.sellerId
      ? await resolveCommission(
          params.organizationId,
          params.sellerId,
          prod.id,
          prod.categoryId,
          {
            mtdConfirmedRevenue: mtdBefore,
            priceTableId: priced.priceTableId ?? params.priceTableId ?? null,
          },
        )
      : { percent: 0, origin: COMMISSION_ORIGIN.PRODUCT };
    const lineTotal = roundMoney(unitPrice * input.quantity);
    const commissionAmount = roundMoney(
      (lineTotal * resolvedCommission.percent) / 100,
    );

    computedLines.push({
      productId: prod.id,
      quantity: input.quantity,
      unitPrice,
      productName: prod.name,
      commissionPercent: resolvedCommission.percent,
      commissionAmount,
      commissionOrigin: resolvedCommission.origin,
      priceTableId: priced.priceTableId ?? params.priceTableId ?? null,
      priceTableName: priced.priceTableName,
      priceOrigin: priced.origin,
      priceOriginLabel: priced.originLabel,
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
