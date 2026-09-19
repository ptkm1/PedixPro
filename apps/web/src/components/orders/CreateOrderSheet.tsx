import { useAuth } from "@/auth/AuthContext";
import { useActiveEstablishment } from "@/auth/EstablishmentContext";
import {
  FormErrorBanner,
  FormField,
  FormGrid,
  FormSection,
  FormSheet,
} from "@/components/forms";
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
import { useConfirm } from "@/components/confirm";
import {
  DIRECT_SALE_OPTION_LABEL,
  isPriceTableUsable,
  ORDER_SELLER_FILTER_DIRECT,
  pickDefaultPriceTableId,
} from "@pedidos/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/** Sentinel no select: venda direta (API recebe null). */
const SELLER_DIRECT = ORDER_SELLER_FILTER_DIRECT;

function resolveApiSellerId(sellerId: string): string | null {
  if (!sellerId || sellerId === SELLER_DIRECT) return null;
  return sellerId;
}

type LookupSeller = {
  id: string;
  name: string;
  defaultPriceTableId?: string | null;
  allowedPriceTableIds?: string[];
};
type LookupCustomer = {
  id: string;
  name: string;
  tradeName?: string | null;
  legalName?: string | null;
  city?: string | null;
  sellerId?: string | null;
  regionId?: string | null;
  defaultPriceTableId?: string | null;
};
type LookupPayment = {
  id: string;
  code: string;
  name: string;
  days: number;
};
type LookupPriceTable = {
  id: string;
  name: string;
  status?: string | null;
  customerId?: string | null;
  sellerId?: string | null;
  regionId?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
};

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
  maxSellerDiscountPercentEffective?: number;
};

type PreviewLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  productName: string;
  priceOriginLabel?: string | null;
};

type CreditPreview = {
  action: "ALLOW" | "BLOCK" | "APPROVAL";
  violations: Array<{ code: string; message: string }>;
  check?: {
    status: "OK" | "BLOCKED" | "WARN";
    reason?: string;
    overdueAmount?: number;
    openAmount?: number;
    overdueReceivables?: Array<{
      id: string;
      remaining: number;
      dueDate: string;
      nossoNumero: string | null;
      status: string;
    }>;
  };
};

type PreviewResponse = {
  lines: PreviewLine[];
  comboDiscountTotal: number;
  grossLinesTotal: number;
  netTotal: number;
  credit?: CreditPreview;
};

type CreatedOrder = {
  id: string;
  status: string;
  orderNumber?: number | null;
  situation?: { id: string; code: string; name: string } | null;
};

type DraftLine = {
  key: string;
  productId: string;
  quantity: string;
  discountPercent: string;
};

let lineSeq = 0;
function newLine(): DraftLine {
  lineSeq += 1;
  return { key: `l-${lineSeq}`, productId: "", quantity: "1", discountPercent: "" };
}

function customerLabel(c: LookupCustomer): string {
  const title = c.tradeName?.trim() || c.name;
  const extra = [c.legalName?.trim() && c.legalName !== title ? c.legalName : null, c.city?.trim()]
    .filter(Boolean)
    .join(" · ");
  return extra ? `${title} — ${extra}` : title;
}

function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (order: CreatedOrder) => void;
}>;

export function CreateOrderSheet({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const { activeEstablishmentId, activeEstablishment } =
    useActiveEstablishment();
  const [sellerId, setSellerId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [paymentConditionId, setPaymentConditionId] = useState("");
  const [priceTableId, setPriceTableId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [showValidation, setShowValidation] = useState(false);

  const lookupsQ = useQuery({
    queryKey: ["admin", "orders", "lookups", user?.organizationId],
    queryFn: () =>
      apiFetch<{
        sellers: LookupSeller[];
        customers: LookupCustomer[];
        paymentConditions: LookupPayment[];
        priceTables: LookupPriceTable[];
      }>("/admin/orders/lookups"),
    enabled: open,
  });

  const sellers = lookupsQ.data?.sellers ?? [];
  const customers = lookupsQ.data?.customers ?? [];
  const paymentConditions = lookupsQ.data?.paymentConditions ?? [];
  const priceTables = lookupsQ.data?.priceTables ?? [];

  const applicablePriceTables = useMemo(() => {
    const selectedCustomer = customers.find((c) => c.id === customerId);
    const selectedSeller = sellers.find((s) => s.id === sellerId);
    const now = new Date();
    const allowed =
      selectedSeller?.allowedPriceTableIds &&
      selectedSeller.allowedPriceTableIds.length > 0
        ? new Set(selectedSeller.allowedPriceTableIds)
        : null;
    return priceTables.filter((t) => {
      if (!isPriceTableUsable(t, now)) return false;
      if (allowed && !allowed.has(t.id)) return false;
      if (t.sellerId && sellerId && t.sellerId !== sellerId) return false;
      if (t.customerId && customerId && t.customerId !== customerId) return false;
      if (
        t.regionId &&
        selectedCustomer?.regionId &&
        t.regionId !== selectedCustomer.regionId
      ) {
        return false;
      }
      return true;
    });
  }, [priceTables, sellerId, customerId, customers, sellers]);

  useEffect(() => {
    if (!open) return;
    setShowValidation(false);
    const preferredSeller =
      (user?.sellerId && sellers.some((s) => s.id === user.sellerId)
        ? user.sellerId
        : "") ||
      (sellers.length === 1 ? sellers[0].id : SELLER_DIRECT);
    setSellerId((prev) => prev || preferredSeller);
    setPaymentConditionId((prev) => {
      if (prev) return prev;
      return paymentConditions.length === 1 ? paymentConditions[0].id : "";
    });
  }, [open, sellers, paymentConditions, user?.sellerId]);

  const skipTableConfirm = useRef(false);

  useEffect(() => {
    if (!open) return;
    setPriceTableId((prev) => {
      if (!paymentConditionId) return "";
      const selectedCustomer = customers.find((c) => c.id === customerId);
      const selectedSeller = sellers.find((s) => s.id === sellerId);
      const suggested = pickDefaultPriceTableId({
        allowedTableIds: applicablePriceTables.map((t) => t.id),
        customerDefaultId: selectedCustomer?.defaultPriceTableId,
        sellerDefaultId: selectedSeller?.defaultPriceTableId,
      });
      if (prev && applicablePriceTables.some((t) => t.id === prev)) return prev;
      skipTableConfirm.current = true;
      return suggested ?? "";
    });
  }, [
    open,
    paymentConditionId,
    applicablePriceTables,
    customers,
    sellers,
    customerId,
    sellerId,
  ]);

  const apiSellerId = resolveApiSellerId(sellerId);

  const catalogQ = useQuery({
    queryKey: [
      "admin",
      "orders",
      "catalog",
      user?.organizationId,
      apiSellerId ?? "direct",
      customerId || "",
      priceTableId || "",
    ],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (apiSellerId) qs.set("sellerId", apiSellerId);
      if (customerId) qs.set("customerId", customerId);
      if (priceTableId) qs.set("priceTableId", priceTableId);
      return apiFetch<{ products: CatalogProduct[] }>(
        `/admin/orders/catalog?${qs.toString()}`,
      );
    },
    enabled: open,
  });
  const products = catalogQ.data?.products ?? [];

  const payloadItems = useMemo(
    () =>
      lines
        .map((l) => ({
          productId: l.productId,
          quantity: Number.parseInt(l.quantity, 10),
          discountPercent: l.discountPercent.trim()
            ? Number(l.discountPercent)
            : undefined,
        }))
        .filter(
          (l) =>
            l.productId &&
            Number.isInteger(l.quantity) &&
            l.quantity > 0 &&
            (l.discountPercent == null ||
              (Number.isFinite(l.discountPercent) &&
                l.discountPercent >= 0 &&
                l.discountPercent <= 100)),
        ),
    [lines],
  );
  const debouncedItems = useDebouncedValue(payloadItems);

  const previewQ = useQuery({
    queryKey: [
      "admin",
      "orders",
      "preview",
      user?.organizationId,
      apiSellerId ?? "direct",
      customerId,
      priceTableId,
      debouncedItems,
    ],
    queryFn: () =>
      apiFetch<PreviewResponse>("/admin/orders/preview", {
        method: "POST",
        body: JSON.stringify({
          sellerId: apiSellerId,
          customerId,
          priceTableId: priceTableId || undefined,
          items: debouncedItems,
        }),
      }),
    enabled:
      open &&
      Boolean(customerId && debouncedItems.length > 0),
    retry: false,
  });

  const fieldErrors = useMemo(() => {
    if (!showValidation) return {} as Record<string, string>;
    const err: Record<string, string> = {};
    if (!customerId) err.customerId = "Selecione o cliente.";
    if (!paymentConditionId) {
      err.paymentConditionId = "Selecione a condição de pagamento.";
    }
    if (paymentConditionId && applicablePriceTables.length > 0 && !priceTableId) {
      err.priceTableId = "Selecione a tabela de preço.";
    }
    if (payloadItems.length === 0) {
      err.items = "Inclua ao menos um produto com quantidade.";
    }
    return err;
  }, [
    showValidation,
    customerId,
    paymentConditionId,
    priceTableId,
    applicablePriceTables.length,
    payloadItems.length,
  ]);

  useScrollToFirstError(fieldErrors, { enabled: showValidation && open });

  function resetForm() {
    setSellerId("");
    setCustomerId("");
    setCustomerQuery("");
    setPaymentConditionId("");
    setPriceTableId("");
    setNotes("");
    setLines([newLine()]);
    setShowValidation(false);
  }

  function close() {
    onOpenChange(false);
    resetForm();
  }

  const createOrder = useMutation({
    mutationFn: (status: "DRAFT" | "CONFIRMED") =>
      apiFetch<CreatedOrder>("/admin/orders", {
        method: "POST",
        body: JSON.stringify({
          sellerId: apiSellerId,
          customerId,
          paymentConditionId,
          priceTableId: priceTableId || undefined,
          establishmentId: activeEstablishmentId || undefined,
          status,
          notes: notes.trim() || undefined,
          items: payloadItems,
        }),
      }),
    onSuccess: (order) => {
      onCreated(order);
      close();
    },
  });

  function submit(status: "DRAFT" | "CONFIRMED") {
    setShowValidation(true);
    if (
      !customerId ||
      !paymentConditionId ||
      (applicablePriceTables.length > 0 && !priceTableId) ||
      payloadItems.length === 0
    ) {
      return;
    }
    createOrder.mutate(status);
  }

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    const list = !q
      ? customers
      : customers.filter((c) => {
          const hay = [c.name, c.tradeName, c.legalName, c.city]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });
    const selected = customers.find((c) => c.id === customerId);
    if (selected && !list.some((c) => c.id === selected.id)) {
      return [selected, ...list];
    }
    return list;
  }, [customers, customerQuery, customerId]);

  const previewByProduct = useMemo(() => {
    const map = new Map<string, PreviewLine>();
    for (const line of previewQ.data?.lines ?? []) {
      map.set(`${line.productId}:${line.quantity}`, line);
    }
    return map;
  }, [previewQ.data?.lines]);

  const formError =
    createOrder.error
      ? getErrorMessage(createOrder.error)
      : previewQ.isError
        ? getErrorMessage(previewQ.error)
        : null;
  const credit = previewQ.data?.credit;
  const pending = createOrder.isPending;

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
      title="Novo pedido"
      description={
        activeEstablishment
          ? `CNPJ emissor: ${activeEstablishment.tradeName || activeEstablishment.legalName}. Preços seguem tabela do cliente/vendedor.`
          : "Lançamento pelo escritório. Preços seguem a tabela do cliente e do vendedor."
      }
      contentClassName="sm:max-h-[92vh]"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => submit("DRAFT")}
            disabled={pending}
          >
            {pending && createOrder.variables === "DRAFT"
              ? "Salvando…"
              : "Salvar rascunho"}
          </Button>
          <Button
            type="button"
            onClick={() => submit("CONFIRMED")}
            disabled={pending || credit?.action === "BLOCK"}
          >
            {pending && createOrder.variables === "CONFIRMED"
              ? "Confirmando…"
              : "Confirmar pedido"}
          </Button>
        </>
      }
    >
      <FormErrorBanner message={formError} />

      {lookupsQ.isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar clientes, vendedores e condições.
        </p>
      ) : null}

      <FormGrid cols={2}>
        <FormField
          label="Cliente"
          htmlFor="new-order-customer"
          required
          error={fieldErrors.customerId}
        >
          <Input
            id="new-order-customer-search"
            placeholder="Buscar cliente…"
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            className="mb-2"
          />
          <AppSelect
            id="new-order-customer"
            value={customerId}
            onValueChange={setCustomerId}
            placeholder="Selecione o cliente"
            invalid={Boolean(fieldErrors.customerId)}
            options={filteredCustomers.map((c) => ({
              value: c.id,
              label: customerLabel(c),
            }))}
          />
        </FormField>
        <FormField
          label="Vendedor responsável"
          htmlFor="new-order-seller"
          error={fieldErrors.sellerId}
          hint="Opcional. Sem seleção ou «Venda Direta» = sem comissão."
        >
          <AppSelect
            id="new-order-seller"
            value={sellerId || SELLER_DIRECT}
            onValueChange={(id) => {
              setSellerId(id);
              setLines((prev) =>
                prev.map((l) => ({ ...l, productId: "" })),
              );
            }}
            placeholder="Venda Direta"
            invalid={Boolean(fieldErrors.sellerId)}
            options={[
              { value: SELLER_DIRECT, label: DIRECT_SALE_OPTION_LABEL },
              ...sellers.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </FormField>
        <FormField
          label="Condição de pagamento"
          htmlFor="new-order-pay"
          required
          error={fieldErrors.paymentConditionId}
        >
          <AppSelect
            id="new-order-pay"
            value={paymentConditionId}
            onValueChange={(id) => {
              setPaymentConditionId(id);
              setPriceTableId("");
            }}
            placeholder={
              paymentConditions.length
                ? "Selecione"
                : "Nenhuma condição cadastrada"
            }
            invalid={Boolean(fieldErrors.paymentConditionId)}
            options={paymentConditions.map((p) => ({
              value: p.id,
              label: `${p.code} · ${p.name}`,
            }))}
          />
        </FormField>
        {paymentConditionId ? (
          <FormField
            label="Tabela de preço"
            htmlFor="new-order-price-table"
            required={applicablePriceTables.length > 0}
            error={fieldErrors.priceTableId}
            hint={
              applicablePriceTables.length === 0
                ? "Nenhuma tabela aplicável a este cliente/vendedor. O pedido usa o preço base."
                : "Aparece após a condição de pagamento. Define o preço dos itens."
            }
          >
            <AppSelect
              id="new-order-price-table"
              value={priceTableId}
              onValueChange={(id) => {
                const hasItems = lines.some((l) => l.productId);
                if (!hasItems || skipTableConfirm.current || !priceTableId) {
                  skipTableConfirm.current = false;
                  setPriceTableId(id);
                  return;
                }
                void confirm({
                  title: "Alterar tabela de preço?",
                  description:
                    "Alterar a tabela de preço recalculará os preços dos produtos deste pedido.",
                  confirmLabel: "Alterar tabela",
                  cancelLabel: "Cancelar",
                  tone: "default",
                }).then((ok) => {
                  if (ok) setPriceTableId(id);
                });
              }}
              placeholder={
                applicablePriceTables.length
                  ? "Selecione a tabela"
                  : "Nenhuma tabela aplicável"
              }
              invalid={Boolean(fieldErrors.priceTableId)}
              options={applicablePriceTables.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
            />
          </FormField>
        ) : null}
        <FormField label="Observação" htmlFor="new-order-notes">
          <Textarea
            id="new-order-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
            rows={2}
          />
        </FormField>
      </FormGrid>

      <FormSection
        title="Itens"
        description={
          sellerId && products.length === 0 && !catalogQ.isPending
            ? "Este vendedor não tem produtos no catálogo. Associe produtos em Vendedores."
            : "Quantidade e preço efetivo (tabela / promoção). Desconto extra é opcional."
        }
        className="mt-6"
      >
        {fieldErrors.items ? (
          <p className="mb-2 text-xs text-destructive" data-error="true">
            {fieldErrors.items}
          </p>
        ) : null}

        <div className="space-y-3">
          {lines.map((line) => {
            const qty = Number.parseInt(line.quantity, 10) || 0;
            const product = products.find((p) => p.id === line.productId);
            const previewLine =
              previewByProduct.get(`${line.productId}:${qty}`) ??
              previewQ.data?.lines.find((l) => l.productId === line.productId);
            const unit =
              previewLine?.unitPrice ?? product?.effectiveUnitPrice ?? null;
            const maxDisc = product?.maxSellerDiscountPercentEffective ?? 0;
            return (
              <div
                key={line.key}
                className="grid gap-3 rounded-lg border border-border p-3 pb-5 sm:grid-cols-[minmax(0,1.6fr)_5.5rem_5.5rem_minmax(0,7rem)_auto] sm:items-start"
              >
                <FormField label="Produto" htmlFor={`item-prod-${line.key}`}>
                  <ProductCombobox
                    id={`item-prod-${line.key}`}
                    value={line.productId}
                    onValueChange={(productId) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key ? { ...l, productId } : l,
                        ),
                      )
                    }
                    products={products}
                    disabled={!sellerId || products.length === 0}
                    placeholder={
                      sellerId
                        ? "Buscar produto…"
                        : "Selecione o vendedor primeiro"
                    }
                  />
                </FormField>
                <FormField label="Qtd" htmlFor={`item-qty-${line.key}`}>
                  <Input
                    id={`item-qty-${line.key}`}
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
                  label="Desc. %"
                  htmlFor={`item-disc-${line.key}`}
                  hint={maxDisc > 0 ? `Máx. ${maxDisc}%` : undefined}
                  hintOverlay
                >
                  <Input
                    id={`item-disc-${line.key}`}
                    inputMode="decimal"
                    disabled={maxDisc <= 0}
                    title={
                      maxDisc > 0 ? `Desconto máximo: ${maxDisc}%` : undefined
                    }
                    value={line.discountPercent}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key
                            ? { ...l, discountPercent: e.target.value }
                            : l,
                        ),
                      )
                    }
                  />
                </FormField>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    Preço
                  </span>
                  <p className="flex h-9 items-center text-sm text-muted-foreground">
                    {unit != null ? formatOrderMoney(unit) : "—"}
                    {previewLine?.priceOriginLabel ? (
                      <span className="ml-1 truncate text-xs">
                        {previewLine.priceOriginLabel}
                      </span>
                    ) : product?.promotionLabel ? (
                      <span className="ml-1 truncate text-xs">
                        {product.promotionLabel}
                      </span>
                    ) : null}
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
          disabled={!sellerId || products.length === 0}
        >
          <Plus />
          Adicionar item
        </Button>
      </FormSection>

      {previewQ.data ? (
        <div className="mt-4 space-y-1 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatOrderMoney(previewQ.data.grossLinesTotal)}</span>
          </div>
          {previewQ.data.comboDiscountTotal > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Desconto de combo</span>
              <span>
                − {formatOrderMoney(previewQ.data.comboDiscountTotal)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span>{formatOrderMoney(previewQ.data.netTotal)}</span>
          </div>
        </div>
      ) : null}

      {credit?.action === "BLOCK" ? (
        <div className="mt-3 space-y-2 text-sm text-destructive" role="alert">
          <p>
            {credit.violations.map((v) => v.message).join(" ")} Você ainda pode
            salvar como rascunho.
          </p>
          {credit.check?.overdueReceivables?.length ? (
            <ul className="list-inside list-disc text-xs">
              {credit.check.overdueReceivables.slice(0, 5).map((r) => (
                <li key={r.id}>
                  Boleto {r.nossoNumero ?? r.id.slice(0, 8)} — R${" "}
                  {r.remaining.toFixed(2).replace(".", ",")} (venc.{" "}
                  {new Date(r.dueDate).toLocaleDateString("pt-BR")})
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {credit?.action === "APPROVAL" ? (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-300">
          Ao confirmar, o pedido ficará aguardando aprovação de crédito.
          {credit.check?.overdueAmount
            ? ` Vencido: R$ ${credit.check.overdueAmount.toFixed(2).replace(".", ",")}.`
            : ""}
        </p>
      ) : null}
      {credit?.action === "ALLOW" && credit.check?.status === "WARN" ? (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-300">
          {credit.violations.map((v) => v.message).join(" ")}
        </p>
      ) : null}
    </FormSheet>
  );
}
