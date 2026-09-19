import { combinedMinPrice } from "./pricing";
import type { CartLine, SaleProduct } from "./types";

export const DISCOUNT_CHIP_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

export const LAST_CUSTOMER_STORAGE_KEY = "pedidos_last_customer_id";

/** Segundo toque no mesmo produto dentro deste tempo → adiciona 2 unidades. */
export const PRODUCT_DOUBLE_TAP_MS = 280;

export function discountStepsForMax(maxPct: number): number[] {
  const m = Math.min(100, Math.max(0, maxPct));
  const xs = DISCOUNT_CHIP_STEPS.filter((x) => x <= m + 1e-9);
  return xs.length ? [...xs] : [0];
}

export function effectiveMaxDiscountForProduct(p: SaleProduct): number {
  return typeof p.maxSellerDiscountPercentEffective === "number"
    ? p.maxSellerDiscountPercentEffective
    : 50;
}

export function cartLineTotal(line: CartLine): number {
  const unit = line.effectiveUnitPrice * (1 - line.discountPercent / 100);
  return Math.round(unit * line.qty * 100) / 100;
}

export function syncCartLinesWithProducts(
  cart: Record<string, CartLine>,
  products: SaleProduct[],
): Record<string, CartLine> {
  let changed = false;
  const next: Record<string, CartLine> = { ...cart };
  for (const id of Object.keys(next)) {
    const p = products.find((x) => x.id === id);
    if (!p || typeof p.effectiveUnitPrice !== "number") continue;
    const line = next[id];
    const nu = p.effectiveUnitPrice;
    const nc = typeof p.catalogUnitPrice === "number" ? p.catalogUnitPrice : line.catalogUnitPrice;
    const nl = p.promotionLabel ?? null;
    const effMax = effectiveMaxDiscountForProduct(p);
    const cappedDisc = Math.min(line.discountPercent, Math.max(...discountStepsForMax(effMax)));
    const snappedDisc = [...discountStepsForMax(effMax)].filter((x) => x <= cappedDisc).pop() ?? 0;
    if (
      line.effectiveUnitPrice !== nu ||
      line.catalogUnitPrice !== nc ||
      line.promotionLabel !== nl ||
      line.maxSellerDiscountPercent !== effMax ||
      line.discountPercent !== snappedDisc
    ) {
      next[id] = {
        ...line,
        effectiveUnitPrice: nu,
        catalogUnitPrice: nc,
        promotionLabel: nl,
        maxSellerDiscountPercent: effMax,
        discountPercent: snappedDisc,
      };
      changed = true;
    }
  }
  return changed ? next : cart;
}

export function bumpCartQty(
  cart: Record<string, CartLine>,
  p: SaleProduct,
  delta: number,
): Record<string, CartLine> {
  const effective = typeof p.effectiveUnitPrice === "number" ? p.effectiveUnitPrice : null;
  if (effective === null && delta > 0) return cart;

  const cur = cart[p.id];
  const unit = effective ?? cur?.effectiveUnitPrice ?? 0;
  const maxDisc = effectiveMaxDiscountForProduct(p);
  const nextQty = (cur?.qty ?? 0) + delta;
  if (nextQty <= 0) {
    const { [p.id]: _, ...rest } = cart;
    return rest;
  }
  const prevDisc = cur?.discountPercent ?? 0;
  const capped = Math.min(prevDisc, Math.max(...discountStepsForMax(maxDisc)));
  const snapped = [...discountStepsForMax(maxDisc)].filter((x) => x <= capped).pop() ?? 0;
  return {
    ...cart,
    [p.id]: {
      productId: p.id,
      name: p.name,
      sku: p.sku ?? null,
      qty: nextQty,
      effectiveUnitPrice: unit,
      catalogUnitPrice: typeof p.catalogUnitPrice === "number" ? p.catalogUnitPrice : undefined,
      promotionLabel: p.promotionLabel ?? null,
      discountPercent: snapped,
      maxSellerDiscountPercent: maxDisc,
      priceOriginLabel: p.priceOriginLabel ?? cur?.priceOriginLabel ?? null,
      minPrice:
        combinedMinPrice(
          p.tableMinPrice,
          p.minSaleUnitPrice != null ? Number(p.minSaleUnitPrice) : null,
        ) ?? cur?.minPrice ?? null,
    },
  };
}

export function cycleCartLineDiscount(cart: Record<string, CartLine>, productId: string): Record<string, CartLine> {
  const line = cart[productId];
  if (!line) return cart;
  const steps = discountStepsForMax(line.maxSellerDiscountPercent);
  const i = steps.indexOf(line.discountPercent);
  const idx = i === -1 ? 0 : (i + 1) % steps.length;
  return { ...cart, [productId]: { ...line, discountPercent: steps[idx] } };
}
