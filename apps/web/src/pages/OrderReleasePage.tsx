import { useAuth } from "@/auth/AuthContext";
import { useConfirm } from "@/components/confirm";
import { FilterBar, FormField } from "@/components/forms";
import { EditOrderItemsSheet } from "@/components/orders/EditOrderItemsSheet";
import { ProductListCell } from "@/components/ProductCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { getErrorMessage } from "@/lib/api-error";
import { formatOrderCode } from "@/lib/order-code";
import { isWebAdmin } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { DIRECT_SALE_LABEL, canWrite as canWritePermission } from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Pencil,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

type CreditReason = { code?: string; message?: string };

type ReleaseOrder = {
  id: string;
  orderNumber?: number | null;
  status?: string;
  totalAmount: unknown;
  notes: string | null;
  creditHoldReasons?: CreditReason[] | unknown;
  releaseDecision?: string | null;
  releaseNote?: string | null;
  releasedAt?: string | null;
  createdAt: string;
  sellerId?: string | null;
  customerId?: string | null;
  priceTableId?: string | null;
  seller: {
    id?: string;
    user: { name: string; email?: string; phone?: string | null };
  } | null;
  createdByUser?: { id: string; name: string; email: string } | null;
  releasedByUser?: { id: string; name: string; email: string } | null;
  customer: {
    id?: string;
    name: string;
    tradeName?: string | null;
    legalName?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    document?: string | null;
    creditBlocked?: boolean;
    creditLimit?: unknown;
  } | null;
  paymentCondition?: {
    id: string;
    name: string;
    days: number;
  } | null;
  items: {
    id: string;
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: unknown;
    product: {
      id?: string;
      name: string;
      sku: string | null;
      imageUrl?: string | null;
    };
  }[];
};

type ReleaseHistoryRow = {
  id: string;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
  metadata: {
    decision?: string;
    note?: string | null;
  } | null;
};

function formatMoney(value: unknown) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function customerLabel(o: ReleaseOrder) {
  return (
    o.customer?.tradeName?.trim() ||
    o.customer?.name ||
    o.customer?.legalName ||
    "—"
  );
}

function sellerLabel(o: ReleaseOrder) {
  return o.seller?.user?.name?.trim() || DIRECT_SALE_LABEL;
}

function parseCreditReasons(raw: unknown): CreditReason[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter(
      (r): r is CreditReason =>
        r != null && typeof r === "object" && ("message" in r || "code" in r),
    );
  }
  return [];
}

function financialSituationLabel(reasons: CreditReason[], order: ReleaseOrder) {
  if (order.customer?.creditBlocked) return "Bloqueado";
  if (reasons.some((r) => r.code === "OVERDUE_TITLES")) return "Inadimplente";
  if (
    reasons.some(
      (r) =>
        r.code === "CREDIT_LIMIT" ||
        r.code === "LIMIT_EXCEEDED" ||
        r.code === "LIMIT_OVERDRAWN",
    )
  ) {
    return "Limite excedido";
  }
  if (reasons.length > 0) return "Alerta financeiro";
  return "Em dia";
}

export function OrderReleasePage() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("orderId");

  const [orderNumber, setOrderNumber] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [sellerQ, setSellerQ] = useState("");
  const [note, setNote] = useState("");
  const [editItemsOpen, setEditItemsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canWrite =
    Boolean(user) &&
    (user!.role === "ADMIN" || user!.role === "MANAGER") &&
    canWritePermission(user!.role, "orders", user!.permissions);
  const canEditItems = isWebAdmin(user?.role) && canWrite;

  const listQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("status", "PENDING_CREDIT_APPROVAL");
    if (orderNumber.trim()) p.set("orderNumber", orderNumber.trim());
    if (customerQ.trim()) p.set("name", customerQ.trim());
    return p.toString();
  }, [orderNumber, customerQ]);

  const {
    data: orders = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["admin", "orders", "pending-release", listQs],
    queryFn: () =>
      apiFetch<ReleaseOrder[]>(`/admin/orders?${listQs}`),
  });

  const filteredOrders = useMemo(() => {
    const s = sellerQ.trim().toLowerCase();
    if (!s) return orders;
    return orders.filter((o) => sellerLabel(o).toLowerCase().includes(s));
  }, [orders, sellerQ]);

  useEffect(() => {
    if (!selectedId && filteredOrders.length > 0) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("orderId", filteredOrders[0]!.id);
          return next;
        },
        { replace: true },
      );
    }
  }, [filteredOrders, selectedId, setSearchParams]);

  const { data: selected, isLoading: detailLoading } = useQuery({
    queryKey: ["admin", "order", selectedId],
    queryFn: () => apiFetch<ReleaseOrder>(`/admin/orders/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const { data: history = [] } = useQuery({
    queryKey: ["admin", "order-release-history", selectedId],
    queryFn: () =>
      apiFetch<ReleaseHistoryRow[]>(
        `/admin/orders/${selectedId}/release-history`,
      ),
    enabled: Boolean(selectedId),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    void qc.invalidateQueries({ queryKey: ["admin", "order", selectedId] });
    void qc.invalidateQueries({
      queryKey: ["admin", "order-release-history", selectedId],
    });
    void qc.invalidateQueries({
      queryKey: ["admin", "pending-credit-summary"],
    });
    void qc.invalidateQueries({
      queryKey: ["admin", "pending-release-summary"],
    });
    void qc.invalidateQueries({
      queryKey: ["admin", "notifications-unread"],
    });
  };

  const releaseMut = useMutation({
    mutationFn: (action: "APPROVE" | "REJECT" | "HOLD") =>
      apiFetch(`/admin/orders/${selectedId}/release`, {
        method: "POST",
        body: JSON.stringify({ action, note: note.trim() || null }),
      }),
    onSuccess: (_data, action) => {
      setActionError(null);
      setNote("");
      invalidate();
      if (action !== "HOLD") {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete("orderId");
          return next;
        });
      }
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  async function runAction(action: "APPROVE" | "REJECT" | "HOLD") {
    if (!selectedId || !canWrite) return;
    setActionError(null);
    const labels = {
      APPROVE: "Liberar este pedido para separação?",
      REJECT: "Rejeitar e cancelar este pedido?",
      HOLD: "Manter o pedido em espera?",
    } as const;
    const ok = await confirm({
      title: labels[action],
      description:
        action === "APPROVE"
          ? "O pedido entrará em Pedidos com etapa Separando e o estoque será baixado."
          : action === "REJECT"
            ? "O pedido será cancelado e não seguirá para separação."
            : "O pedido permanece na fila de liberação.",
      tone: action === "REJECT" ? "danger" : "default",
    });
    if (!ok) return;
    releaseMut.mutate(action);
  }

  const reasons = parseCreditReasons(selected?.creditHoldReasons);
  const financeLabel = selected
    ? financialSituationLabel(reasons, selected)
    : "—";
  const financeAlert = reasons.length > 0 || selected?.customer?.creditBlocked;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Liberação de Pedidos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analise, ajuste e libere pedidos recebidos antes da separação.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit tabular-nums">
          {filteredOrders.length} pendente
          {filteredOrders.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <FilterBar className="p-4 lg:grid-cols-3">
        <FormField label="Nº do pedido" htmlFor="rel-num">
          <Input
            id="rel-num"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Número"
            value={orderNumber}
            onChange={(e) =>
              setOrderNumber(e.target.value.replace(/\D/g, ""))
            }
          />
        </FormField>
        <FormField label="Cliente" htmlFor="rel-cli">
          <Input
            id="rel-cli"
            placeholder="Nome / fantasia"
            value={customerQ}
            onChange={(e) => setCustomerQ(e.target.value)}
          />
        </FormField>
        <FormField label="Vendedor" htmlFor="rel-vend">
          <Input
            id="rel-vend"
            placeholder="Nome do vendedor"
            value={sellerQ}
            onChange={(e) => setSellerQ(e.target.value)}
          />
        </FormField>
      </FilterBar>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">Fila de liberação</h2>
          </div>
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : isError ? (
            <p className="p-4 text-sm text-destructive">
              Não foi possível carregar a fila.
            </p>
          ) : filteredOrders.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhum pedido aguardando liberação.
            </p>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação financeira</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((o) => {
                    const rowReasons = parseCreditReasons(o.creditHoldReasons);
                    const sit = financialSituationLabel(rowReasons, o);
                    const active = o.id === selectedId;
                    return (
                      <TableRow
                        key={o.id}
                        className={cn(
                          "cursor-pointer",
                          active && "bg-muted/60",
                        )}
                        onClick={() =>
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev);
                            next.set("orderId", o.id);
                            return next;
                          })
                        }
                      >
                        <TableCell className="font-medium tabular-nums">
                          {formatOrderCode(o)}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate">
                          {customerLabel(o)}
                        </TableCell>
                        <TableCell className="max-w-[8rem] truncate">
                          {sellerLabel(o)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDateTime(o.createdAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(o.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              sit === "Em dia" ? "secondary" : "destructive"
                            }
                            className="whitespace-nowrap"
                          >
                            {sit}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          {!selectedId ? (
            <p className="text-sm text-muted-foreground">
              Selecione um pedido na fila.
            </p>
          ) : detailLoading || !selected ? (
            <p className="text-sm text-muted-foreground">Carregando detalhe…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Pedido</p>
                  <h2 className="text-xl font-semibold tabular-nums">
                    #{formatOrderCode(selected)}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDateTime(selected.createdAt)} ·{" "}
                    {sellerLabel(selected)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {formatMoney(selected.totalAmount)}
                  </p>
                  <Badge
                    variant={
                      financeLabel === "Em dia" ? "secondary" : "destructive"
                    }
                    className="mt-1"
                  >
                    {financeLabel}
                  </Badge>
                </div>
              </div>

              {financeAlert ? (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-100">
                    <ShieldAlert className="size-4 shrink-0" />
                    Alertas financeiros
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-amber-950/90 dark:text-amber-50/90">
                    {selected.customer?.creditBlocked ? (
                      <li>Cliente bloqueado para novas vendas.</li>
                    ) : null}
                    {reasons.map((r, i) => (
                      <li key={`${r.code ?? "r"}-${i}`}>
                        {r.message || r.code || "Alerta de crédito"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Sem restrições financeiras registradas neste pedido.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    Cliente
                  </p>
                  <p className="mt-1 font-medium">{customerLabel(selected)}</p>
                  <p className="text-muted-foreground">
                    {[selected.customer?.city, selected.customer?.state]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </p>
                  {selected.customer?.phone ? (
                    <p className="text-muted-foreground">
                      {selected.customer.phone}
                    </p>
                  ) : null}
                  {selected.customerId ? (
                    <Link
                      to={`/clientes?q=${encodeURIComponent(selected.customer?.name ?? "")}`}
                      className="mt-2 inline-block text-xs text-primary hover:underline"
                    >
                      Ver cadastro
                    </Link>
                  ) : null}
                </div>
                <div className="rounded-md border border-border p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    Financeiro / pagamento
                  </p>
                  <p className="mt-1">
                    Cond.: {selected.paymentCondition?.name ?? "—"}
                  </p>
                  <p className="text-muted-foreground">
                    Limite:{" "}
                    {selected.customer?.creditLimit != null
                      ? formatMoney(selected.customer.creditLimit)
                      : "—"}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Produtos</h3>
                  {canEditItems ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditItemsOpen(true)}
                    >
                      <Pencil className="size-3.5" />
                      Editar itens
                    </Button>
                  ) : null}
                </div>
                <div className="overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Preço</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.items.map((it) => (
                        <TableRow key={it.id}>
                          <TableCell>
                            <ProductListCell
                              product={{
                                id: it.product?.id ?? it.productId ?? it.id,
                                name: it.product?.name ?? it.productName,
                                sku: it.product?.sku,
                                imageUrl: it.product?.imageUrl,
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {it.quantity}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(it.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(
                              Number(it.unitPrice) * Number(it.quantity),
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-2 text-right text-sm font-medium tabular-nums">
                  Total {formatMoney(selected.totalAmount)}
                </p>
              </div>

              {selected.notes ? (
                <div className="rounded-md border border-border p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    Observações
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{selected.notes}</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <FormField label="Observação da liberação" htmlFor="rel-note">
                  <Textarea
                    id="rel-note"
                    rows={2}
                    placeholder="Opcional — fica no histórico"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={!canWrite || releaseMut.isPending}
                  />
                </FormField>
                {actionError ? (
                  <p className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {actionError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={!canWrite || releaseMut.isPending}
                    onClick={() => void runAction("APPROVE")}
                  >
                    <CheckCircle2 className="size-4" />
                    Liberar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!canWrite || releaseMut.isPending}
                    onClick={() => void runAction("REJECT")}
                  >
                    <XCircle className="size-4" />
                    Rejeitar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canWrite || releaseMut.isPending}
                    onClick={() => void runAction("HOLD")}
                  >
                    <Clock3 className="size-4" />
                    Manter em espera
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">
                  Histórico de liberação
                </h3>
                {history.length === 0 && !selected.releasedAt ? (
                  <p className="text-sm text-muted-foreground">
                    Ainda sem decisões registradas.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {selected.releasedAt && history.length === 0 ? (
                      <li className="rounded-md border border-border px-3 py-2">
                        <span className="font-medium">
                          {selected.releaseDecision ?? "—"}
                        </span>
                        {" · "}
                        {selected.releasedByUser?.name ?? "—"}
                        {" · "}
                        {formatDateTime(selected.releasedAt)}
                        {selected.releaseNote ? (
                          <p className="mt-1 text-muted-foreground">
                            {selected.releaseNote}
                          </p>
                        ) : null}
                      </li>
                    ) : null}
                    {history.map((h) => (
                      <li
                        key={h.id}
                        className="rounded-md border border-border px-3 py-2"
                      >
                        <span className="font-medium">
                          {h.metadata?.decision ?? "—"}
                        </span>
                        {" · "}
                        {h.user?.name ?? "—"}
                        {" · "}
                        {formatDateTime(h.createdAt)}
                        {h.metadata?.note ? (
                          <p className="mt-1 text-muted-foreground">
                            {h.metadata.note}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <EditOrderItemsSheet
                open={editItemsOpen}
                onOpenChange={setEditItemsOpen}
                order={selected}
                onSaved={() => {
                  invalidate();
                }}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
