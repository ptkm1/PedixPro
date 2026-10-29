/** Filtro de query: pedidos sem vendedor (venda direta). */
export const ORDER_SELLER_FILTER_DIRECT = "__direct__";

/** Rótulo exibido na UI para pedido sem vendedor. */
export const DIRECT_SALE_LABEL = "VENDA DIRETA";

/** Opção de UI: lançar sem comissão / sem vendedor. */
export const DIRECT_SALE_OPTION_LABEL =
  "Venda Direta — Sem comissão para vendedor";

export function isDirectSaleSellerId(
  sellerId: string | null | undefined,
): boolean {
  return sellerId == null || sellerId === "" || sellerId === ORDER_SELLER_FILTER_DIRECT;
}

export function orderSellerDisplayName(
  sellerName: string | null | undefined,
): string {
  const n = sellerName?.trim();
  return n ? n : DIRECT_SALE_LABEL;
}

/**
 * ADM e gestores (staff) podem informar preço unitário no lançamento.
 * Sem permissão dedicada na matriz — reutiliza o mesmo conjunto de papéis
 * de venda no escritório (`ADMIN` | `MANAGER`).
 */
export function canOverrideOrderUnitPrice(
  role: "ADMIN" | "SELLER" | "SUPERVISOR" | "MANAGER" | null | undefined,
): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
