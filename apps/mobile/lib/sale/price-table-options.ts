import type { ProductPriceTableOption } from "./types";

export type CachedPriceTable = {
  id: string;
  name: string;
  priority: number;
  customerId: string | null;
  sellerId: string | null;
  regionId: string | null;
  validFrom: string | null;
  validTo: string | null;
  updatedAt: string;
  items: Array<{ productId: string; price: number }>;
};

function priceTableSpecificity(t: {
  customerId: string | null;
  sellerId: string | null;
  regionId: string | null;
}): number {
  return (t.customerId ? 1 : 0) + (t.sellerId ? 1 : 0) + (t.regionId ? 1 : 0);
}

function isTableValidAt(t: CachedPriceTable, at: Date): boolean {
  if (t.validFrom && new Date(t.validFrom).getTime() > at.getTime()) return false;
  if (t.validTo && new Date(t.validTo).getTime() < at.getTime()) return false;
  return true;
}

/**
 * Filtra tabelas sincronizadas com a mesma regra comercial do servidor
 * (cliente / vendedor / região + vigência + item do produto).
 */
export function filterCachedPriceOptionsForProduct(params: {
  tables: CachedPriceTable[];
  productId: string;
  customerId: string | null | undefined;
  regionId?: string | null;
  sellerId?: string | null;
  at?: Date;
}): ProductPriceTableOption[] {
  const at = params.at ?? new Date();
  const applicable = params.tables.filter((t) => {
    if (!isTableValidAt(t, at)) return false;
    if (params.customerId) {
      if (t.customerId && t.customerId !== params.customerId) return false;
    } else if (t.customerId) {
      return false;
    }
    if (params.sellerId) {
      if (t.sellerId && t.sellerId !== params.sellerId) return false;
    } else if (t.sellerId) {
      return false;
    }
    if (params.regionId) {
      if (t.regionId && t.regionId !== params.regionId) return false;
    } else if (t.regionId) {
      return false;
    }
    return t.items.some((i) => i.productId === params.productId);
  });

  applicable.sort((a, b) => {
    const sp = priceTableSpecificity(b) - priceTableSpecificity(a);
    if (sp !== 0) return sp;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return applicable.map((t) => {
    const item = t.items.find((i) => i.productId === params.productId)!;
    const price = item.price;
    return {
      priceTableId: t.id,
      name: t.name,
      priority: t.priority,
      catalogUnitPrice: price,
      effectiveUnitPrice: price,
      promotionLabel: null,
    };
  });
}
