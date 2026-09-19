import {
  commissionAmountFromPercent,
  resolveSyncedProductCommission,
  type CommissionOrigin,
  type SellerCommissionType,
} from "@pedidos/shared";
import type { CartLine, SaleProduct } from "./types";
import { cartLineTotal } from "./cart";

export function resolveOfflineLineCommission(params: {
  product: SaleProduct;
  sellerType: SellerCommissionType;
  sellerDefaultPercent: number;
  priceTableId?: string | null;
  lineTotal: number;
}): { percent: number; origin: CommissionOrigin; amount: number } {
  const sync = params.product.commissionSync ?? {
    productId: params.product.id,
    productDefaultPercent:
      params.product.commissionPercent != null
        ? Number(params.product.commissionPercent)
        : null,
    groupPercent: params.product.category
      ? Number(
          (params.product.category as { commissionPercent?: unknown })
            .commissionPercent ?? NaN,
        )
      : null,
    sellerProductPercent: null,
    priceTablePercents: [],
  };
  const groupPercent =
    sync.groupPercent != null && Number.isFinite(sync.groupPercent)
      ? sync.groupPercent
      : null;
  const resolved = resolveSyncedProductCommission({
    product: { ...sync, groupPercent },
    sellerType: params.sellerType,
    sellerDefaultPercent: params.sellerDefaultPercent,
    priceTableId:
      params.priceTableId ?? params.product.resolvedPriceTableId ?? null,
  });
  return {
    percent: resolved.percent,
    origin: resolved.origin,
    amount: commissionAmountFromPercent(params.lineTotal, resolved.percent),
  };
}

export function cartCommissionTotal(params: {
  lines: CartLine[];
  products: SaleProduct[];
  sellerType: SellerCommissionType;
  sellerDefaultPercent: number;
  priceTableId?: string | null;
}): number {
  const byId = new Map(params.products.map((p) => [p.id, p]));
  return params.lines.reduce((sum, line) => {
    const product = byId.get(line.productId);
    if (!product) return sum;
    const { amount } = resolveOfflineLineCommission({
      product,
      sellerType: params.sellerType,
      sellerDefaultPercent: params.sellerDefaultPercent,
      priceTableId: params.priceTableId,
      lineTotal: cartLineTotal(line),
    });
    return sum + amount;
  }, 0);
}
