import type { CreatedPurchaseUnit } from "@/components/CreatePurchaseUnitSheet";
import { apiFetch } from "@/lib/api";
import {
  computeMarkupPercent,
  emptyProductForm,
  formToProductPayload,
  productToForm,
  validateProductForm,
  type ProductFormTab,
  type ProductFormValues,
  type ProductRecord,
} from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { AttributeFieldDef } from "../components/DynamicCategoryAttributes";

export type CategoryBrief = {
  id: string;
  code: string;
  name: string;
  attributeSchema?: unknown;
};

export type SupplierBrief = {
  id: string;
  code: string;
  legalName: string;
  cnpj: string;
  tradeName: string;
};

function coerceDefs(raw: unknown): AttributeFieldDef[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(Boolean) as AttributeFieldDef[];
}

function pruneAttrs(
  attrs: Record<string, unknown>,
  defs: AttributeFieldDef[],
): Record<string, unknown> {
  const keys = new Set(defs.map((d) => d.key));
  const next: Record<string, unknown> = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(attrs, k)) next[k] = attrs[k];
  }
  return next;
}

function normalizeAttrsJson(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

type ProductSaveExtras = {
  priceTablePrices?: Array<{ priceTableId: string; price: number }>;
  sellerCommissions?: Array<{
    sellerId: string;
    commissionPercent: number | null;
  }>;
  priceTableCommissions?: Array<{
    priceTableId: string;
    commissionPercent: number;
  }>;
};

export function useProductFormPage() {
  const { productId } = useParams<{ productId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = Boolean(productId);

  const [activeTab, setActiveTab] = useState<ProductFormTab>("principal");
  const [values, setValues] = useState<ProductFormValues>(emptyProductForm);
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof ProductFormValues, string>>
  >({});
  const [priceTablePrices, setPriceTablePrices] = useState<
    Record<string, string>
  >({});
  const [addPriceTableId, setAddPriceTableId] = useState("");
  const [sellerCommissionEnabled, setSellerCommissionEnabled] = useState(false);
  const [sellerCommissionPercents, setSellerCommissionPercents] = useState<
    Record<string, string>
  >({});
  const [priceTableCommissionRows, setPriceTableCommissionRows] = useState<
    Array<{ priceTableId: string; percent: string }>
  >([]);
  const [addCommissionTableId, setAddCommissionTableId] = useState("");

  const setField = useCallback(
    <K extends keyof ProductFormValues>(
      key: K,
      value: ProductFormValues[K],
    ) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setFieldErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const { data: categories = [] } = useQuery({
    queryKey: ["admin", "product-categories"],
    queryFn: () => apiFetch<CategoryBrief[]>("/admin/product-categories"),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["admin", "suppliers"],
    queryFn: () => apiFetch<SupplierBrief[]>("/admin/suppliers"),
  });

  const { data: priceTables = [] } = useQuery({
    queryKey: ["admin", "price-tables"],
    queryFn: () =>
      apiFetch<Array<{ id: string; name: string }>>("/admin/price-tables"),
  });

  const { data: sellers = [] } = useQuery({
    queryKey: ["admin", "sellers"],
    queryFn: () =>
      apiFetch<
        Array<{ id: string; user?: { name?: string | null } | null }>
      >("/admin/sellers"),
  });
  const sellerOptions = useMemo(
    () =>
      sellers
        .map((s) => ({ id: s.id, name: s.user?.name?.trim() || "Vendedor" }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt")),
    [sellers],
  );

  const { data: purchaseUnits = [] } = useQuery({
    queryKey: ["admin", "purchase-units"],
    queryFn: () =>
      apiFetch<Array<{ id: string; code: string; name: string }>>(
        "/admin/purchase-units",
      ),
  });

  const selectedDefs = useMemo(() => {
    const cat = categories.find((c) => c.id === values.categoryId);
    return coerceDefs(cat?.attributeSchema);
  }, [categories, values.categoryId]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === values.supplierId) ?? null,
    [suppliers, values.supplierId],
  );

  const {
    data: product,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["admin", "product", productId],
    queryFn: () => apiFetch<ProductRecord>(`/admin/products/${productId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (product) {
      setValues(productToForm(product));
      setAttrs(normalizeAttrsJson(product.attributes));
      const items =
        (
          product as ProductRecord & {
            priceTableItems?: Array<{
              priceTableId: string;
              price: unknown;
            }>;
          }
        ).priceTableItems ?? [];
      const map: Record<string, string> = {};
      for (const item of items) {
        map[item.priceTableId] = String(Number(item.price));
      }
      setPriceTablePrices(map);

      const sellerRows =
        (
          product as ProductRecord & {
            sellerCommissions?: Array<{
              sellerId: string;
              commissionPercent: unknown;
            }>;
          }
        ).sellerCommissions ?? [];
      const sellerMap: Record<string, string> = {};
      for (const row of sellerRows) {
        sellerMap[row.sellerId] = String(Number(row.commissionPercent));
      }
      setSellerCommissionPercents(sellerMap);
      setSellerCommissionEnabled(sellerRows.length > 0);

      const tableRows =
        (
          product as ProductRecord & {
            priceTableCommissions?: Array<{
              priceTableId: string;
              commissionPercent: unknown;
            }>;
          }
        ).priceTableCommissions ?? [];
      setPriceTableCommissionRows(
        tableRows.map((row) => ({
          priceTableId: row.priceTableId,
          percent: String(Number(row.commissionPercent)),
        })),
      );
    }
  }, [product]);

  const markupPercent = useMemo(() => {
    const cost = values.costPrice.trim() ? Number(values.costPrice) : null;
    const tablePrices = Object.values(priceTablePrices)
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !Number.isNaN(n) && n >= 0);
    if (tablePrices.length === 0 || cost == null || Number.isNaN(cost)) {
      return null;
    }
    return computeMarkupPercent(cost, Math.min(...tablePrices));
  }, [values.costPrice, priceTablePrices]);

  const create = useMutation({
    mutationFn: (
      body: ReturnType<typeof formToProductPayload> & ProductSaveExtras,
    ) =>
      apiFetch<ProductRecord>("/admin/products", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      await qc.invalidateQueries({ queryKey: ["admin", "price-tables"] });
      navigate("/produtos");
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const update = useMutation({
    mutationFn: (
      body: ReturnType<typeof formToProductPayload> & ProductSaveExtras,
    ) =>
      apiFetch<ProductRecord>(`/admin/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      await qc.invalidateQueries({ queryKey: ["admin", "product", productId] });
      await qc.invalidateQueries({ queryKey: ["admin", "price-tables"] });
      navigate("/produtos");
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const pending = create.isPending || update.isPending;

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setFormError(null);

      const syncPrices = Object.entries(priceTablePrices)
        .filter(([, raw]) => raw.trim() !== "")
        .map(([priceTableId, raw]) => ({
          priceTableId,
          price: Number(raw),
        }))
        .filter((row) => !Number.isNaN(row.price) && row.price >= 0);

      if (syncPrices.length === 0) {
        setActiveTab("precos");
        setFormError(
          "Na aba Preços, informe o preço em pelo menos uma tabela de preço.",
        );
        return;
      }

      const validation = validateProductForm(values);
      if (!validation.ok) {
        setFieldErrors(validation.errors);
        if (validation.firstErrorTab) setActiveTab(validation.firstErrorTab);
        setFormError("Corrija os campos destacados antes de salvar.");
        return;
      }

      const sellerCommissions = sellerOptions.map((s) => {
        const raw = (sellerCommissionPercents[s.id] ?? "").trim();
        if (!raw) return { sellerId: s.id, commissionPercent: null };
        const n = Number(raw.replace(",", "."));
        return {
          sellerId: s.id,
          commissionPercent: Number.isNaN(n) ? null : n,
        };
      });
      const priceTableCommissions = priceTableCommissionRows
        .map((row) => ({
          priceTableId: row.priceTableId,
          commissionPercent: Number(row.percent.replace(",", ".")),
        }))
        .filter(
          (row) =>
            !Number.isNaN(row.commissionPercent) &&
            row.commissionPercent >= 0 &&
            row.commissionPercent <= 100,
        );

      setFieldErrors({});
      try {
        const payload = formToProductPayload(values, attrs);
        if (isEdit) {
          const { stockQty: _stockQty, ...rest } = payload;
          update.mutate({
            ...(rest as typeof payload),
            priceTablePrices: syncPrices,
            sellerCommissions,
            priceTableCommissions,
          });
        } else {
          create.mutate({
            ...payload,
            priceTablePrices: syncPrices,
            sellerCommissions,
            priceTableCommissions,
          });
        }
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    },
    [attrs, create, isEdit, priceTableCommissionRows, priceTablePrices, sellerCommissionEnabled, sellerCommissionPercents, sellerOptions, update, values],
  );

  const onCategoryChange = useCallback(
    (nextId: string) => {
      const defs = coerceDefs(
        categories.find((c) => c.id === nextId)?.attributeSchema,
      );
      setField("categoryId", nextId);
      setAttrs((prev) => pruneAttrs(prev, defs));
    },
    [categories, setField],
  );

  const fieldError = useCallback(
    (key: keyof ProductFormValues) => fieldErrors[key],
    [fieldErrors],
  );

  const setPriceForTable = useCallback((tableId: string, price: string) => {
    setPriceTablePrices((prev) => ({ ...prev, [tableId]: price }));
  }, []);

  const addProductToPriceTable = useCallback(() => {
    if (!addPriceTableId) return;
    setPriceTablePrices((prev) => {
      if (prev[addPriceTableId] !== undefined) return prev;
      return {
        ...prev,
        [addPriceTableId]: "",
      };
    });
    setAddPriceTableId("");
  }, [addPriceTableId]);

  const applyCreatedPriceTable = useCallback(
    (table: { id: string; name: string }) => {
      setPriceTablePrices((prev) => {
        if (prev[table.id] !== undefined) return prev;
        return {
          ...prev,
          [table.id]: "",
        };
      });
      setAddPriceTableId("");
    },
    [],
  );

  const setSellerCommissionPercent = useCallback(
    (sellerId: string, value: string) => {
      setSellerCommissionPercents((prev) => ({ ...prev, [sellerId]: value }));
    },
    [],
  );

  const addCommissionTable = useCallback(() => {
    if (!addCommissionTableId) return;
    setPriceTableCommissionRows((prev) => {
      if (prev.some((row) => row.priceTableId === addCommissionTableId)) {
        return prev;
      }
      return [...prev, { priceTableId: addCommissionTableId, percent: "" }];
    });
    setAddCommissionTableId("");
  }, [addCommissionTableId]);

  const removeCommissionTable = useCallback((priceTableId: string) => {
    setPriceTableCommissionRows((prev) =>
      prev.filter((row) => row.priceTableId !== priceTableId),
    );
  }, []);

  const setCommissionTablePercent = useCallback(
    (priceTableId: string, percent: string) => {
      setPriceTableCommissionRows((prev) =>
        prev.map((row) =>
          row.priceTableId === priceTableId ? { ...row, percent } : row,
        ),
      );
    },
    [],
  );

  const applyCreatedPurchaseUnit = useCallback(
    (unit: CreatedPurchaseUnit) => {
      setField("purchaseUnit", unit.code);
    },
    [setField],
  );

  return {
    productId,
    isEdit,
    isLoading,
    isError,
    loadError: error,
    product,
    activeTab,
    setActiveTab,
    values,
    setField,
    attrs,
    setAttrs,
    formError,
    fieldErrors,
    fieldError,
    categories,
    suppliers,
    priceTables,
    purchaseUnits,
    applyCreatedPurchaseUnit,
    selectedDefs,
    selectedSupplier,
    markupPercent,
    handleSubmit,
    onCategoryChange,
    pending,
    priceTablePrices,
    setPriceForTable,
    addPriceTableId,
    setAddPriceTableId,
    addProductToPriceTable,
    applyCreatedPriceTable,
    sellerOptions,
    sellerCommissionEnabled,
    setSellerCommissionEnabled,
    sellerCommissionPercents,
    setSellerCommissionPercent,
    priceTableCommissionRows,
    addCommissionTableId,
    setAddCommissionTableId,
    addCommissionTable,
    removeCommissionTable,
    setCommissionTablePercent,
  };
}
