import {
  parseHomeIndicators,
  type HomeIndicatorKey,
} from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type OrderSyncMode = "AUTO" | "MANUAL";
export type CustomerRegistrationMode = "AUTO" | "REQUIRE_APPROVAL";
export type CatalogPriceDisplayMode = "ALL" | "LOWEST" | "HIGHEST";

export type SystemSettings = {
  orderSyncMode: OrderSyncMode;
  catalogPriceDisplayMode: CatalogPriceDisplayMode;
  sellerShowUnassignedCustomers: boolean;
  customerRegistrationMode: CustomerRegistrationMode;
  sellerCanEditQueuedSales: boolean;
  autoInactivateCustomersAfterMonths: boolean;
  homeIndicators: HomeIndicatorKey[];
  homeIndicatorLimit: number | null;
};

export function useAdminSystemSettings(enabled: boolean) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "system-settings"],
    queryFn: () => apiFetch<SystemSettings>("/admin/system-settings"),
    enabled,
  });

  const patch = useMutation({
    mutationFn: (body: Partial<SystemSettings>) =>
      apiFetch<SystemSettings>("/admin/system-settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "system-settings"] });
      void qc.invalidateQueries({
        queryKey: ["admin", "reports", "home-dashboard-config"],
      });
    },
  });

  const selectedIndicators = parseHomeIndicators(
    query.data?.homeIndicators,
  );

  return {
    settings: query.data,
    isLoading: query.isLoading,
    patch,
    selectedIndicators,
  };
}
