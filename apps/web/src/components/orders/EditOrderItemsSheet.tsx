import {
  FormErrorBanner,
  FormField,
  FormGrid,
  FormSection,
  FormSheet,
} from "@/components/forms";
import { CustomerCombobox } from "@/components/CustomerCombobox";
import { ProductCombobox } from "@/components/ProductCombobox";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useScrollToFirstError } from "@/hooks/useScrollToFirstError";
import { apiFetch } from "@/lib/api";
import { getErrorMessage } from "@/lib/api-error";
import { formatOrderMoney } from "@/lib/order-kanban";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type CatalogProduct = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  stockQty?: number;
  blockSaleWhenOutOfStock?: boolean;
  catalogUnitPrice: number;
  effectiveUnitPrice: number;
  promotionLabel?: string | null;
};

type OrderItemSeed = {
  id: string;
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: unknown;
  product?: {
    id?: string;
    name: string;
    sku: string | null;
    imageUrl?: string | null;
  };
};

type LookupCustomer = {
  id: string;
  name: string;
  tradeName?: string | null;
  legalName?: string | null;
  city?: string | null;
  code?: number | null;
  cnpj?: string | null;
  cpf?: string | null;
};

type LookupPayment = {
  id: string;
  code: string;
  name: string;
  days: number;
};

type OrderSeed = {
  id: string;
  sellerId?: string | null;
  customerId?: string | null;
  customer?: {
    id?: string;
    name: string;
    tradeName?: string | null;
    legalName?: string | null;
    city?: string | null;
  } | null;
  paymentConditionId?: string | null;
  paymentCondition?: { id: string; name: string; days: number } | null;
  notes?: string | null;
  priceTableId?: string | null;
  items: OrderItemSeed[];
};

type PreviewLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  productName: string;
};

type PreviewResponse = {
  lines: PreviewLine[];
  comboDiscountTotal: number;
  grossLinesTotal: number;
  netTotal: number;
};

type DraftLine = {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
};

let lineSeq = 0;
function newLine(seed?: Partial<DraftLine>): DraftLine {
  lineSeq += 1;
  return {
    key: `el-${lineSeq}`,
    productId: seed?.productId ?? "",
    quantity: seed?.quantity ?? "1",
    unitPrice: seed?.unitPrice ?? "",
  };
}

function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function parseMoneyInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderSeed;
  onSaved: () => void;
  /** Cabeçalho + itens (cliente, condição, valores). Default: só itens. */
  mode?: "items" | "order";
}>;

export function EditOrderItemsSheet({
  open,
  onOpenChange,
  order,
  onSaved,
  mode = "items",
}: Props) {
  const fullEdit = mode === "order";
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [showValidation, setShowValidation] = useState(false);
  const [customerId, setCustomerId] = useState(
    order.customerId ?? order.customer?.id ?? "",
  );
  const [paymentConditionId, setPaymentConditionId] = useState(
    order.paymentConditionId ?? order.paymentCondition?.id ?? "",
  );
  const [notes, setNotes] = useState(order.notes ?? "");

  useEffect(() => {
    if (!open) return;
    setShowValidation(false);
    setCustomerId(order.customerId ?? order.customer?.id ?? "");
    setPaymentConditionId(
      order.paymentConditionId ?? order.paymentCondition?.id ?? "",
    );
    setNotes(order.notes ?? "");
    setLines(
      order.items.length > 0
        ? order.items.map((it) =>
            newLine({
              productId: it.productId ?? it.product?.id ?? "",
              quantity: String(it.quantity),
              unitPrice: String(Number(it.unitPrice)),
            }),
          )
        : [newLine()],
    );
  }, [open, order.id, order.items]);

  const lookupsQ = useQuery({
    queryKey: ["admin", "orders", "lookups", "edit-order"],
    queryFn: () =>
      apiFetch<{
        customers: LookupCustomer[];
        paymentConditions: LookupPayment[];
      }>("/admin/orders/lookups"),
    enabled: open && fullEdit,
  });

  const customers = useMemo(() => {
    const list = lookupsQ.data?.customers ?? [];
    const current = order.customer;
    const currentId = order.customerId ?? current?.id;
    if (!currentId || list.some((c) => c.id === currentId)) return list;
    return [
      {
        id: currentId,
        name: current?.name ?? "Cliente atual",
        tradeName: current?.tradeName,
        legalName: current?.legalName,
        city: current?.city,
      },
      ...list,
    ];
  }, [lookupsQ.data?.customers, order.customer, order.customerId]);

  const paymentConditions = useMemo(() => {
    const list = lookupsQ.data?.paymentConditions ?? [];
    const current = order.paymentCondition;
    const currentId = order.paymentConditionId ?? current?.id;
    if (!currentId || list.some((p) => p.id === currentId)) return list;
    return [
      {
        id: currentId,
        code: "",
        name: current?.name ?? "Condição atual",
        days: current?.days ?? 0,
      },
      ...list,
    ];
  }, [
    lookupsQ.data?.paymentConditions,
    order.paymentCondition,
    order.paymentConditionId,
  ]);

  const catalogQ = useQuery({
    queryKey: [
      "admin",
      "orders",
      "catalog",
      "edit-items",
      order.id,
      order.sellerId ?? "direct",
      customerId,
      order.priceTableId ?? "",
    ],
    queryFn: () => {
      const qs = new URLSearchParams();
      // Sem sellerId → catálogo completo da org (ADM pode adicionar qualquer produto).
      if (customerId) qs.set("customerId", customerId);
      if (order.priceTableId) qs.set("priceTableId", order.priceTableId);
      return apiFetch<{ products: CatalogProduct[] }>(
        `/admin/orders/catalog?${qs.toString()}`,
      );
    },
    enabled: open,
  });

  const products = useMemo(() => {
    const fromCatalog = catalogQ.data?.products ?? [];
    const byId = new Map(fromCatalog.map((p) => [p.id, p]));
    for (const it of order.items) {
      const pid = it.productId ?? it.product?.id;
      if (!pid || byId.has(pid)) continue;
      byId.set(pid, {
        id: pid,
        name: it.product?.name ?? it.productName,
        sku: it.product?.sku ?? null,
        imageUrl: it.product?.imageUrl,
        catalogUnitPrice: Number(it.unitPrice),
        effectiveUnitPrice: Number(it.unitPrice),
      });
    }
    return [...byId.values()];
  }, [catalogQ.data?.products, order.items]);

  const payloadItems = useMemo(
    () =>
      lines
        .map((l) => {
          const quantity = Number.parseInt(l.quantity, 10);
          const unitPrice = parseMoneyInput(l.unitPrice);
          return {
            productId: l.productId,
            quantity,
            unitPrice,
          };
        })
        .filter(
          (l): l is { productId: string; quantity: number; unitPrice: number } =>
            Boolean(l.productId) &&
            Number.isInteger(l.quantity) &&
            l.quantity > 0 &&
            l.unitPrice != null,
        ),
    [lines],
  );
  const debouncedItems = useDebouncedValue(payloadItems);

  const previewQ = useQuery({
    queryKey: [
      "admin",
      "orders",
      "preview",
      "edit-items",
      order.id,
      order.sellerId ?? "direct",
      customerId,
      order.priceTableId ?? "",
      debouncedItems,
    ],
    queryFn: () =>
      apiFetch<PreviewResponse>("/admin/orders/preview", {
        method: "POST",
        body: JSON.stringify({
          sellerId: order.sellerId ?? null,
          customerId,
          priceTableId: order.priceTableId || undefined,
          items: debouncedItems,
        }),
      }),
    enabled: open && Boolean(customerId && debouncedItems.length > 0),
    retry: false,
  });

  const fieldErrors = useMemo(() => {
    if (!showValidation) return {} as Record<string, string>;
    const err: Record<string, string> = {};
    if (fullEdit && !customerId) err.customerId = "Selecione o cliente.";
    if (fullEdit && !paymentConditionId) {
      err.paymentConditionId = "Selecione a condição de pagamento.";
    }
    if (payloadItems.length === 0) {
      err.items = "Inclua ao menos um produto com quantidade e preço unitário.";
    }
    return err;
  }, [
    showValidation,
    payloadItems.length,
    fullEdit,
    customerId,
    paymentConditionId,
  ]);

  useScrollToFirstError(fieldErrors, { enabled: showValidation && open });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/admin/orders/${order.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({
          items: payloadItems,
          ...(fullEdit
            ? {
                customerId,
                paymentConditionId,
                notes: notes.trim() || null,
              }
            : {}),
        }),
      }),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
  });

  function submit() {
    setShowValidation(true);
    if (fullEdit && (!customerId || !paymentConditionId)) return;
    if (payloadItems.length === 0) return;
    saveMutation.mutate();
  }

  const localGross = useMemo(
    () =>
      payloadItems.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [payloadItems],
  );

  const formError = saveMutation.error
    ? getErrorMessage(saveMutation.error)
    : previewQ.isError
      ? getErrorMessage(previewQ.error)
      : null;
  const pending = saveMutation.isPending;

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={fullEdit ? "Editar pedido" : "Editar itens do pedido"}
      description={
        fullEdit
          ? "Altere cliente, condição de pagamento, itens e valores. Totais e crédito são recalculados ao salvar."
          : "Altere quantidade, preço unitário, inclua ou remova itens. Totais e comissões são recalculados ao salvar."
      }
      contentClassName="sm:max-h-[92vh]"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <FormErrorBanner message={formError} />

      {fullEdit ? (
        <FormGrid cols={2} className="mb-6">
          <FormField
            label="Cliente"
            htmlFor="edit-order-customer"
            required
            error={fieldErrors.customerId}
          >
            <CustomerCombobox
              id="edit-order-customer"
              value={customerId}
              onValueChange={setCustomerId}
              customers={customers}
              placeholder="Buscar cliente…"
              invalid={Boolean(fieldErrors.customerId)}
              disabled={lookupsQ.isLoading}
            />
          </FormField>
          <FormField
            label="Condição de pagamento"
            htmlFor="edit-order-pay"
            required
            error={fieldErrors.paymentConditionId}
          >
            <AppSelect
              id="edit-order-pay"
              value={paymentConditionId}
              onValueChange={setPaymentConditionId}
              placeholder={
                paymentConditions.length
                  ? "Selecione"
                  : "Nenhuma condição cadastrada"
              }
              invalid={Boolean(fieldErrors.paymentConditionId)}
              options={paymentConditions.map((p) => ({
                value: p.id,
                label: p.code ? `${p.code} · ${p.name}` : p.name,
              }))}
            />
          </FormField>
          <FormField label="Observação" htmlFor="edit-order-notes">
            <Textarea
              id="edit-order-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              rows={2}
            />
          </FormField>
        </FormGrid>
      ) : null}

      <FormSection
        title="Itens"
        description="Preço unitário pode ser ajustado por administrador ou gestor (substitui a tabela)."
      >
        {fieldErrors.items ? (
          <p className="mb-2 text-xs text-destructive" data-error="true">
            {fieldErrors.items}
          </p>
        ) : null}

        <div className="space-y-3">
          {lines.map((line) => {
            const qty = Number.parseInt(line.quantity, 10) || 0;
            const unit = parseMoneyInput(line.unitPrice);
            const subtotal =
              unit != null && qty > 0 ? unit * qty : null;
            return (
              <div
                key={line.key}
                className="grid gap-3 rounded-lg border border-border p-3 pb-5 sm:grid-cols-[minmax(0,1.6fr)_5.5rem_7rem_minmax(0,7rem)_auto] sm:items-start"
              >
                <FormField label="Produto" htmlFor={`edit-prod-${line.key}`}>
                  <ProductCombobox
                    id={`edit-prod-${line.key}`}
                    value={line.productId}
                    onValueChange={(productId) => {
                      const product = products.find((p) => p.id === productId);
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key
                            ? {
                                ...l,
                                productId,
                                unitPrice:
                                  l.unitPrice.trim() ||
                                  (product
                                    ? String(product.effectiveUnitPrice)
                                    : l.unitPrice),
                              }
                            : l,
                        ),
                      );
                    }}
                    products={products}
                    disabled={catalogQ.isPending && products.length === 0}
                    placeholder="Buscar produto…"
                  />
                </FormField>
                <FormField label="Qtd" htmlFor={`edit-qty-${line.key}`}>
                  <Input
                    id={`edit-qty-${line.key}`}
                    inputMode="numeric"
                    min={1}
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key
                            ? {
                                ...l,
                                quantity: e.target.value.replace(/\D/g, ""),
                              }
                            : l,
                        ),
                      )
                    }
                  />
                </FormField>
                <FormField
                  label="Preço unit."
                  htmlFor={`edit-price-${line.key}`}
                >
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs font-medium text-muted-foreground">
                      R$
                    </span>
                    <Input
                      id={`edit-price-${line.key}`}
                      className="pl-9 tabular-nums"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label="Preço unitário editável"
                      value={line.unitPrice}
                      placeholder="0,00"
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? { ...l, unitPrice: e.target.value }
                              : l,
                          ),
                        )
                      }
                    />
                  </div>
                </FormField>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    Subtotal
                  </span>
                  <p className="flex h-9 items-center text-sm tabular-nums text-muted-foreground">
                    {subtotal != null ? formatOrderMoney(subtotal) : "—"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "shrink-0 sm:self-end",
                    lines.length === 1 && "invisible",
                  )}
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((prev) => prev.filter((l) => l.key !== line.key))
                  }
                  aria-label="Remover item"
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setLines((prev) => [...prev, newLine()])}
        >
          <Plus />
          Adicionar item
        </Button>
      </FormSection>

      <div className="mt-4 space-y-1 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>
            {formatOrderMoney(
              previewQ.data?.grossLinesTotal ?? localGross,
            )}
          </span>
        </div>
        {(previewQ.data?.comboDiscountTotal ?? 0) > 0 ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Desconto de combo</span>
            <span>
              − {formatOrderMoney(previewQ.data!.comboDiscountTotal)}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>
            {formatOrderMoney(previewQ.data?.netTotal ?? localGross)}
          </span>
        </div>
      </div>
    </FormSheet>
  );
}
