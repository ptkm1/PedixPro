import { useAuth } from "@/auth/AuthContext";
import { AuditLogPanel } from "@/components/AuditLogPanel";
import { useConfirm } from "@/components/confirm";
import { ProductListCell } from "@/components/ProductCombobox";
import { AppSelect } from "@/components/ui/app-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, downloadPdf, printPdf } from "@/lib/api";
import { formatOrderCode, orderCodeFilenamePart } from "@/lib/order-code";
import {
  needsStageConfirmDialog,
  stageBadgeClass,
  stageChangeHint,
} from "@/lib/order-kanban";
import { isWebAdmin } from "@/lib/staff";
import { cn } from "@/lib/utils";
import {
  DIRECT_SALE_LABEL,
  DIRECT_SALE_OPTION_LABEL,
  ORDER_SELLER_FILTER_DIRECT,
  SYSTEM_SITUATION_CODES,
  canRead,
  canWrite as canWritePermission,
  formatBrazilPhoneDigits,
} from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

type OrderSituation = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  mapsToCancel?: boolean;
};

type Order = {
  id: string;
  orderNumber?: number | null;
  status?: string;
  situationId?: string | null;
  situation?: OrderSituation | null;
  totalAmount: unknown;
  notes: string | null;
  creditHoldReasons?: unknown;
  createdAt: string;
  sellerId?: string | null;
  seller: {
    id?: string;
    user: { name: string; email: string; phone?: string | null };
  } | null;
  createdByUser?: { id: string; name: string; email: string } | null;
  customer: { name: string; email: string | null } | null;
  items: {
    id: string;
    productId?: string;
    productName: string;
    quantity: number;
    unitPrice: unknown;
    commissionPercent?: unknown;
    commissionAmount?: unknown;
    product: {
      id?: string;
      name: string;
      sku: string | null;
      imageUrl?: string | null;
    };
  }[];
};

function formatMoney(value: unknown) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const EDITABLE_SELLER_STATUSES = new Set([
  "DRAFT",
  "CONFIRMED",
  "PENDING_CREDIT_APPROVAL",
]);

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const canWriteOrders = Boolean(
    user &&
      (user.role === "ADMIN" || user.role === "MANAGER") &&
      canWritePermission(user.role, "orders", user.permissions),
  );
  const canWriteStage = isWebAdmin(user?.role);
  const canPrint80mm = Boolean(
    user && canRead(user.role, "orders_print_80mm", user.permissions),
  );
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const [pdfPending, setPdfPending] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin", "order", orderId],
    queryFn: () => apiFetch<Order>(`/admin/orders/${orderId}`),
    enabled: !!orderId,
  });

  const { data: lookups } = useQuery({
    queryKey: ["admin", "orders", "lookups", user?.organizationId],
    queryFn: () =>
      apiFetch<{ sellers: { id: string; name: string }[] }>(
        "/admin/orders/lookups",
      ),
    enabled: canWriteOrders,
  });

  const { data: situations = [] } = useQuery({
    queryKey: ["admin", "order-situations"],
    queryFn: () => apiFetch<OrderSituation[]>("/admin/order-situations"),
    enabled: canWriteStage,
  });

  const patchSituation = useMutation({
    mutationFn: (situationId: string) =>
      apiFetch(`/admin/orders/${orderId}/situation`, {
        method: "PATCH",
        body: JSON.stringify({ situationId }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "order", orderId] });
      void qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      void qc.invalidateQueries({
        queryKey: ["admin", "pending-credit-summary"],
      });
      void qc.invalidateQueries({
        queryKey: ["admin", "notifications-unread"],
      });
    },
  });

  const patchSeller = useMutation({
    mutationFn: (sellerId: string | null) =>
      apiFetch(`/admin/orders/${orderId}/seller`, {
        method: "PATCH",
        body: JSON.stringify({ sellerId }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "order", orderId] });
      void qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });

  const canEditSeller =
    canWriteOrders &&
    order &&
    EDITABLE_SELLER_STATUSES.has(order.status ?? "");

  async function handlePrintPdf() {
    if (!orderId) return;
    setPdfErr(null);
    setPdfPending(true);
    try {
      await printPdf(`/admin/orders/${orderId}/pdf`);
    } catch {
      setPdfErr("Não foi possível gerar o PDF para impressão.");
    } finally {
      setPdfPending(false);
    }
  }

  async function handlePrint80mm() {
    if (!orderId) return;
    setPdfErr(null);
    setPdfPending(true);
    try {
      await printPdf(`/admin/orders/${orderId}/pdf-80mm`);
    } catch {
      setPdfErr("Não foi possível gerar o cupom 80mm para impressão.");
    } finally {
      setPdfPending(false);
    }
  }

  async function handleDownloadPdf() {
    if (!orderId || !order) return;
    setPdfErr(null);
    setPdfPending(true);
    try {
      await downloadPdf(
        `/admin/orders/${orderId}/pdf`,
        `pedido-${orderCodeFilenamePart(order)}.pdf`,
      );
    } catch {
      setPdfErr("Não foi possível baixar o PDF.");
    } finally {
      setPdfPending(false);
    }
  }

  async function handleStageChange(situationId: string) {
    if (!order || !situationId || situationId === order.situationId) return;
    const target = situations.find((s) => s.id === situationId);
    if (!target) return;
    if (
      needsStageConfirmDialog(order.status, {
        code: target.code,
        mapsToCancel: target.mapsToCancel,
      })
    ) {
      const ok = await confirm({
        title: "Alterar etapa do pedido?",
        description: `A etapa será alterada para “${target.name}”.${stageChangeHint(target.code, target.mapsToCancel)}`,
        confirmLabel: "Alterar etapa",
        tone:
          target.mapsToCancel || target.code === SYSTEM_SITUATION_CODES.CANCELLED
            ? "destructive"
            : "default",
      });
      if (!ok) return;
    }
    patchSituation.mutate(situationId);
  }

  function situationSelectOptions() {
    if (!order) return [];
    const active = situations.filter((s) => s.active);
    const current = order.situation;
    const opts = active.map((s) => ({ value: s.id, label: s.name }));
    if (current && !active.some((s) => s.id === current.id)) {
      opts.push({
        value: current.id,
        label: `${current.name} (inativa)`,
      });
    }
    return opts;
  }

  if (!orderId) return null;

  const backLink = (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
        <Link to="/pedidos">
          <ArrowLeft className="size-4" />
          Todos os pedidos
        </Link>
      </Button>
    </div>
  );

  if (isLoading || !order) {
    return (
      <div className="space-y-6">
        {backLink}
        <p className="text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  const code = formatOrderCode(order);
  const showCreditHold =
    (order.situation?.code === SYSTEM_SITUATION_CODES.CREDIT ||
      order.status === "PENDING_CREDIT_APPROVAL") &&
    order.creditHoldReasons != null;

  return (
    <div className="space-y-6">
      {backLink}

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-6 border-b border-border p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Pedido {code}
              </h1>
              <Badge
                variant="outline"
                className={stageBadgeClass(
                  order.situation?.code ?? "",
                  order.situation?.mapsToCancel,
                )}
              >
                {order.situation?.name ?? "—"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {new Date(order.createdAt).toLocaleString("pt-BR")}
            </p>
            <p className="text-3xl font-semibold tabular-nums text-foreground">
              {formatMoney(order.totalAmount)}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handlePrintPdf()}
                disabled={pdfPending}
              >
                <Printer className="size-4" />
                {pdfPending ? "Gerando…" : "Imprimir"}
              </Button>
              {canPrint80mm ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handlePrint80mm()}
                  disabled={pdfPending}
                >
                  <Printer className="size-4" />
                  Imprimir 80mm
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleDownloadPdf()}
                disabled={pdfPending}
              >
                <Download className="size-4" />
                Exportar PDF
              </Button>
            </div>
            {canWriteStage ? (
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="text-sm text-muted-foreground">Etapa</span>
                <AppSelect
                  value={order.situationId ?? ""}
                  disabled={patchSituation.isPending}
                  triggerClassName="w-auto min-w-[11rem]"
                  options={situationSelectOptions()}
                  onValueChange={(v) => void handleStageChange(v)}
                />
              </div>
            ) : null}
          </div>
        </div>

        {pdfErr ? (
          <p className="border-b border-border px-6 py-3 text-sm text-destructive">
            {pdfErr}
          </p>
        ) : null}
        {patchSituation.isError ? (
          <p className="border-b border-border px-6 py-3 text-sm text-destructive">
            {(patchSituation.error as Error).message ||
              "Não foi possível alterar a etapa."}
          </p>
        ) : null}

        <dl className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Cliente
            </dt>
            <dd className="mt-1.5 text-sm font-medium text-foreground">
              {order.customer?.name ?? "—"}
            </dd>
            {order.customer?.email ? (
              <dd className="mt-0.5 text-xs text-muted-foreground">
                {order.customer.email}
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Vendedor responsável
            </dt>
            {canEditSeller ? (
              <dd className="mt-1.5">
                <AppSelect
                  value={order.sellerId ?? ORDER_SELLER_FILTER_DIRECT}
                  disabled={patchSeller.isPending}
                  triggerClassName="w-full min-w-[14rem]"
                  options={[
                    {
                      value: ORDER_SELLER_FILTER_DIRECT,
                      label: DIRECT_SALE_OPTION_LABEL,
                    },
                    ...(lookups?.sellers ?? []).map((s) => ({
                      value: s.id,
                      label: s.name,
                    })),
                  ]}
                  onValueChange={(v) => {
                    const next =
                      !v || v === ORDER_SELLER_FILTER_DIRECT ? null : v;
                    patchSeller.mutate(next);
                  }}
                />
                {patchSeller.isError ? (
                  <p className="mt-1 text-xs text-destructive">
                    {(patchSeller.error as Error).message ||
                      "Não foi possível alterar o vendedor."}
                  </p>
                ) : null}
              </dd>
            ) : (
              <>
                <dd className="mt-1.5 text-sm font-medium text-foreground">
                  {order.seller?.user.name ?? DIRECT_SALE_LABEL}
                </dd>
                {order.seller?.user.email ? (
                  <dd className="mt-0.5 text-xs text-muted-foreground">
                    {order.seller.user.email}
                  </dd>
                ) : null}
                {order.seller?.user.phone?.trim() ? (
                  <dd className="mt-0.5 text-xs text-muted-foreground">
                    {formatBrazilPhoneDigits(order.seller.user.phone)}
                  </dd>
                ) : null}
              </>
            )}
            {order.createdByUser ? (
              <dd className="mt-1 text-xs text-muted-foreground">
                Lançado por {order.createdByUser.name}
              </dd>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Observações
            </dt>
            <dd className="mt-1.5 text-sm text-foreground">
              {order.notes?.trim() ? order.notes : "—"}
            </dd>
          </div>
        </dl>

        {showCreditHold ? (
          <div className="mx-6 mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Motivos de crédito
            </p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-amber-950/80 dark:text-amber-100/80">
              {JSON.stringify(order.creditHoldReasons, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-medium text-foreground">Itens</h2>
          <span className="text-sm text-muted-foreground">
            {order.items.length} {order.items.length === 1 ? "item" : "itens"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6">Produto</TableHead>
                <TableHead className="px-4 text-right">Qtd</TableHead>
                <TableHead className="px-4 text-right">Preço unit.</TableHead>
                <TableHead className="px-6 text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="px-6 py-3">
                    <ProductListCell
                      product={{
                        id: it.product?.id ?? it.productId ?? it.id,
                        name: it.product?.name ?? it.productName,
                        sku: it.product?.sku,
                        imageUrl: it.product?.imageUrl,
                      }}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right tabular-nums">
                    {it.quantity}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(it.unitPrice)}
                  </TableCell>
                  <TableCell className="px-6 py-3 text-right font-medium tabular-nums">
                    {formatMoney(Number(it.unitPrice) * it.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div
          className={cn(
            "flex items-center justify-between border-t border-border px-6 py-4",
          )}
        >
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatMoney(order.totalAmount)}
          </span>
        </div>
      </div>

      <div className="surface-card p-6">
        <AuditLogPanel entityType="Order" entityId={order.id} take={40} />
      </div>
    </div>
  );
}
