import type { CartLine, SaleProduct } from "./types";

export const DISCOUNT_CHIP_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

export const LAST_CUSTOMER_STORAGE_KEY = "pedidos_last_customer_id";

/** Segundo toque no mesmo produto dentro deste tempo → adiciona 2 unidades. */
export const PRODUCT_DOUBLE_TAP_MS = 280;

export function discountStepsForMax(maxPct: number): number[] {
  const m = Math.min(100, Math.max(0, maxPct));
  const xs: number[] = DISCOUNT_CHIP_STEPS.filter((x) => x <= m + 1e-9);
  if (m > 0 && !xs.some((x) => Math.abs(x - m) < 1e-9)) {
    xs.push(Math.round(m * 1000) / 1000);
    xs.sort((a, b) => a - b);
  }
  return xs.length ? xs : [0];
}

/**
 * Teto de desconto do produto (efetivo da API → cadastro → default da org).
 * Sem metadado: 0 (não inventa 50% — evita bypass com cache antigo).
 */
export function effectiveMaxDiscountForProduct(
  p: SaleProduct,
  orgDefaultMax?: number | null,
): number {
  const fromEffective = Number(p.maxSellerDiscountPercentEffective);
  if (Number.isFinite(fromEffective) && fromEffective >= 0) {
    return Math.min(100, fromEffective);
  }
  const fromProduct = Number(p.maxSellerDiscountPercent);
  if (Number.isFinite(fromProduct) && fromProduct >= 0) {
    return Math.min(100, fromProduct);
  }
  const fromOrg = Number(orgDefaultMax);
  if (Number.isFinite(fromOrg) && fromOrg >= 0) {
    return Math.min(100, fromOrg);
  }
  return 0;
}

export function cartLineTotal(line: CartLine): number {
  const unit = line.effectiveUnitPrice * (1 - line.discountPercent / 100);
  return Math.round(unit * line.qty * 100) / 100;
}

export type BumpCartQtyOptions = {
  priceTableId?: string | null;
  priceTableName?: string | null;
  effectiveUnitPrice?: number;
  catalogUnitPrice?: number;
  promotionLabel?: string | null;
  orgDefaultMaxDiscount?: number | null;
};

export function syncCartLinesWithProducts(
  cart: Record<string, CartLine>,
  products: SaleProduct[],
  orgDefaultMaxDiscount?: number | null,
): Record<string, CartLine> {
  let changed = false;
  const next: Record<string, CartLine> = { ...cart };
  for (const id of Object.keys(next)) {
    const p = products.find((x) => x.id === id);
    if (!p) continue;
    const line = next[id];
    const keepTablePrice = Boolean(line.priceTableId);
    const nu =
      keepTablePrice || typeof p.effectiveUnitPrice !== "number"
        ? line.effectiveUnitPrice
        : p.effectiveUnitPrice;
    const nc = keepTablePrice
      ? line.catalogUnitPrice
      : typeof p.catalogUnitPrice === "number"
        ? p.catalogUnitPrice
        : line.catalogUnitPrice;
    const nl = keepTablePrice ? line.promotionLabel : (p.promotionLabel ?? null);
    const effMax = effectiveMaxDiscountForProduct(p, orgDefaultMaxDiscount);
    const steps = discountStepsForMax(effMax);
    const cappedDisc = Math.min(line.discountPercent, Math.max(...steps));
    const snappedDisc = [...steps].filter((x) => x <= cappedDisc).pop() ?? 0;
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
  opts?: BumpCartQtyOptions,
): Record<string, CartLine> {
  const cur = cart[p.id];
  const optedUnit =
    typeof opts?.effectiveUnitPrice === "number" ? opts.effectiveUnitPrice : null;
  const catalogFallback =
    typeof p.effectiveUnitPrice === "number" ? p.effectiveUnitPrice : null;
  const effective =
    optedUnit ?? (cur ? cur.effectiveUnitPrice : catalogFallback);
  if (effective === null && delta > 0) return cart;

  const maxDisc = effectiveMaxDiscountForProduct(p, opts?.orgDefaultMaxDiscount);
  const nextQty = (cur?.qty ?? 0) + delta;
  if (nextQty <= 0) {
    const { [p.id]: _, ...rest } = cart;
    return rest;
  }
  const prevDisc = cur?.discountPercent ?? 0;
  const steps = discountStepsForMax(maxDisc);
  const capped = Math.min(prevDisc, Math.max(...steps));
  const snapped = [...steps].filter((x) => x <= capped).pop() ?? 0;

  const isNewOrReprice = !cur || optedUnit != null;
  const unit = optedUnit ?? cur?.effectiveUnitPrice ?? effective ?? 0;
  const priceTableId = isNewOrReprice
    ? (opts?.priceTableId ?? null)
    : (cur?.priceTableId ?? null);
  const priceTableName = isNewOrReprice
    ? (opts?.priceTableName ?? null)
    : (cur?.priceTableName ?? null);
  const promotionLabel = isNewOrReprice
    ? (opts?.promotionLabel ?? p.promotionLabel ?? null)
    : (cur?.promotionLabel ?? p.promotionLabel ?? null);
  const catalogUnitPrice =
    typeof opts?.catalogUnitPrice === "number"
      ? opts.catalogUnitPrice
      : isNewOrReprice && typeof p.catalogUnitPrice === "number"
        ? p.catalogUnitPrice
        : cur?.catalogUnitPrice;

  return {
    ...cart,
    [p.id]: {
      productId: p.id,
      name: p.name,
      sku: p.sku ?? null,
      qty: nextQty,
      effectiveUnitPrice: unit,
      catalogUnitPrice,
      promotionLabel,
      discountPercent: snapped,
      maxSellerDiscountPercent: maxDisc,
      priceTableId,
      priceTableName,
    },
  };
}

/** Aplica desconto no ciclo de chips; nunca ultrapassa o máx. do produto. */
export function cycleCartLineDiscount(
  cart: Record<string, CartLine>,
  productId: string,
): { cart: Record<string, CartLine>; hitMax: boolean; maxPct: number } {
  const line = cart[productId];
  if (!line) return { cart, hitMax: false, maxPct: 0 };
  const maxPct = Math.max(0, line.maxSellerDiscountPercent);
  const steps = discountStepsForMax(maxPct);
  const i = steps.indexOf(line.discountPercent);
  const idx = i === -1 ? 0 : (i + 1) % steps.length;
  const nextPct = steps[idx] ?? 0;
  const wasAtMax = maxPct > 0 && line.discountPercent >= maxPct - 1e-9;
  const wrappingToZero = nextPct === 0 && line.discountPercent > 0;
  const hitMax = wasAtMax && wrappingToZero;
  return {
    cart: { ...cart, [productId]: { ...line, discountPercent: nextPct } },
    hitMax,
    maxPct,
  };
}
