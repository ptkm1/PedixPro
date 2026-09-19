import type { CustomerRecord } from "@pedidos/shared";
import {
  parseCatalogPriceDisplayMode,
  type CatalogPriceDisplayMode,
} from "@pedidos/shared";
import type { QueryClient } from "@tanstack/react-query";
import type { CommissionDashboard } from "../hooks/screens/useCommissionScreen";
import type { SellerOrderListItem } from "../hooks/screens/useSalesListScreen";
import { fetchWithOfflineCache } from "./fetch-with-offline-cache";
import { notifyOfflineOutboxChanged } from "./offline-outbox-events";
import {
  CACHE_META_COMMISSION,
  CACHE_META_ORG_SETTINGS,
  getCachedCustomerById,
  getCachedCustomers,
  getCachedProducts,
  getCachedSales,
  getCacheMeta,
  markCacheSynced,
  replaceCachedCustomers,
  replaceCachedProducts,
  replaceCachedSales,
  setCacheMeta,
  upsertCachedCustomer,
} from "./offline-read-cache";
import type { SaleProduct } from "./sale/types";

export type OrderSyncMode = "AUTO" | "MANUAL";
export type CustomerRegistrationMode = "AUTO" | "REQUIRE_APPROVAL";

export type SellerOrgSettings = {
  orderSyncMode: OrderSyncMode;
  catalogPriceDisplayMode?: CatalogPriceDisplayMode;
  sellerShowUnassignedCustomers?: boolean;
  customerRegistrationMode?: CustomerRegistrationMode;
  sellerCanEditQueuedSales?: boolean;
};

export const SELLER_PRODUCTS_BASE_KEY = ["seller", "products", ""] as const;
export const SELLER_CUSTOMERS_KEY = ["seller", "customers"] as const;
export const SELLER_SALES_KEY = ["seller", "sales"] as const;
export const SELLER_COMMISSION_KEY = [
  "seller",
  "commission-dashboard",
] as const;
export const SELLER_ORG_SETTINGS_KEY = [
  "seller",
  "organization",
  "settings",
] as const;

const STALE_MS = 10 * 60 * 1000;

export const sellerOfflineStaleTime = STALE_MS;

function normalizeOrgSettings(raw: unknown): SellerOrgSettings {
  const mode =
    raw &&
    typeof raw === "object" &&
    (raw as { orderSyncMode?: unknown }).orderSyncMode === "MANUAL"
      ? "MANUAL"
      : "AUTO";
  const showUnassigned = !(
    raw &&
    typeof raw === "object" &&
    (raw as { sellerShowUnassignedCustomers?: unknown })
      .sellerShowUnassignedCustomers === false
  );
  const registrationMode =
    raw &&
    typeof raw === "object" &&
    (raw as { customerRegistrationMode?: unknown }).customerRegistrationMode ===
      "REQUIRE_APPROVAL"
      ? "REQUIRE_APPROVAL"
      : "AUTO";
  const canEditQueued = Boolean(
    raw &&
      typeof raw === "object" &&
      (raw as { sellerCanEditQueuedSales?: unknown })
        .sellerCanEditQueuedSales === true,
  );
  const catalogPriceDisplayMode = parseCatalogPriceDisplayMode(
    raw &&
      typeof raw === "object"
      ? (raw as { catalogPriceDisplayMode?: unknown }).catalogPriceDisplayMode
      : undefined,
  );
  return {
    orderSyncMode: mode,
    catalogPriceDisplayMode,
    sellerShowUnassignedCustomers: showUnassigned,
    customerRegistrationMode: registrationMode,
    sellerCanEditQueuedSales: canEditQueued,
  };
}

export async function fetchSellerOrgSettings(): Promise<SellerOrgSettings> {
  return fetchWithOfflineCache({
    url: "/seller/organization/settings",
    readCache: async () => {
      const cached = await getCacheMeta<SellerOrgSettings>(
        CACHE_META_ORG_SETTINGS,
      );
      return cached ? normalizeOrgSettings(cached) : null;
    },
    writeCache: (data) =>
      setCacheMeta(CACHE_META_ORG_SETTINGS, normalizeOrgSettings(data)),
  }).then(normalizeOrgSettings);
}

export async function fetchSellerProductsBase(): Promise<SaleProduct[]> {
  return fetchWithOfflineCache({
    url: "/seller/products",
    readCache: async () => {
      const rows = await getCachedProducts<SaleProduct>();
      return rows.length > 0 ? rows : null;
    },
    writeCache: (data) => replaceCachedProducts(data),
  });
}

export async function fetchSellerCustomers(): Promise<CustomerRecord[]> {
  return fetchWithOfflineCache({
    url: "/seller/customers",
    readCache: async () => {
      const rows = await getCachedCustomers<CustomerRecord>();
      return rows.length > 0 ? rows : null;
    },
    writeCache: (data) =>
      replaceCachedCustomers(
        data as Array<{ id: string } & Record<string, unknown>>,
      ),
  });
}

export async function fetchSellerCustomer(
  customerId: string,
): Promise<CustomerRecord> {
  return fetchWithOfflineCache({
    url: `/seller/customers/${customerId}`,
    readCache: () => getCachedCustomerById<CustomerRecord>(customerId),
    writeCache: (data) =>
      upsertCachedCustomer(data as { id: string } & Record<string, unknown>),
  });
}

export async function fetchSellerSales(): Promise<SellerOrderListItem[]> {
  return fetchWithOfflineCache({
    url: "/seller/sales",
    readCache: async () => {
      const rows = await getCachedSales<SellerOrderListItem>();
      return rows.length > 0 ? rows : null;
    },
    writeCache: (data) =>
      replaceCachedSales(
        data as Array<{ id: string } & Record<string, unknown>>,
      ),
  });
}

export async function fetchSellerCommissionDashboard(): Promise<CommissionDashboard> {
  return fetchWithOfflineCache({
    url: "/seller/commission-dashboard",
    readCache: () => getCacheMeta<CommissionDashboard>(CACHE_META_COMMISSION),
    writeCache: (data) => setCacheMeta(CACHE_META_COMMISSION, data),
  });
}

/** Prefetch + hydrate React Query + SQLite. Falhas não propagam. */
export async function prefetchSellerReadCache(qc: QueryClient): Promise<void> {
  const [products, customers, sales, commission, orgSettings] =
    await Promise.all([
      fetchSellerProductsBase().catch(() => null),
      fetchSellerCustomers().catch(() => null),
      fetchSellerSales().catch(() => null),
      fetchSellerCommissionDashboard().catch(() => null),
      fetchSellerOrgSettings().catch(() => null),
    ]);

  if (products) qc.setQueryData(SELLER_PRODUCTS_BASE_KEY, products);
  if (customers) {
    qc.setQueryData(SELLER_CUSTOMERS_KEY, customers);
    for (const c of customers) {
      qc.setQueryData(["seller", "customer", c.id], c);
    }
  }
  if (sales) qc.setQueryData(SELLER_SALES_KEY, sales);
  if (commission) qc.setQueryData(SELLER_COMMISSION_KEY, commission);
  if (orgSettings) qc.setQueryData(SELLER_ORG_SETTINGS_KEY, orgSettings);

  if (products || customers || sales || commission || orgSettings) {
    const n =
      (products?.length ?? 0) +
      (customers?.length ?? 0) +
      (sales?.length ?? 0) +
      (commission ? 1 : 0) +
      (orgSettings ? 1 : 0);
    await markCacheSynced(n).catch(() => undefined);
    notifyOfflineOutboxChanged();
  }
}
