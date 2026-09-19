import { apiFetch } from "./api";
import { getCachedSales } from "./offline-read-cache";
import type { CartLine } from "./sale/types";

/** Formato mínimo de pedido para pré-preencher a digitação. */
export type RepeatableSaleSource = {
  id: string;
  status: string;
  customerId?: string | null;
  paymentConditionId?: string | null;
  items: {
    productId?: string | null;
    productName?: string | null;
    quantity: number;
    unitPrice?: unknown;
  }[];
};

export type RepeatSalePrefill = {
  customerId?: string;
  paymentConditionId?: string;
  cart: Record<string, CartLine>;
};

/** Janela para o picker "Repetir venda" (calendário: 2 meses). */
export const REPEAT_SALE_LOOKBACK_MONTHS = 2;

export function repeatSaleLookbackSince(now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - REPEAT_SALE_LOOKBACK_MONTHS);
  return d;
}

/** Candidato a repetir (lista Home): confirmado com linhas. */
export function isRepeatSaleCandidate(
  order: RepeatableSaleSource | null | undefined,
): order is RepeatableSaleSource {
  if (!order) return false;
  if (order.status !== "CONFIRMED") return false;
  return order.items.length > 0;
}

/** Pode montar carrinho (precisa de productId nas linhas). */
export function isRepeatableSale(
  order: RepeatableSaleSource | null | undefined,
): order is RepeatableSaleSource {
  if (!isRepeatSaleCandidate(order)) return false;
  return order.items.some(
    (it) =>
      typeof it.productId === "string" &&
      it.productId.length > 0 &&
      it.quantity > 0,
  );
}

type WithCreatedAt = RepeatableSaleSource & { createdAt: string };

/** Pedidos confirmados nos últimos 2 meses (lista já ordenada por createdAt desc). */
export function listRepeatableSalesInLookback<T extends WithCreatedAt>(
  orders: T[],
  now: Date = new Date(),
): T[] {
  const sinceMs = repeatSaleLookbackSince(now).getTime();
  return orders.filter((order) => {
    if (!isRepeatSaleCandidate(order)) return false;
    const createdMs = new Date(order.createdAt).getTime();
    return Number.isFinite(createdMs) && createdMs >= sinceMs;
  });
}

/** Pedido confirmado mais recente com itens (lista já ordenada por createdAt desc). */
export function findLatestRepeatableSale<T extends RepeatableSaleSource>(
  orders: T[],
): T | null {
  for (const order of orders) {
    if (isRepeatSaleCandidate(order)) return order;
  }
  return null;
}

export function buildCartFromRepeatSale(
  order: RepeatableSaleSource,
): Record<string, CartLine> {
  const cart: Record<string, CartLine> = {};
  for (const item of order.items) {
    if (typeof item.productId !== "string" || !item.productId) continue;
    if (!(item.quantity > 0)) continue;
    const existing = cart[item.productId];
    const qty = (existing?.qty ?? 0) + item.quantity;
    const unit =
      typeof item.unitPrice === "number"
        ? item.unitPrice
        : Number(item.unitPrice);
    cart[item.productId] = {
      productId: item.productId,
      name: item.productName?.trim() || existing?.name || "Produto",
      sku: existing?.sku ?? null,
      qty,
      effectiveUnitPrice: Number.isFinite(unit)
        ? unit
        : (existing?.effectiveUnitPrice ?? 0),
      discountPercent: 0,
      maxSellerDiscountPercent: existing?.maxSellerDiscountPercent ?? 0,
    };
  }
  return cart;
}

export function buildRepeatSalePrefill(
  order: RepeatableSaleSource,
): RepeatSalePrefill | null {
  if (!isRepeatableSale(order)) return null;
  const cart = buildCartFromRepeatSale(order);
  if (Object.keys(cart).length === 0) return null;
  return {
    customerId: order.customerId ?? undefined,
    paymentConditionId: order.paymentConditionId ?? undefined,
    cart,
  };
}

/**
 * Resolve pedido para repetir: detalhe online → cache da lista de vendas.
 */
export async function resolveRepeatSaleSource(
  orderId: string,
): Promise<RepeatableSaleSource | null> {
  try {
    const remote = await apiFetch<RepeatableSaleSource>(
      `/seller/sales/${orderId}`,
    );
    if (remote?.id) return remote;
  } catch {
    /* offline / rede — tenta cache */
  }

  const cached = await getCachedSales<RepeatableSaleSource>();
  return cached.find((o) => o.id === orderId) ?? null;
}
