/** Resolução compartilhada de preço de catálogo (web, API e app offline). */

export type PriceAdjustmentKind = "DISCOUNT" | "SURCHARGE";
export type PriceAdjustmentMode = "PERCENT" | "AMOUNT";
export type PriceTableStatus = "ACTIVE" | "INACTIVE";

export type PriceOriginKind =
  | "CUSTOMER_SPECIAL"
  | "QTY_TIER"
  | "PRODUCT_OVERRIDE"
  | "TABLE_RULE"
  | "BASE";

export const PRICE_ORIGIN_KIND = {
  CUSTOMER_SPECIAL: "CUSTOMER_SPECIAL",
  QTY_TIER: "QTY_TIER",
  PRODUCT_OVERRIDE: "PRODUCT_OVERRIDE",
  TABLE_RULE: "TABLE_RULE",
  BASE: "BASE",
} as const;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatBrl(n: number): string {
  return `R$${n.toFixed(2).replace(".", ",")}`;
}

export const PRICE_BELOW_MIN_MESSAGE = "Preço abaixo do mínimo permitido.";

export function discountExceedsMinMessage(minPrice: number): string {
  return `Desconto excede o preço mínimo permitido de ${formatBrl(minPrice)}.`;
}

export function isWithinDateWindow(
  at: Date,
  from?: Date | string | null,
  to?: Date | string | null,
): boolean {
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime()) && at < fromDate) {
    return false;
  }
  if (toDate && !Number.isNaN(toDate.getTime()) && at > toDate) {
    return false;
  }
  return true;
}

export function isPriceTableUsable(table: {
  status?: PriceTableStatus | string | null;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
}, at: Date = new Date()): boolean {
  if (table.status && table.status !== "ACTIVE") return false;
  return isWithinDateWindow(at, table.validFrom ?? null, table.validTo ?? null);
}

export function applyTableAdjustment(
  basePrice: number,
  kind: PriceAdjustmentKind,
  mode: PriceAdjustmentMode,
  value: number,
): number {
  const v = Math.max(0, value);
  if (mode === "PERCENT") {
    const factor = kind === "DISCOUNT" ? 1 - v / 100 : 1 + v / 100;
    return roundMoney(Math.max(0, basePrice * factor));
  }
  const delta = kind === "DISCOUNT" ? -v : v;
  return roundMoney(Math.max(0, basePrice + delta));
}

export function pickQtyTier<T extends { minQuantity: number }>(
  tiers: T[],
  quantity: number,
): T | null {
  let best: T | null = null;
  for (const t of tiers) {
    if (quantity >= t.minQuantity) {
      if (!best || t.minQuantity > best.minQuantity) best = t;
    }
  }
  return best;
}

export function priceTableSpecificity(t: {
  customerId?: string | null;
  sellerId?: string | null;
  regionId?: string | null;
}): number {
  return (
    (t.customerId ? 1 : 0) + (t.sellerId ? 1 : 0) + (t.regionId ? 1 : 0)
  );
}

export function tableMatchesScope(
  table: {
    customerId?: string | null;
    sellerId?: string | null;
    regionId?: string | null;
  },
  ctx: {
    customerId?: string | null;
    sellerId?: string | null;
    regionId?: string | null;
  },
): boolean {
  if (table.customerId && table.customerId !== ctx.customerId) return false;
  if (table.sellerId && table.sellerId !== ctx.sellerId) return false;
  if (table.regionId && table.regionId !== ctx.regionId) return false;
  return true;
}

export type QtyTierInput = {
  minQuantity: number;
  price: number;
};

export type TableItemInput = {
  useCustomPrice: boolean;
  price: number | null;
  minPrice: number | null;
};

export type TableRuleInput = {
  id: string;
  name: string;
  adjustmentKind: PriceAdjustmentKind;
  adjustmentMode: PriceAdjustmentMode;
  adjustmentValue: number;
  item: TableItemInput | null;
  qtyTiers: QtyTierInput[];
};

export type CustomerSpecialInput = {
  price: number;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
};

export type ResolveCatalogPriceInput = {
  basePrice: number;
  quantity: number;
  at?: Date;
  table: TableRuleInput | null;
  customerSpecial?: CustomerSpecialInput | null;
};

export type ResolvedCatalogPrice = {
  unitPrice: number;
  origin: PriceOriginKind;
  originLabel: string;
  minPrice: number | null;
  priceTableId: string | null;
  priceTableName: string | null;
};

export function formatPriceOriginLabel(params: {
  origin: PriceOriginKind;
  tableName?: string | null;
  tierMinQuantity?: number | null;
}): string {
  const tableName = params.tableName?.trim() || "";
  switch (params.origin) {
    case "CUSTOMER_SPECIAL":
      return "Preço especial do cliente";
    case "QTY_TIER": {
      const min = params.tierMinQuantity ?? 0;
      return tableName ? `${tableName} • Faixa ${min}+` : `Faixa ${min}+`;
    }
    case "PRODUCT_OVERRIDE":
    case "TABLE_RULE":
      return tableName ? `Tabela ${tableName}` : "Tabela de preço";
    default:
      return "Preço base";
  }
}

/**
 * Prioridade fixa:
 * 1. Preço especial do cliente (janela de datas)
 * 2. Faixa de quantidade da tabela+produto
 * 3. Preço personalizado do produto na tabela
 * 4. Regra geral da tabela (% / R$ sobre o base)
 * 5. Preço base do produto
 */
export function resolveCatalogPrice(
  input: ResolveCatalogPriceInput,
): ResolvedCatalogPrice {
  const at = input.at ?? new Date();
  const table = input.table;
  const minPrice = table?.item?.minPrice ?? null;
  const tableId = table?.id ?? null;
  const tableName = table?.name ?? null;

  const special = input.customerSpecial;
  if (
    special &&
    isWithinDateWindow(at, special.validFrom ?? null, special.validTo ?? null)
  ) {
    return {
      unitPrice: roundMoney(Math.max(0, special.price)),
      origin: "CUSTOMER_SPECIAL",
      originLabel: formatPriceOriginLabel({ origin: "CUSTOMER_SPECIAL" }),
      minPrice,
      priceTableId: tableId,
      priceTableName: tableName,
    };
  }

  if (table) {
    const qty = Math.max(0, input.quantity);
    const tier = pickQtyTier(table.qtyTiers, qty);
    if (tier) {
      return {
        unitPrice: roundMoney(Math.max(0, tier.price)),
        origin: "QTY_TIER",
        originLabel: formatPriceOriginLabel({
          origin: "QTY_TIER",
          tableName: table.name,
          tierMinQuantity: tier.minQuantity,
        }),
        minPrice,
        priceTableId: table.id,
        priceTableName: table.name,
      };
    }

    if (
      table.item?.useCustomPrice &&
      table.item.price != null &&
      Number.isFinite(table.item.price)
    ) {
      return {
        unitPrice: roundMoney(Math.max(0, table.item.price)),
        origin: "PRODUCT_OVERRIDE",
        originLabel: formatPriceOriginLabel({
          origin: "PRODUCT_OVERRIDE",
          tableName: table.name,
        }),
        minPrice,
        priceTableId: table.id,
        priceTableName: table.name,
      };
    }

    if (table.adjustmentValue > 0) {
      return {
        unitPrice: applyTableAdjustment(
          input.basePrice,
          table.adjustmentKind,
          table.adjustmentMode,
          table.adjustmentValue,
        ),
        origin: "TABLE_RULE",
        originLabel: formatPriceOriginLabel({
          origin: "TABLE_RULE",
          tableName: table.name,
        }),
        minPrice,
        priceTableId: table.id,
        priceTableName: table.name,
      };
    }
  }

  return {
    unitPrice: roundMoney(Math.max(0, input.basePrice)),
    origin: "BASE",
    originLabel: formatPriceOriginLabel({ origin: "BASE" }),
    minPrice,
    priceTableId: tableId,
    priceTableName: tableName,
  };
}

export type MinPriceCheckResult =
  | { ok: true; unitPrice: number }
  | { ok: false; message: string };

/** Aplica desconto do vendedor e bloqueia abaixo do mínimo (tabela e/ou produto). */
export function applySellerDiscountWithMinPrice(params: {
  catalogUnitPrice: number;
  discountPercent?: number;
  minPrice?: number | null;
}): MinPriceCheckResult {
  const catalog = roundMoney(Math.max(0, params.catalogUnitPrice));
  const min =
    params.minPrice != null && Number.isFinite(params.minPrice)
      ? roundMoney(params.minPrice)
      : null;
  const disc = Math.min(100, Math.max(0, params.discountPercent ?? 0));
  const unitPrice =
    disc > 0 ? roundMoney(catalog * (1 - disc / 100)) : catalog;

  if (min != null && catalog + 1e-9 < min) {
    return { ok: false, message: PRICE_BELOW_MIN_MESSAGE };
  }
  if (min != null && unitPrice + 1e-9 < min) {
    return { ok: false, message: discountExceedsMinMessage(min) };
  }
  return { ok: true, unitPrice };
}

export function pickDefaultPriceTableId(params: {
  allowedTableIds: string[];
  customerDefaultId?: string | null;
  sellerDefaultId?: string | null;
}): string | null {
  const allowed = new Set(params.allowedTableIds);
  if (params.customerDefaultId && allowed.has(params.customerDefaultId)) {
    return params.customerDefaultId;
  }
  if (params.sellerDefaultId && allowed.has(params.sellerDefaultId)) {
    return params.sellerDefaultId;
  }
  if (params.allowedTableIds.length === 1) return params.allowedTableIds[0]!;
  return null;
}

export type PriceTableSnapshot = {
  id: string;
  name: string;
  status: PriceTableStatus;
  validFrom?: string | Date | null;
  validTo?: string | Date | null;
  adjustmentKind: PriceAdjustmentKind;
  adjustmentMode: PriceAdjustmentMode;
  adjustmentValue: number;
  customerId?: string | null;
  sellerId?: string | null;
  regionId?: string | null;
  items: Array<{
    productId: string;
    useCustomPrice: boolean;
    price: number | null;
    minPrice: number | null;
  }>;
  qtyTiers: Array<{
    productId: string;
    minQuantity: number;
    price: number;
  }>;
};

export type CustomerSpecialPriceSnapshot = {
  customerId: string;
  productId: string;
  price: number;
  validFrom?: string | Date | null;
  validTo?: string | Date | null;
};

export type PricingSyncPayload = {
  tables: PriceTableSnapshot[];
  specialPrices: CustomerSpecialPriceSnapshot[];
  sellerDefaultPriceTableId: string | null;
};

export function tableToRuleInput(
  table: PriceTableSnapshot,
  productId: string,
): TableRuleInput {
  const item = table.items.find((i) => i.productId === productId) ?? null;
  return {
    id: table.id,
    name: table.name,
    adjustmentKind: table.adjustmentKind,
    adjustmentMode: table.adjustmentMode,
    adjustmentValue: table.adjustmentValue,
    item: item
      ? {
          useCustomPrice: item.useCustomPrice,
          price: item.price,
          minPrice: item.minPrice,
        }
      : null,
    qtyTiers: table.qtyTiers
      .filter((t) => t.productId === productId)
      .map((t) => ({ minQuantity: t.minQuantity, price: t.price })),
  };
}

export function resolveCatalogPriceFromSync(params: {
  basePrice: number;
  productId: string;
  quantity: number;
  at?: Date;
  table: PriceTableSnapshot | null;
  customerId?: string | null;
  specialPrices: CustomerSpecialPriceSnapshot[];
}): ResolvedCatalogPrice {
  const special = params.customerId
    ? params.specialPrices.find(
        (s) =>
          s.customerId === params.customerId &&
          s.productId === params.productId,
      )
    : undefined;
  return resolveCatalogPrice({
    basePrice: params.basePrice,
    quantity: params.quantity,
    at: params.at,
    table: params.table
      ? tableToRuleInput(params.table, params.productId)
      : null,
    customerSpecial: special
      ? {
          price: special.price,
          validFrom: special.validFrom ?? null,
          validTo: special.validTo ?? null,
        }
      : null,
  });
}

export function filterUsableTables(
  tables: PriceTableSnapshot[],
  ctx: {
    at?: Date;
    customerId?: string | null;
    sellerId?: string | null;
    regionId?: string | null;
    allowedTableIds?: string[] | null;
  },
): PriceTableSnapshot[] {
  const at = ctx.at ?? new Date();
  const allowed =
    ctx.allowedTableIds && ctx.allowedTableIds.length > 0
      ? new Set(ctx.allowedTableIds)
      : null;
  return tables.filter((t) => {
    if (!isPriceTableUsable(t, at)) return false;
    if (allowed && !allowed.has(t.id)) return false;
    return tableMatchesScope(t, ctx);
  });
}
