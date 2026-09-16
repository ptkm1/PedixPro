import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { listRepeatableSalesInLookback } from "../../lib/repeat-sale";
import {
    fetchSellerSales,
    SELLER_SALES_KEY,
    sellerOfflineStaleTime,
} from "../../lib/seller-offline-queries";
import type { SellerOrderListItem } from "./useSalesListScreen";
import { useDebouncedValue } from "../useDebouncedValue";

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

function matchesRepeatSaleSearch(
  order: SellerOrderListItem,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const customer = order.customer;
  if (!customer) return false;

  const name = customer.name?.toLowerCase() ?? "";
  const legalName = customer.legalName?.toLowerCase() ?? "";
  const tradeName = customer.tradeName?.toLowerCase() ?? "";
  const city = customer.city?.toLowerCase() ?? "";
  if (
    name.includes(q) ||
    legalName.includes(q) ||
    tradeName.includes(q) ||
    city.includes(q)
  ) {
    return true;
  }

  const cnpjDigits = digitsOnly(customer.cnpj ?? "");
  const queryDigits = digitsOnly(q);
  if (queryDigits.length > 0 && cnpjDigits.includes(queryDigits)) {
    return true;
  }

  return false;
}

export function useRepeatSalePickerScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const query = useQuery({
    queryKey: SELLER_SALES_KEY,
    staleTime: sellerOfflineStaleTime,
    queryFn: fetchSellerSales,
  });

  const candidates = useMemo(
    () => listRepeatableSalesInLookback(query.data ?? []),
    [query.data],
  );

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((order) =>
        matchesRepeatSaleSearch(order, debouncedSearch),
      ),
    [candidates, debouncedSearch],
  );

  const pickSale = useCallback(
    (saleId: string) => {
      router.push({
        pathname: "/quick-sale",
        params: { repeatSaleId: saleId },
      });
    },
    [router],
  );

  return {
    search,
    setSearch,
    candidates: filteredCandidates,
    totalCandidates: candidates.length,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    pickSale,
  };
}
