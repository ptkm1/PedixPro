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
  /** Quantidade da linha — promoções com `minQuantity` só entram se couber. */
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

function priceTableSpecificity(t: {
  customerId: string | null;
  sellerId: string | null;
  regionId: string | null;
}): number {
  return (t.customerId ? 1 : 0) + (t.sellerId ? 1 : 0) + (t.regionId ? 1 : 0);
}

function sortPriceTablesByCommercialRank<
  T extends {
    customerId: string | null;
    sellerId: string | null;
    regionId: string | null;
    priority: number;
    updatedAt: Date;
  },
>(tables: T[]): T[] {
  return [...tables].sort((a, b) => {
    const sp = priceTableSpecificity(b) - priceTableSpecificity(a);
    if (sp !== 0) return sp;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}

/** Where Prisma das tabelas aplicáveis ao contexto comercial (cliente/vendedor/região + vigência). */
export function applicablePriceTablesWhere(
  organizationId: string,
  ctx: Pick<PriceResolutionContext, "sellerId" | "customerId" | "regionId" | "at">,
) {
  const at = ctx.at ?? new Date();
  const customerOk =
    ctx.customerId != null
      ? { OR: [{ customerId: null }, { customerId: ctx.customerId }] }
      : { customerId: null };

  const sellerOk =
    ctx.sellerId != null
      ? { OR: [{ sellerId: null }, { sellerId: ctx.sellerId }] }
      : { sellerId: null };

  const regionOk =
    ctx.regionId != null
      ? { OR: [{ regionId: null }, { regionId: ctx.regionId }] }
      : { regionId: null };

  return {
    organizationId,
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: at } }] },
      { OR: [{ validTo: null }, { validTo: { gte: at } }] },
      customerOk,
      sellerOk,
      regionOk,
    ],
  };
}

export type ApplicablePriceTableRow = {
  id: string;
  name: string;
  priority: number;
  customerId: string | null;
  sellerId: string | null;
  regionId: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  updatedAt: Date;
};

/** Lista tabelas vigentes e no escopo comercial do contexto (sem exigir item de produto). */
export async function listApplicablePriceTables(
  organizationId: string,
  ctx: Pick<PriceResolutionContext, "sellerId" | "customerId" | "regionId" | "at"> = {},
): Promise<ApplicablePriceTableRow[]> {
  const tables = await prisma.priceTable.findMany({
    where: applicablePriceTablesWhere(organizationId, ctx),
    select: {
      id: true,
      name: true,
      priority: true,
      customerId: true,
      sellerId: true,
      regionId: true,
      validFrom: true,
      validTo: true,
      updatedAt: true,
    },
  });
  return sortPriceTablesByCommercialRank(tables);
}

/**
 * Garante que a tabela existe na org, está no escopo comercial e (se productId) tem preço do produto.
 * Usado quando o cliente força `priceTableId` — não confiar só em membership da org.
 */
export async function assertPriceTableApplicableForSale(params: {
  organizationId: string;
  priceTableId: string;
  productId?: string;
  ctx: Pick<PriceResolutionContext, "sellerId" | "customerId" | "regionId" | "at">;
}): Promise<void> {
  const table = await prisma.priceTable.findFirst({
    where: {
      id: params.priceTableId,
      ...applicablePriceTablesWhere(params.organizationId, params.ctx),
    },
    select: { id: true, name: true },
  });
  if (!table) {
    throw new Error(
      "Tabela de preço inválida ou fora do escopo comercial desta operação.",
    );
  }
  if (params.productId) {
    const item = await prisma.priceTableItem.findFirst({
      where: { priceTableId: table.id, productId: params.productId },
      select: { id: true },
    });
    if (!item) {
      throw new Error(
        `Tabela «${table.name}» não possui preço para o produto selecionado.`,
      );
    }
  }
}

export type ProductPriceTableOption = {
  priceTableId: string;
  name: string;
  priority: number;
  catalogUnitPrice: number;
  effectiveUnitPrice: number;
  promotionLabel: string | null;
};

/**
 * Tabelas aplicáveis à operação que têm preço válido para o produto (com promoções).
 * Uma query de itens em lote — sem N+1 por tabela.
 */
export async function listProductPriceTableOptions(
  organizationId: string,
  productId: string,
  ctx: PriceResolutionContext = {},
): Promise<ProductPriceTableOption[]> {
  const tables = await listApplicablePriceTables(organizationId, ctx);
  if (!tables.length) return [];

  const items = await prisma.priceTableItem.findMany({
    where: {
      productId,
      priceTableId: { in: tables.map((t) => t.id) },
    },
    select: { priceTableId: true, price: true },
  });
  if (!items.length) return [];

  const itemByTable = new Map(items.map((i) => [i.priceTableId, i]));
  const out: ProductPriceTableOption[] = [];

  for (const t of tables) {
    if (!itemByTable.has(t.id)) continue;
    const priced = await resolveEffectiveUnitPrice(organizationId, productId, {
      ...ctx,
      priceTableId: t.id,
    });
    out.push({
      priceTableId: t.id,
      name: t.name,
      priority: t.priority,
      catalogUnitPrice: priced.catalogUnitPrice,
      effectiveUnitPrice: priced.effectiveUnitPrice,
      promotionLabel: priced.promotionLabel,
    });
  }

  return out;
}

/**
 * Catálogo por produto: escolhe a melhor `PriceTable` aplicável ao contexto (cliente > vendedor > região > global),
 * depois prioridade da tabela; senão `basePrice`.
 */
export async function resolveCatalogUnitPrice(
  organizationId: string,
  productId: string,
  ctx: PriceResolutionContext = {},
): Promise<number> {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
  });
  if (!product) throw new Error("Produto não encontrado");

  if (ctx.priceTableId) {
    const table = await prisma.priceTable.findFirst({
      where: {
        id: ctx.priceTableId,
        ...applicablePriceTablesWhere(organizationId, ctx),
      },
      select: { id: true },
    });
    if (table) {
      const forced = await prisma.priceTableItem.findFirst({
        where: { priceTableId: table.id, productId },
      });
      if (forced) return decToNum(forced.price);
    }
    // Tabela forçada inválida/sem item: cai no ranking automático (compat).
  }

  const tables = await listApplicablePriceTables(organizationId, ctx);

  if (tables.length) {
    const ids = tables.map((t) => t.id);
    const items = await prisma.priceTableItem.findMany({
      where: { productId, priceTableId: { in: ids } },
    });
    const itemByTable = new Map(items.map((i) => [i.priceTableId, i]));
    for (const t of tables) {
      const row = itemByTable.get(t.id);
      if (row) return decToNum(row.price);
    }
  }

  return decToNum(product.basePrice);
}

export type EffectivePriceResult = {
  catalogUnitPrice: number;
  effectiveUnitPrice: number;
  promotionId: string | null;
  promotionLabel: string | null;
};

/**
 * Preço por unidade após promoções aplicáveis.
 * Prioridade: escopo mais específico (cliente > vendedor > produto geral), depois `priority` maior.
 * Apenas uma promoção vencedora por linha; considera `minQuantity` quando definido.
 */
export async function resolveEffectiveUnitPrice(
  organizationId: string,
  productId: string,
  opts: PriceResolutionContext = {},
): Promise<EffectivePriceResult> {
  const catalogUnitPrice = await resolveCatalogUnitPrice(organizationId, productId, opts);
  const at = opts.at ?? new Date();
  const qty = opts.quantity ?? 1;

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
      catalogUnitPrice,
      effectiveUnitPrice: catalogUnitPrice,
      promotionId: null,
      promotionLabel: null,
    };
  }

  const effectiveUnitPrice = applyPromotionKind(
    catalogUnitPrice,
    winner.kind,
    decToNum(winner.value),
  );

  return {
    catalogUnitPrice,
    effectiveUnitPrice,
    promotionId: winner.id,
    promotionLabel: winner.label,
  };
}

/** @deprecated Prefer `resolveCatalogUnitPrice` ou `resolveEffectiveUnitPrice` com contexto. */
export async function resolveUnitPrice(organizationId: string, productId: string): Promise<number> {
  const r = await resolveEffectiveUnitPrice(organizationId, productId, {});
  return r.effectiveUnitPrice;
}
