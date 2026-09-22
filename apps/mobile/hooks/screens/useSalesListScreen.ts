import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import {
  fetchSellerSales,
  SELLER_SALES_KEY,
  sellerOfflineStaleTime,
} from "../../lib/seller-offline-queries";
import { useOfflineOutboxCounts } from "../../lib/useOfflineOutboxCounts";

export type SellerOrderListItem = {
  id: string;
  status: string;
  totalAmount: unknown;
  createdAt: string;
  customerId?: string | null;
  paymentConditionId?: string | null;
  customer: {
    name: string;
    cnpj?: string | null;
    legalName?: string | null;
    tradeName?: string | null;
    city?: string | null;
  } | null;
  items: {
    productId?: string;
    quantity: number;
    productName: string;
    unitPrice?: unknown;
  }[];
  seller?: { user: { name: string; phone?: string | null } } | null;
};

export function useSalesListScreen() {
  const router = useRouter();
  const { pending, dead } = useOfflineOutboxCounts();
  const query = useQuery({
    queryKey: SELLER_SALES_KEY,
    staleTime: sellerOfflineStaleTime,
    queryFn: fetchSellerSales,
  });

  const goQuickSale = useCallback(() => {
    router.push("/quick-sale");
  }, [router]);

  const goRepeatSale = useCallback(() => {
    router.push("/(tabs)/vendas/repeat");
  }, [router]);

  const goOfflineQueue = useCallback(() => {
    router.push("/(tabs)/vendas/offline-queue");
  }, [router]);

  return {
    orders: query.data ?? [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    pending,
    dead,
    goQuickSale,
    goRepeatSale,
    goOfflineQueue,
  };
}
