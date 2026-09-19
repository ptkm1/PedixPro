import { useAuth } from "@/auth/AuthContext";
import {
    formatCnpjShort,
    useActiveEstablishment,
} from "@/auth/EstablishmentContext";
import { useConfirm } from "@/components/confirm";
import { FilterBar, FormField } from "@/components/forms";
import { CreateOrderSheet } from "@/components/orders/CreateOrderSheet";
import { OrdersKanbanBoard } from "@/components/orders/OrdersKanbanBoard";
import { AppSelect } from "@/components/ui/app-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notifySuccess } from "@/lib/app-notifications";
import { apiFetch, downloadPdf, printPdf } from "@/lib/api";
import { formatOrderCode, orderCodeFilenamePart } from "@/lib/order-code";
import {
    formatOrderMoney,
    needsStageConfirmDialog,
    stageBadgeClass,
    stageChangeHint,
} from "@/lib/order-kanban";
import { isWebAdmin } from "@/lib/staff";
import { cn } from "@/lib/utils";
import {
    SYSTEM_SITUATION_CODES,
    canRead,
    canWrite as canWritePermission,
    paymentConditionLabel,
} from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Kanban, List, Printer, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

type Seller = { id: string; user: { name: string } };

type OrderSituation = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
  isSystem?: boolean;
  mapsToCancel?: boolean;
};

type Order = {
  id: string;
  orderNumber?: number | null;
  status?: string;
  situationId?: string | null;
  situation?: OrderSituation | null;
  totalAmount: unknown;
  createdAt: string;
  seller: { user: { name: string } };
  establishment?: {
    id: string;
    legalName: string;
    tradeName?: string | null;
    cnpj?: string | null;
  } | null;
  customer: {
    name: string;
    city?: string | null;
    tradeName?: string | null;
    legalName?: string | null;
  } | null;
  items: {
    id: string;
    productName: string;
    quantity: number;
    unitPrice: unknown;
  }[];
  paymentCondition?: {
    id: string;
    name: string;
    days: number;
    sortOrder: number;
  } | null;
};

function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function orderStageLabel(order: {
  situation?: { name?: string } | null;
}): string {
  return order.situation?.name ?? "—";
}

function selectAllState(
  allSelected: boolean,
  someSelected: boolean,
): boolean | "indeterminate" {
  if (allSelected) return true;
  if (someSelected) return "indeterminate";
  return false;
}

export function OrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canWrite = isWebAdmin(user?.role);
  const canCreateOrder = Boolean(
    user &&
      (user.role === "ADMIN" || user.role === "MANAGER") &&
      canWritePermission(user.role, "orders", user.permissions),
  );
  const canPrint80mm = Boolean(
    user && canRead(user.role, "orders_print_80mm", user.permissions),
  );
  const { confirm, alert } = useConfirm();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const situationFilter =
    searchParams.get("situation") ?? searchParams.get("situationCode");
  const view = searchParams.get("view") === "kanban" ? "kanban" : "list";
  const isKanban = view === "kanban";
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pdfPending, setPdfPending] = useState(false);
  const [bulkStage, setBulkStage] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [city, setCity] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [establishmentFilter, setEstablishmentFilter] = useState("");
  const { establishments } = useActiveEstablishment();

  const debouncedOrderNumber = useDebouncedValue(orderNumber);
  const debouncedCity = useDebouncedValue(city);
  const debouncedTradeName = useDebouncedValue(tradeName);
  const debouncedLegalName = useDebouncedValue(legalName);

  const { data: sellers = [] } = useQuery({
    queryKey: ["admin", "sellers"],
    queryFn: () => apiFetch<Seller[]>("/admin/sellers"),
  });

  const { data: situations = [], isPending: situationsPending } = useQuery({
    queryKey: ["admin", "order-situations"],
    queryFn: () => apiFetch<OrderSituation[]>("/admin/order-situations"),
  });

  const listQueryKey = useMemo(
    () => [
      "admin",
      "orders",
      situationFilter ?? "all",
      debouncedOrderNumber.trim(),
      debouncedCity.trim(),
      debouncedTradeName.trim(),
      debouncedLegalName.trim(),
      sellerId,
      establishmentFilter,
    ],
    [
      situationFilter,
      debouncedOrderNumber,
      debouncedCity,
      debouncedTradeName,
      debouncedLegalName,
      sellerId,
      establishmentFilter,
    ],
  );

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: listQueryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (situationFilter) {
        if (situationFilter === SYSTEM_SITUATION_CODES.CREDIT) {
          params.set("situationCode", SYSTEM_SITUATION_CODES.CREDIT);
        } else {
          params.set("situationId", situationFilter);
        }
      }
      const code = debouncedOrderNumber.trim();
      if (code) params.set("orderNumber", code);
      const cityVal = debouncedCity.trim();
      if (cityVal) params.set("city", cityVal);
      const trade = debouncedTradeName.trim();
      if (trade) params.set("tradeName", trade);
      const legal = debouncedLegalName.trim();
      if (legal) params.set("legalName", legal);
      if (sellerId) params.set("sellerId", sellerId);
      if (establishmentFilter)
        params.set("establishmentId", establishmentFilter);
      const qs = params.toString();
      return apiFetch<Order[]>(`/admin/orders${qs ? `?${qs}` : ""}`);
    },
  });

  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    situationFilter,
    debouncedOrderNumber,
    debouncedCity,
    debouncedTradeName,
    debouncedLegalName,
    sellerId,
    establishmentFilter,
  ]);

  const visibleIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected =
    visibleIds.some((id) => selectedIds.has(id)) && !allSelected;
  const selectedOrders = useMemo(
    () => orders.filter((o) => selectedIds.has(o.id)),
    [orders, selectedIds],
  );
  const hasSelection = selectedOrders.length > 0;

  function setFilter(next: string | null) {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete("status");
      if (next) p.set("situation", next);
      else p.delete("situation");
      p.delete("situationCode");
      return p;
    });
  }

  function setView(next: "list" | "kanban") {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === "kanban") p.set("view", "kanban");
      else p.delete("view");
      return p;
    });
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(visibleIds) : new Set());
  }

  const invalidateOrders = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    void qc.invalidateQueries({ queryKey: ["admin", "pending-credit-summary"] });
    void qc.invalidateQueries({ queryKey: ["admin", "notifications-unread"] });
  };

  const patchSituation = useMutation({
    mutationFn: async ({
      orderId,
      situationId,
    }: {
      orderId: string;
      situationId: string;
    }) =>
      apiFetch(`/admin/orders/${orderId}/situation`, {
        method: "PATCH",
        body: JSON.stringify({ situationId }),
      }),
    onSuccess: () => invalidateOrders(),
  });

  function situationOptionsFor(order?: Order) {
    const active = situations.filter((s) => s.active);
    const opts = active.map((s) => ({ value: s.id, label: s.name }));
    const current = order?.situation;
    if (current && !active.some((s) => s.id === current.id)) {
      opts.push({
        value: current.id,
        label: `${current.name} (inativa)`,
      });
    }
    return opts;
  }

  const removeOrder = useMutation({
    mutationFn: (orderId: string) =>
      apiFetch(`/admin/orders/${orderId}`, { method: "DELETE" }),
    onSuccess: () => invalidateOrders(),
  });

  async function applyStageChange(
    orderIds: string[],
    situationId: string,
    fromStatus?: string,
  ) {
    if (!canWrite || orderIds.length === 0) return;
    const target = situations.find((s) => s.id === situationId);
    if (!target) return;

    const needsConfirm =
      orderIds.length > 1 ||
      needsStageConfirmDialog(fromStatus, {
        code: target.code,
        mapsToCancel: target.mapsToCancel,
      });
    if (needsConfirm) {
      const title =
        orderIds.length > 1
          ? `Alterar etapa de ${orderIds.length} pedidos?`
          : "Alterar etapa do pedido?";
      const ok = await confirm({
        title,
        description: `A etapa será alterada para “${target.name}”.${stageChangeHint(target.code, target.mapsToCancel)}`,
        confirmLabel: "Alterar etapa",
        tone: target.mapsToCancel || target.code === "CANCELLED"
          ? "destructive"
          : "default",
      });
      if (!ok) {
        setBulkStage("");
        return;
      }
    }

    setActionError(null);
    try {
      for (const orderId of orderIds) {
        await patchSituation.mutateAsync({ orderId, situationId });
      }
      setBulkStage("");
      setSelectedIds(new Set());
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Não foi possível alterar a etapa.",
      );
    }
  }

  async function handleExportPdf() {
    if (!hasSelection) return;
    setActionError(null);
    setPdfPending(true);
    try {
      for (const o of selectedOrders) {
        await downloadPdf(
          `/admin/orders/${o.id}/pdf`,
          `pedido-${orderCodeFilenamePart(o)}.pdf`,
        );
      }
    } catch {
      setActionError("Não foi possível baixar o PDF de um ou mais pedidos.");
    } finally {
      setPdfPending(false);
    }
  }

  async function handlePrint() {
    if (!hasSelection) return;
    setActionError(null);
    setPdfPending(true);
    try {
      if (selectedOrders.length > 1) {
        await alert({
          title: "Impressão em sequência",
          description: `${selectedOrders.length} pedidos serão enviados à impressão um a um. Confirme cada diálogo do navegador.`,
          tone: "default",
        });
      }
      for (const o of selectedOrders) {
        await printPdf(`/admin/orders/${o.id}/pdf`);
      }
    } catch {
      setActionError("Não foi possível imprimir um ou mais pedidos.");
    } finally {
      setPdfPending(false);
    }
  }

  async function handlePrint80mm() {
    if (!hasSelection) return;
    setActionError(null);
    setPdfPending(true);
    try {
      if (selectedOrders.length > 1) {
        await alert({
          title: "Impressão 80mm em sequência",
          description: `${selectedOrders.length} cupons 80mm serão enviados à impressão um a um. Confirme cada diálogo do navegador.`,
          tone: "default",
        });
      }
      for (const o of selectedOrders) {
        await printPdf(`/admin/orders/${o.id}/pdf-80mm`);
      }
    } catch {
      setActionError(
        "Não foi possível imprimir o cupom 80mm de um ou mais pedidos.",
      );
    } finally {
      setPdfPending(false);
    }
  }

  const pendingCreditSelected =
    situationFilter === SYSTEM_SITUATION_CODES.CREDIT;
  const situationBusy = patchSituation.isPending;

  const kanbanHint = canWrite
    ? "Acompanhe o fluxo do pedido numa única etapa. Arraste o card para mudar a etapa, ou clique para abrir o pedido."
    : "Acompanhe o fluxo do pedido numa única etapa. Clique no card para abrir o pedido.";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Pedidos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isKanban
              ? kanbanHint
              : "Liste, filtre, exporte e altere a etapa dos pedidos sem abrir cada detalhe."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreateOrder ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Novo pedido
            </Button>
          ) : null}
          <Tabs
            value={view}
            onValueChange={(v) => setView(v === "kanban" ? "kanban" : "list")}
          >
            <TabsList aria-label="Visualização de pedidos">
              <TabsTrigger value="list">
                <List />
                Lista
              </TabsTrigger>
              <TabsTrigger value="kanban">
                <Kanban />
                Kanban
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={!pendingCreditSelected ? "default" : "outline"}
          onClick={() => setFilter(null)}
        >
          Todas
        </Button>
        <Button
          type="button"
          size="sm"
          variant={pendingCreditSelected ? "default" : "outline"}
          className={
            pendingCreditSelected
              ? "bg-amber-600 text-white hover:bg-amber-600/90"
              : undefined
          }
          onClick={() => setFilter(SYSTEM_SITUATION_CODES.CREDIT)}
        >
          Aguardando crédito
        </Button>
      </div>

      <FilterBar className="p-4 lg:grid-cols-5">
        <FormField label="Nº do pedido" htmlFor="orders-filter-number">
          <Input
            id="orders-filter-number"
            placeholder="Número"
            inputMode="numeric"
            pattern="[0-9]*"
            value={orderNumber}
            onChange={(e) =>
              setOrderNumber(e.target.value.replace(/\D/g, ""))
            }
          />
        </FormField>
        <FormField label="Cidade" htmlFor="orders-filter-city">
          <Input
            id="orders-filter-city"
            placeholder="Cidade"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </FormField>
        <FormField label="Nome fantasia" htmlFor="orders-filter-trade">
          <Input
            id="orders-filter-trade"
            placeholder="Nome fantasia"
            value={tradeName}
            onChange={(e) => setTradeName(e.target.value)}
          />
        </FormField>
        <FormField label="Razão social" htmlFor="orders-filter-legal">
          <Input
            id="orders-filter-legal"
            placeholder="Razão social"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </FormField>
        <FormField label="Vendedor" htmlFor="orders-filter-seller">
          <AppSelect
            id="orders-filter-seller"
            value={sellerId}
            onValueChange={setSellerId}
            emptyLabel="Todos"
            placeholder="Todos"
            options={[
              { value: "__direct__", label: "Venda Direta" },
              ...sellers.map((s) => ({
                value: s.id,
                label: s.user.name,
              })),
            ]}
          />
        </FormField>
        {establishments.length > 1 ? (
          <FormField label="CNPJ emissor" htmlFor="orders-filter-est">
            <AppSelect
              id="orders-filter-est"
              value={establishmentFilter}
              onValueChange={setEstablishmentFilter}
              emptyLabel="Todos"
              placeholder="Todos"
              options={establishments.map((e) => ({
                value: e.id,
                label: `${formatCnpjShort(e.cnpj)} — ${e.tradeName || e.legalName}`,
              }))}
            />
          </FormField>
        ) : null}
      </FilterBar>

      {actionError ? (
        <p className="text-sm text-destructive">{actionError}</p>
      ) : null}

      {isKanban ? (
        <OrdersKanbanBoard
          orders={orders}
          situations={situations}
          isLoading={isLoading || situationsPending}
          isError={isError}
          canDrag={canWrite && !situationBusy}
          movingId={
            patchSituation.isPending
              ? (patchSituation.variables?.orderId ?? null)
              : null
          }
          onMove={(orderId, move) => {
            const order = orders.find((o) => o.id === orderId);
            void applyStageChange(
              [orderId],
              move.situationId,
              order?.status,
            );
          }}
        />
      ) : (
        <>
      <div className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {hasSelection
            ? `${selectedOrders.length} pedido(s) selecionado(s)`
            : "Selecione pedidos para exportar, imprimir ou mudar a etapa"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasSelection || pdfPending}
            onClick={() => void handleExportPdf()}
          >
            <Download className="size-4" />
            {pdfPending ? "Gerando…" : "Exportar PDF"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!hasSelection || pdfPending}
            onClick={() => void handlePrint()}
          >
            <Printer className="size-4" />
            Imprimir
          </Button>
          {canPrint80mm ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasSelection || pdfPending}
              onClick={() => void handlePrint80mm()}
            >
              <Printer className="size-4" />
              Imprimir 80mm
            </Button>
          ) : null}
          {canWrite ? (
            <AppSelect
              value={bulkStage}
              disabled={!hasSelection || situationBusy}
              placeholder="Alterar etapa…"
              emptyLabel="Alterar etapa…"
              triggerClassName="w-[11.5rem]"
              options={situations
                .filter((s) => s.active)
                .map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
              onValueChange={(v) => {
                setBulkStage(v);
                if (v) void applyStageChange([...selectedIds], v);
              }}
            />
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : null}

      {isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar os pedidos.
        </p>
      ) : null}

      {!isLoading && !isError && orders.length === 0 ? (
        <div className="surface-card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <ShoppingCart className="h-12 w-12 text-primary/40" />
          <p className="text-muted-foreground">Nenhum pedido encontrado.</p>
        </div>
      ) : null}

      {!isLoading && !isError && orders.length > 0 ? (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-4">
                  <Checkbox
                    checked={selectAllState(allSelected, someSelected)}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="Selecionar todas"
                  />
                </TableHead>
                <TableHead className="px-4">N de pedidos</TableHead>
                <TableHead className="px-4">Data</TableHead>
                <TableHead className="px-4">Etapa</TableHead>
                <TableHead className="px-4">Vendedor</TableHead>
                <TableHead className="px-4">CNPJ</TableHead>
                <TableHead className="px-4">Cliente</TableHead>
                <TableHead className="px-4">Cidade</TableHead>
                <TableHead className="px-4">Itens</TableHead>
                <TableHead className="px-4">Condição de pagamento</TableHead>
                <TableHead className="px-4 text-right">Total</TableHead>
                <TableHead className="px-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const selected = selectedIds.has(o.id);
                const code = formatOrderCode(o);
                return (
                  <TableRow
                    key={o.id}
                    className={cn(selected && "bg-muted/40")}
                  >
                    <TableCell className="px-4 py-3">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(v) => toggleOne(o.id, v === true)}
                        aria-label={`Selecionar pedido ${code}`}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3 font-medium tabular-nums">
                      {code}
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {canWrite ? (
                        <AppSelect
                          value={o.situationId ?? ""}
                          disabled={situationBusy}
                          triggerClassName="w-auto min-w-[10.5rem]"
                          options={situationOptionsFor(o)}
                          onValueChange={(v) => {
                            if (!v || v === o.situationId) return;
                            void applyStageChange([o.id], v, o.status);
                          }}
                        />
                      ) : (
                        <Badge
                          variant="outline"
                          className={stageBadgeClass(
                            o.situation?.code ?? "",
                            o.situation?.mapsToCancel,
                          )}
                        >
                          {orderStageLabel(o)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {o.seller?.user.name ?? "VENDA DIRETA"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {o.establishment
                        ? formatCnpjShort(o.establishment.cnpj)
                        : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {o.customer?.tradeName?.trim() ||
                        o.customer?.name ||
                        "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {o.customer?.city?.trim() ? o.customer.city : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                      {o.items.length}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {paymentConditionLabel(o.paymentCondition)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatOrderMoney(o.totalAmount)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Link
                        to={`/pedidos/${o.id}`}
                        className="text-primary"
                      >
                        Editar
                      </Link>
                      {canWrite ? (
                        <button
                          type="button"
                          className="ml-3 text-destructive"
                          disabled={removeOrder.isPending}
                          onClick={() => {
                            void confirm({
                              title: "Excluir pedido?",
                              description: `O pedido ${code} será removido permanentemente. Pedidos confirmados estornam estoque ao excluir.`,
                              confirmLabel: "Excluir",
                              tone: "destructive",
                            }).then((ok) => {
                              if (!ok) return;
                              setActionError(null);
                              removeOrder.mutate(o.id, {
                                onError: (e) => {
                                  setActionError(
                                    e instanceof Error
                                      ? e.message
                                      : "Não foi possível excluir o pedido.",
                                  );
                                },
                              });
                            });
                          }}
                        >
                          Excluir
                        </button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
        </>
      )}

      {canCreateOrder ? (
        <CreateOrderSheet
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={async (order) => {
            await qc.invalidateQueries({ queryKey: ["admin", "orders"] });
            const stageCode = order.situation?.code ?? order.status;
            let toast = "Pedido confirmado.";
            if (stageCode === "DRAFT") toast = "Pedido salvo como rascunho.";
            if (
              stageCode === "CREDIT" ||
              stageCode === "PENDING_CREDIT_APPROVAL"
            ) {
              toast = "Pedido enviado para aprovação de crédito.";
            }
            notifySuccess(toast);
            navigate(`/pedidos/${order.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
