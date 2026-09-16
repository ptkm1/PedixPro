import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { isNetworkError } from "../lib/network-error";
import { loadFavoriteIds, toggleFavoriteId } from "../lib/product-favorites";
import type { SaleProduct } from "../lib/sale/types";
import {
    fetchSellerProductsBase,
    sellerOfflineStaleTime,
} from "../lib/seller-offline-queries";
import { matchesProductSearch } from "../lib/utils/product-search";
import { useDebouncedValue } from "./useDebouncedValue";

type Options = {
  customerId?: string;
};

export function useSellerProductCatalog(options: Options = {}) {
  const { customerId } = options;
  const productsQueryKey = ["seller", "products", customerId ?? ""] as const;

  const {
    data: products = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: productsQueryKey,
    staleTime: sellerOfflineStaleTime,
    queryFn: async () => {
      if (!customerId) {
        return fetchSellerProductsBase();
      }
      try {
        return await apiFetch<SaleProduct[]>(
          `/seller/products?customerId=${encodeURIComponent(customerId)}`,
        );
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        // Offline: preços especiais indisponíveis — catálogo base em cache
        return fetchSellerProductsBase();
      }
    },
  });

  const [productQuery, setProductQuery] = useState("");
  const debouncedProductQuery = useDebouncedValue(productQuery, 300);
  const [categoryFilterIds, setCategoryFilterIds] = useState<string[]>([]);
  const [supplierFilterIds, setSupplierFilterIds] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void loadFavoriteIds().then((ids) => {
      if (!cancelled) setFavoriteIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    void toggleFavoriteId(id).then((next) => setFavoriteIds(new Set(next)));
  }, []);

  const catalogCategories = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const p of products) {
      if (p.category)
        m.set(p.category.id, { id: p.category.id, name: p.category.name });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }, [products]);

  const catalogSuppliers = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const p of products) {
      if (!p.supplier) continue;
      const name =
        p.supplier.tradeName?.trim() ||
        p.supplier.legalName?.trim() ||
        p.supplier.code;
      m.set(p.supplier.id, { id: p.supplier.id, name });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const catSet =
      categoryFilterIds.length > 0 ? new Set(categoryFilterIds) : null;
    const supplierSet =
      supplierFilterIds.length > 0 ? new Set(supplierFilterIds) : null;
    const list = products.filter((p) => {
      if (catSet && (!p.category || !catSet.has(p.category.id))) return false;
      if (supplierSet && (!p.supplier || !supplierSet.has(p.supplier.id)))
        return false;
      return matchesProductSearch(p, debouncedProductQuery);
    });
    return [...list].sort((a, b) => {
      const ha =
        a.highlighted || a.featured || a.hasActivePromotion || a.promotionLabel
          ? 1
          : 0;
      const hb =
        b.highlighted || b.featured || b.hasActivePromotion || b.promotionLabel
          ? 1
          : 0;
      if (hb !== ha) return hb - ha;
      return a.name.localeCompare(b.name, "pt");
    });
  }, [products, debouncedProductQuery, categoryFilterIds, supplierFilterIds]);

  const topSellingProducts = useMemo(() => {
    const hot = products.filter((p) => (p.soldQty ?? 0) > 0);
    return (hot.length ? hot : products).slice(0, 14);
  }, [products]);

  const favoriteProductsList = useMemo(() => {
    return products.filter((p) => favoriteIds.has(p.id)).slice(0, 18);
  }, [products, favoriteIds]);

  const highlightedProducts = useMemo(() => {
    return products
      .filter(
        (p) =>
          p.highlighted ||
          p.featured ||
          p.hasActivePromotion ||
          Boolean(p.promotionLabel),
      )
      .slice(0, 18);
  }, [products]);

  return {
    products,
    isLoading,
    isFetching,
    refetch,
    productQuery,
    setProductQuery,
    categoryFilterIds,
    setCategoryFilterIds,
    supplierFilterIds,
    setSupplierFilterIds,
    favoriteIds,
    toggleFavorite,
    catalogCategories,
    catalogSuppliers,
    filteredProducts,
    topSellingProducts,
    favoriteProductsList,
    highlightedProducts,
  };
}
