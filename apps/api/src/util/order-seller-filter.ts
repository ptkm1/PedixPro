import {
  ORDER_SELLER_FILTER_DIRECT,
  isDirectSaleSellerId,
} from "@pedidos/shared";
import type { Prisma } from "@prisma/client";

/** Aplica filtro de vendedor em listagens/relatórios (inclui venda direta). */
export function applyOrderSellerFilter(
  where: Prisma.OrderWhereInput,
  sellerId: string | undefined | null,
): void {
  if (!sellerId) return;
  if (isDirectSaleSellerId(sellerId) || sellerId === ORDER_SELLER_FILTER_DIRECT) {
    where.sellerId = null;
    return;
  }
  where.sellerId = sellerId;
}

export function sellerLabelOrDirect(
  sellerName: string | null | undefined,
): string {
  const n = sellerName?.trim();
  return n && n.length > 0 ? n : "VENDA DIRETA";
}
