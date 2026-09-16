import type { CreatedPurchaseUnit } from "@/components/CreatePurchaseUnitSheet";
import { apiFetch } from "@/lib/api";
import {
    uploadProductImageFile,
    validateProductImageFile,
} from "@/lib/product-image-upload";
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
  /** Arquivo escolhido no cadastro (upload depois do create). */
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

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
      setPendingImageFile(null);
      setImagePreviewUrl(null);
      setImageError(null);
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
    }
  }, [product]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

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
    mutationFn: async (
      body: ReturnType<typeof formToProductPayload> & {
        priceTablePrices?: Array<{ priceTableId: string; price: number }>;
      },
    ) => {
      const created = await apiFetch<ProductRecord>("/admin/products", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (pendingImageFile) {
        const publicUrl = await uploadProductImageFile(
          created.id,
          pendingImageFile,
        );
        return apiFetch<ProductRecord>(`/admin/products/${created.id}`, {
          method: "PATCH",
          body: JSON.stringify({ imageUrl: publicUrl }),
        });
      }
      return created;
    },
    onSuccess: async () => {
      setPendingImageFile(null);
      setImagePreviewUrl(null);
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      await qc.invalidateQueries({ queryKey: ["admin", "price-tables"] });
      navigate("/produtos");
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const update = useMutation({
    mutationFn: async (
      body: ReturnType<typeof formToProductPayload> & {
        priceTablePrices?: Array<{ priceTableId: string; price: number }>;
      },
    ) => {
      let nextBody = body;
      if (pendingImageFile && productId) {
        const previousUrl = values.imageUrl.trim() || null;
        const publicUrl = await uploadProductImageFile(
          productId,
          pendingImageFile,
        );
        nextBody = { ...body, imageUrl: publicUrl };
        // best-effort: limpar URL antiga via PATCH só com a nova; delete do objeto
        // antigo fica a cargo da troca no servidor se/quando houver GC.
        void previousUrl;
      }
      return apiFetch<ProductRecord>(`/admin/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify(nextBody),
      });
    },
    onSuccess: async () => {
      setPendingImageFile(null);
      setImagePreviewUrl(null);
      await qc.invalidateQueries({ queryKey: ["admin", "products"] });
      await qc.invalidateQueries({ queryKey: ["admin", "product", productId] });
      await qc.invalidateQueries({ queryKey: ["admin", "price-tables"] });
      navigate("/produtos");
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const pending = create.isPending || update.isPending || imageBusy;

  const onImageFileChange = useCallback(
    async (file: File | null) => {
      setImageError(null);
      if (!file) return;

      const err = validateProductImageFile(file);
      if (err) {
        setImageError(err);
        return;
      }

      if (imagePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      const preview = URL.createObjectURL(file);
      setImagePreviewUrl(preview);
      setPendingImageFile(file);

      // Em edição, sobe na hora para o catálogo refletir rápido.
      if (isEdit && productId) {
        setImageBusy(true);
        try {
          const publicUrl = await uploadProductImageFile(productId, file);
          setField("imageUrl", publicUrl);
          setPendingImageFile(null);
          await apiFetch<ProductRecord>(`/admin/products/${productId}`, {
            method: "PATCH",
            body: JSON.stringify({ imageUrl: publicUrl }),
          });
          await qc.invalidateQueries({
            queryKey: ["admin", "product", productId],
          });
        } catch (e) {
          setImageError(
            e instanceof Error ? e.message : "Falha ao enviar a imagem.",
          );
        } finally {
          setImageBusy(false);
        }
      }
    },
    [imagePreviewUrl, isEdit, productId, qc, setField],
  );

  const removeProductImage = useCallback(async () => {
    setImageError(null);
    if (imagePreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl(null);
    setPendingImageFile(null);

    if (isEdit && productId && values.imageUrl.trim()) {
      setImageBusy(true);
      try {
        await apiFetch<ProductRecord>(`/admin/products/${productId}/image`, {
          method: "DELETE",
        });
        setField("imageUrl", "");
        await qc.invalidateQueries({
          queryKey: ["admin", "product", productId],
        });
      } catch (e) {
        setImageError(
          e instanceof Error ? e.message : "Falha ao remover a imagem.",
        );
      } finally {
        setImageBusy(false);
      }
      return;
    }
    setField("imageUrl", "");
  }, [
    imagePreviewUrl,
    isEdit,
    productId,
    qc,
    setField,
    values.imageUrl,
  ]);

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

      setFieldErrors({});
      try {
        const payload = formToProductPayload(values, attrs);
        if (isEdit) {
          const { stockQty: _stockQty, ...rest } = payload;
          update.mutate({
            ...(rest as typeof payload),
            priceTablePrices: syncPrices,
          });
        } else {
          // No create, imageUrl só entra se já for URL externa; arquivo sobe depois.
          const { imageUrl, ...rest } = payload;
          create.mutate({
            ...rest,
            ...(pendingImageFile
              ? {}
              : imageUrl
                ? { imageUrl }
                : { imageUrl: null }),
            priceTablePrices: syncPrices,
          });
        }
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    },
    [attrs, create, isEdit, pendingImageFile, priceTablePrices, update, values],
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
    imagePreviewUrl,
    imageBusy,
    imageError,
    onImageFileChange,
    removeProductImage,
    displayImageUrl: imagePreviewUrl || values.imageUrl.trim() || null,
  };
}
