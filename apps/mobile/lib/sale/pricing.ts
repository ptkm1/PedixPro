import {
  applySellerDiscountWithMinPrice,
  filterUsableTables,
  resolveCatalogPriceFromSync,
  type PriceTableSnapshot,
  type PricingSyncPayload,
} from "@pedidos/shared";
import type { CartLine, SaleProduct } from "./types";

export function saleProductBasePrice(p: SaleProduct): number {
  const n = Number(p.basePrice);
  if (Number.isFinite(n) && n > 0) return n;
  if (typeof p.catalogUnitPrice === "number" && Number.isFinite(p.catalogUnitPrice)) {
    return p.catalogUnitPrice;
  }
  if (typeof p.effectiveUnitPrice === "number" && Number.isFinite(p.effectiveUnitPrice)) {
    return p.effectiveUnitPrice;
  }
  return 0;
}

export function combinedMinPrice(
  tableMin: number | null | undefined,
  productMin: number | null | undefined,
): number | null {
  const a =
    tableMin != null && Number.isFinite(tableMin) ? tableMin : null;
  const b =
    productMin != null && Number.isFinite(productMin) ? productMin : null;
  if (a != null && b != null) return Math.max(a, b);
  return a ?? b;
}

export function pickSyncTable(
  pricing: PricingSyncPayload | null | undefined,
  priceTableId?: string | null,
): PriceTableSnapshot | null {
  if (!pricing || !priceTableId) return null;
  return pricing.tables.find((t) => t.id === priceTableId) ?? null;
}

export function usablePriceTables(
  pricing: PricingSyncPayload | null | undefined,
  ctx: {
    customerId?: string | null;
    sellerId?: string | null;
    regionId?: string | null;
  },
): PriceTableSnapshot[] {
  if (!pricing) return [];
  return filterUsableTables(pricing.tables, ctx);
}

/** Recalcula catálogo local com o resolver compartilhado (offline = web/API). */
export function resolveProductForQty(
  p: SaleProduct,
  quantity: number,
  params: {
    pricing?: PricingSyncPayload | null;
    customerId?: string | null;
    priceTableId?: string | null;
  },
): SaleProduct {
  const pricing = params.pricing;
  if (!pricing) return p;

  const table = pickSyncTable(pricing, params.priceTableId);
  const resolved = resolveCatalogPriceFromSync({
    basePrice: saleProductBasePrice(p),
    productId: p.id,
    quantity,
    table,
    customerId: params.customerId,
    specialPrices: pricing.specialPrices,
  });

  const keepOnlineEffective =
    resolved.origin !== "CUSTOMER_SPECIAL" &&
    resolved.origin !== "QTY_TIER" &&
    typeof p.effectiveUnitPrice === "number" &&
    (!params.priceTableId || p.resolvedPriceTableId === params.priceTableId);

  const unit = keepOnlineEffective ? p.effectiveUnitPrice! : resolved.unitPrice;
  return {
    ...p,
    catalogUnitPrice: resolved.unitPrice,
    effectiveUnitPrice: unit,
    priceOriginLabel: keepOnlineEffective
      ? (p.priceOriginLabel ?? resolved.originLabel)
      : resolved.originLabel,
    resolvedPriceTableId:
      resolved.priceTableId ?? params.priceTableId ?? p.resolvedPriceTableId,
    tableMinPrice: resolved.minPrice,
  };
}

export function overlayCatalogProducts(
  products: SaleProduct[],
  params: {
    pricing?: PricingSyncPayload | null;
    customerId?: string | null;
    priceTableId?: string | null;
  },
): SaleProduct[] {
  if (!params.pricing) return products;
  return products.map((p) => resolveProductForQty(p, 1, params));
}

export function repriceCartLines(
  cart: Record<string, CartLine>,
  products: SaleProduct[],
  params: {
    pricing?: PricingSyncPayload | null;
    customerId?: string | null;
    priceTableId?: string | null;
  },
): Record<string, CartLine> {
  let changed = false;
  const next: Record<string, CartLine> = { ...cart };
  for (const id of Object.keys(next)) {
    const line = next[id]!;
    const p = products.find((x) => x.id === id);
    if (!p) continue;
    const priced = resolveProductForQty(p, line.qty, params);
    if (typeof priced.effectiveUnitPrice !== "number") continue;
    const minPrice = combinedMinPrice(
      priced.tableMinPrice,
      priced.minSaleUnitPrice != null ? Number(priced.minSaleUnitPrice) : null,
    );
    const catalogUnit = line.priceOverridden
      ? line.effectiveUnitPrice
      : priced.effectiveUnitPrice;
    const discCheck = applySellerDiscountWithMinPrice({
      catalogUnitPrice: catalogUnit,
      discountPercent: line.discountPercent,
      minPrice,
    });
    const discountPercent = discCheck.ok ? line.discountPercent : 0;
    const nextUnit = line.priceOverridden
      ? line.effectiveUnitPrice
      : priced.effectiveUnitPrice;
    const nextCatalog = line.priceOverridden
      ? line.catalogUnitPrice
      : priced.catalogUnitPrice;
    const nextOrigin = line.priceOverridden
      ? (line.priceOriginLabel ?? "Preço ajustado")
      : (priced.priceOriginLabel ?? null);
    if (
      line.effectiveUnitPrice !== nextUnit ||
      line.catalogUnitPrice !== nextCatalog ||
      line.priceOriginLabel !== nextOrigin ||
      line.minPrice !== minPrice ||
      line.discountPercent !== discountPercent
    ) {
      next[id] = {
        ...line,
        effectiveUnitPrice: nextUnit,
        catalogUnitPrice: nextCatalog,
        promotionLabel: priced.promotionLabel ?? line.promotionLabel,
        priceOriginLabel: nextOrigin,
        minPrice,
        discountPercent,
      };
      changed = true;
    }
  }
  return changed ? next : cart;
}
