import {
  applyTableAdjustment,
  isPriceTableUsable,
  isWithinDateWindow,
  PRICE_ORIGIN_KIND,
  priceTableSpecificity,
  resolveCatalogPrice,
  type PriceAdjustmentKind,
  type PriceAdjustmentMode,
  type PriceOriginKind,
  type ResolvedCatalogPrice,
  type TableRuleInput,
} from "@pedidos/shared";
import type { PromotionKind, PromotionScope } from "@prisma/client";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";

/** Contexto para catálogo + promoções (região vem do cliente da venda). */
export type PriceResolutionContext = {
  sellerId?: string | null;
  customerId?: string | null;
  regionId?: string | null;
  /** Quando informado, usa esta tabela em vez do ranking automático. */
  priceTableId?: string | null;
  /** Quantidade da linha — faixas e promoções com `minQuantity`. */
  quantity?: number;
  at?: Date;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function promotionActiveAt(validFrom: Date | null, validTo: Date | null, at: Date): boolean {
  if (validFrom && at < validFrom) return false;
  if (validTo && at > validTo) return false;
  return true;
}

function scopeRank(scope: PromotionScope): number {
  switch (scope) {
    case "CUSTOMER":
      return 4;
    case "SELLER":
      return 3;
    case "PRODUCT_GLOBAL":
      return 2;
    default:
      return 0;
  }
}

function applyPromotionKind(catalog: number, kind: PromotionKind, value: number): number {
  switch (kind) {
    case "PERCENT_OFF":
      return roundMoney(Math.max(0, catalog * (1 - value / 100)));
    case "FIXED_AMOUNT_OFF":
      return roundMoney(Math.max(0, catalog - value));
    case "SALE_PRICE":
      return roundMoney(Math.max(0, value));
    default:
      return catalog;
  }
}

type TableRow = {
  id: string;
  name: string;
  status: string;
  validFrom: Date | null;
  validTo: Date | null;
  adjustmentKind: PriceAdjustmentKind;
  adjustmentMode: PriceAdjustmentMode;
  adjustmentValue: unknown;
  customerId: string | null;
  sellerId: string | null;
  regionId: string | null;
  priority: number;
  updatedAt: Date;
};

function toRuleInput(
  table: TableRow,
  item: {
    useCustomPrice: boolean;
    price: unknown;
    minPrice: unknown;
  } | null,
  qtyTiers: Array<{ minQuantity: number; price: unknown }>,
): TableRuleInput {
  return {
    id: table.id,
    name: table.name,
    adjustmentKind: table.adjustmentKind,
    adjustmentMode: table.adjustmentMode,
    adjustmentValue: decToNum(table.adjustmentValue),
    item: item
      ? {
          useCustomPrice: item.useCustomPrice,
          price: item.price != null ? decToNum(item.price) : null,
          minPrice: item.minPrice != null ? decToNum(item.minPrice) : null,
        }
      : null,
    qtyTiers: qtyTiers.map((t) => ({
      minQuantity: t.minQuantity,
      price: decToNum(t.price),
    })),
  };
}

function tableWouldApply(
  table: TableRow,
  item: { useCustomPrice: boolean; price: unknown } | null,
  qtyTiers: Array<{ minQuantity: number }>,
): boolean {
  if (qtyTiers.length > 0) return true;
  if (item?.useCustomPrice && item.price != null) return true;
  return decToNum(table.adjustmentValue) > 0;
}

async function loadSpecial(params: {
  organizationId: string;
  productId: string;
  customerId?: string | null;
}) {
  if (!params.customerId) return null;
  const row = await prisma.customerSpecialPrice.findFirst({
    where: {
      organizationId: params.organizationId,
      customerId: params.customerId,
      productId: params.productId,
    },
  });
  if (!row) return null;
  return {
    price: decToNum(row.price),
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

async function loadTableRule(
  table: TableRow,
  productId: string,
): Promise<TableRuleInput> {
  const [item, qtyTiers] = await Promise.all([
    prisma.priceTableItem.findFirst({
      where: { priceTableId: table.id, productId },
    }),
    prisma.priceTableQtyTier.findMany({
      where: { priceTableId: table.id, productId },
    }),
  ]);
  return toRuleInput(table, item, qtyTiers);
}

async function pickLegacyTable(
  organizationId: string,
  productId: string,
  ctx: PriceResolutionContext,
  at: Date,
): Promise<TableRow | null> {
  const customerOk =
    ctx.customerId != null
      ? { OR: [{ customerId: null }, { customerId: ctx.customerId }] }
      : { customerId: null };
  const sellerOk =
    ctx.sellerId != null ? { OR: [{ sellerId: null }, { sellerId: ctx.sellerId }] } : { sellerId: null };
  const regionOk =
    ctx.regionId != null ? { OR: [{ regionId: null }, { regionId: ctx.regionId }] } : { regionId: null };

  const tables = (await prisma.priceTable.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
        { OR: [{ validTo: null }, { validTo: { gte: at } }] },
        customerOk,
        sellerOk,
        regionOk,
      ],
    },
  })) as TableRow[];

  tables.sort((a, b) => {
    const sp = priceTableSpecificity(b) - priceTableSpecificity(a);
    if (sp !== 0) return sp;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  if (!tables.length) return null;

  const ids = tables.map((t) => t.id);
  const [items, tiers] = await Promise.all([
    prisma.priceTableItem.findMany({
      where: { productId, priceTableId: { in: ids } },
    }),
    prisma.priceTableQtyTier.findMany({
      where: { productId, priceTableId: { in: ids } },
    }),
  ]);
  const itemByTable = new Map(items.map((i) => [i.priceTableId, i]));
  const tiersByTable = new Map<string, typeof tiers>();
  for (const t of tiers) {
    const list = tiersByTable.get(t.priceTableId) ?? [];
    list.push(t);
    tiersByTable.set(t.priceTableId, list);
  }

  for (const table of tables) {
    if (
      tableWouldApply(
        table,
        itemByTable.get(table.id) ?? null,
        tiersByTable.get(table.id) ?? [],
      )
    ) {
      return table;
    }
  }
  return null;
}

export type CatalogPriceResult = ResolvedCatalogPrice & {
  catalogUnitPrice: number;
};

/**
 * Catálogo por produto: preço especial > faixa > override > regra da tabela > base.
 * Sem `priceTableId`, mantém o ranking legado (cliente > vendedor > região > global).
 */
export async function resolveCatalogUnitPriceDetailed(
  organizationId: string,
  productId: string,
  ctx: PriceResolutionContext = {},
): Promise<CatalogPriceResult> {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
  });
  if (!product) throw new Error("Produto não encontrado");

  const at = ctx.at ?? new Date();
  const quantity = ctx.quantity ?? 1;
  const special = await loadSpecial({
    organizationId,
    productId,
    customerId: ctx.customerId,
  });

  let table: TableRow | null = null;
  if (ctx.priceTableId) {
    const found = await prisma.priceTable.findFirst({
      where: { id: ctx.priceTableId, organizationId },
    });
    if (found) table = found as TableRow;
  } else {
    table = await pickLegacyTable(organizationId, productId, ctx, at);
  }

  const rule = table ? await loadTableRule(table, productId) : null;
  const resolved = resolveCatalogPrice({
    basePrice: decToNum(product.basePrice),
    quantity,
    at,
    table: rule,
    customerSpecial: special,
  });

  return { ...resolved, catalogUnitPrice: resolved.unitPrice };
}

export async function resolveCatalogUnitPrice(
  organizationId: string,
  productId: string,
  ctx: PriceResolutionContext = {},
): Promise<number> {
  const r = await resolveCatalogUnitPriceDetailed(organizationId, productId, ctx);
  return r.catalogUnitPrice;
}

export type EffectivePriceResult = {
  catalogUnitPrice: number;
  effectiveUnitPrice: number;
  promotionId: string | null;
  promotionLabel: string | null;
  origin: PriceOriginKind;
  originLabel: string;
  minPrice: number | null;
  priceTableId: string | null;
  priceTableName: string | null;
};

/**
 * Preço por unidade após promoções aplicáveis.
 * Preço especial do cliente não é alterado por promoção.
 */
export async function resolveEffectiveUnitPrice(
  organizationId: string,
  productId: string,
  opts: PriceResolutionContext = {},
): Promise<EffectivePriceResult> {
  const catalog = await resolveCatalogUnitPriceDetailed(organizationId, productId, opts);
  const at = opts.at ?? new Date();
  const qty = opts.quantity ?? 1;

  if (catalog.origin === PRICE_ORIGIN_KIND.CUSTOMER_SPECIAL) {
    return {
      catalogUnitPrice: catalog.catalogUnitPrice,
      effectiveUnitPrice: catalog.catalogUnitPrice,
      promotionId: null,
      promotionLabel: null,
      origin: catalog.origin,
      originLabel: catalog.originLabel,
      minPrice: catalog.minPrice,
      priceTableId: catalog.priceTableId,
      priceTableName: catalog.priceTableName,
    };
  }

  const rows = await prisma.productPromotion.findMany({
    where: {
      organizationId,
      productId,
      active: true,
      OR: [
        { scope: "PRODUCT_GLOBAL" },
        ...(opts.sellerId ? [{ scope: "SELLER" as const, sellerId: opts.sellerId }] : []),
        ...(opts.customerId ? [{ scope: "CUSTOMER" as const, customerId: opts.customerId }] : []),
      ],
    },
  });

  const applicable = rows.filter(
    (r) =>
      promotionActiveAt(r.validFrom, r.validTo, at) &&
      (r.minQuantity == null || qty >= r.minQuantity),
  );

  applicable.sort((a, b) => {
    const sr = scopeRank(b.scope) - scopeRank(a.scope);
    if (sr !== 0) return sr;
    return b.priority - a.priority;
  });

  const winner = applicable[0];
  if (!winner) {
    return {
      catalogUnitPrice: catalog.catalogUnitPrice,
      effectiveUnitPrice: catalog.catalogUnitPrice,
      promotionId: null,
      promotionLabel: null,
      origin: catalog.origin,
      originLabel: catalog.originLabel,
      minPrice: catalog.minPrice,
      priceTableId: catalog.priceTableId,
      priceTableName: catalog.priceTableName,
    };
  }

  const effectiveUnitPrice = applyPromotionKind(
    catalog.catalogUnitPrice,
    winner.kind,
    decToNum(winner.value),
  );

  return {
    catalogUnitPrice: catalog.catalogUnitPrice,
    effectiveUnitPrice,
    promotionId: winner.id,
    promotionLabel: winner.label,
    origin: catalog.origin,
    originLabel: catalog.originLabel,
    minPrice: catalog.minPrice,
    priceTableId: catalog.priceTableId,
    priceTableName: catalog.priceTableName,
  };
}

/** @deprecated Prefer `resolveCatalogUnitPrice` ou `resolveEffectiveUnitPrice` com contexto. */
export async function resolveUnitPrice(organizationId: string, productId: string): Promise<number> {
  const r = await resolveEffectiveUnitPrice(organizationId, productId, {});
  return r.effectiveUnitPrice;
}

export { applyTableAdjustment, isPriceTableUsable, isWithinDateWindow };
