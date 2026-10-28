import { useAuth } from "@/auth/AuthContext";
import { AuditLogPanel } from "@/components/AuditLogPanel";
import { ProductListCell } from "@/components/ProductCombobox";
import {
  FormErrorBanner,
  FormField,
  FormGrid,
  FormSheet,
  FormSheetActions,
} from "@/components/forms";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker, parseIsoDate, toIsoDate } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useScrollToFirstError } from "@/hooks/useScrollToFirstError";
import { apiFetch, downloadPdf, printPdf } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, History, Package } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type StockLot = {
  id: string;
  lotCode: string;
  expiresAt: string;
  qty: number;
};

type StockProduct = {
  id: string;
  name: string;
  sku: string | null;
  imageUrl?: string | null;
  stockQty: number;
  hasExpiringSoon: boolean;
  expiringLotsCount: number;
  category: { id: string; name: string } | null;
  supplier: { id: string; tradeName: string } | null;
  lots: StockLot[];
};

type Category = { id: string; name: string };
type Supplier = { id: string; tradeName: string; legalName: string };

type EntryType = "MANUAL_IN" | "MANUAL_OUT" | "ADJUST";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function selectAllState(
  allSelected: boolean,
  someSelected: boolean,
): boolean | "indeterminate" {
  if (allSelected) return true;
  if (someSelected) return "indeterminate";
  return false;
}

function daysUntilExpiry(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(iso);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function StockPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pdfBusy, setPdfBusy] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StockProduct | null>(
    null,
  );
  const [historyProduct, setHistoryProduct] = useState<StockProduct | null>(
    null,
  );
  const [entryType, setEntryType] = useState<EntryType>("MANUAL_IN");
  const [qty, setQty] = useState("1");
  const [lotCode, setLotCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (supplierId) p.set("supplierId", supplierId);
    if (categoryId) p.set("categoryId", categoryId);
    if (q.trim()) p.set("q", q.trim());
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [supplierId, categoryId, q]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin", "stock", supplierId, categoryId, q],
    queryFn: () => apiFetch<StockProduct[]>(`/admin/stock${queryParams}`),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["admin", "product-categories"],
    queryFn: () => apiFetch<Category[]>("/admin/product-categories"),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["admin", "suppliers"],
    queryFn: () => apiFetch<Supplier[]>("/admin/suppliers"),
  });

  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const selectedProducts = useMemo(
    () => products.filter((p) => selectedIds.has(p.id)),
    [products, selectedIds],
  );
  const hasSelection = selectedIds.size > 0;
  const allSelected =
    productIds.length > 0 && productIds.every((id) => selectedIds.has(id));
  const someSelected =
    productIds.some((id) => selectedIds.has(id)) && !allSelected;

  const alertProducts = useMemo(
    () => selectedProducts.filter((p) => p.hasExpiringSoon),
    [selectedProducts],
  );

  const alertLots = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 30);
    const rows: {
      productId: string;
      productName: string;
      lot: StockLot;
      days: number;
      expired: boolean;
    }[] = [];
    for (const p of alertProducts) {
      for (const lot of p.lots) {
        const exp = new Date(lot.expiresAt);
        if (exp > horizon) continue;
        const days = daysUntilExpiry(lot.expiresAt);
        rows.push({
          productId: p.id,
          productName: p.name,
          lot,
          days,
          expired: days < 0,
        });
      }
    }
    return rows.sort((a, b) => a.days - b.days);
  }, [alertProducts]);

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(productIds) : new Set());
  }

  function toggleProduct(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function stockPdfPath(ids: string[]) {
    const params = new URLSearchParams();
    if (supplierId) params.set("supplierId", supplierId);
    if (categoryId) params.set("categoryId", categoryId);
    if (q.trim()) params.set("q", q.trim());
    params.set("productIds", ids.join(","));
    return `/admin/reports/stock.pdf?${params.toString()}`;
  }

  async function exportSelectedPdf() {
    if (!hasSelection) return;
    setPdfBusy(true);
    try {
      await downloadPdf(
        stockPdfPath([...selectedIds]),
        "relatorio-estoque-selecionados.pdf",
      );
    } finally {
      setPdfBusy(false);
    }
  }

  async function printSelectedPdf() {
    if (!hasSelection) return;
    setPdfBusy(true);
    try {
      await printPdf(stockPdfPath([...selectedIds]));
    } finally {
      setPdfBusy(false);
    }
  }

  async function exportAlertPdf() {
    const ids = alertProducts.map((p) => p.id);
    if (!ids.length) return;
    setPdfBusy(true);
    try {
      await downloadPdf(stockPdfPath(ids), "relatorio-estoque-validade.pdf");
    } finally {
      setPdfBusy(false);
    }
  }

  function openEntry(product: StockProduct) {
    setSelectedProduct(product);
    setEntryType("MANUAL_IN");
    setQty("1");
    setLotCode("");
    setExpiresAt("");
    setReason("");
    setPassword("");
    setFormError(null);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setSelectedProduct(null);
    setFormError(null);
  }

  const entry = useMutation({
    mutationFn: () => {
      const qtyNum = Number(qty);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        throw new Error("Quantidade inválida");
      }
      const lot = lotCode.trim();
      if (lot && !expiresAt) {
        throw new Error("Informe a validade do lote.");
      }
      return apiFetch("/admin/stock/entries", {
        method: "POST",
        body: JSON.stringify({
          productId: selectedProduct!.id,
          type: entryType,
          qty: qtyNum,
          lotCode: lot || null,
          expiresAt: lot
            ? (
                parseIsoDate(expiresAt) ?? new Date(expiresAt)
              ).toISOString()
            : null,
          reason: reason.trim() || undefined,
          password,
        }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "stock"] });
      void qc.invalidateQueries({ queryKey: ["admin", "stock-movements"] });
      void qc.invalidateQueries({ queryKey: ["admin", "stock-expiring"] });
      void qc.invalidateQueries({ queryKey: ["admin", "products"] });
      void qc.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
      closeSheet();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const lotTrimmed = lotCode.trim();
  const qtyNum = Number(qty);
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0;
  const expiresRequiredOk = !lotTrimmed || Boolean(expiresAt);

  const projectedBalance = useMemo(() => {
    if (!selectedProduct || !qtyValid) return null;
    const current = selectedProduct.stockQty;
    if (entryType === "MANUAL_IN") return current + qtyNum;
    if (entryType === "MANUAL_OUT") return current - qtyNum;
    // ADJUST: com lote = saldo produto + (nova qtd lote − qtd atual do lote);
    // sem lote = define o saldo do produto.
    if (!lotTrimmed) return qtyNum;
    const match = selectedProduct.lots.find(
      (l) => l.lotCode.toLowerCase() === lotTrimmed.toLowerCase(),
    );
    const lotQty = match?.qty ?? 0;
    return current + (qtyNum - lotQty);
  }, [selectedProduct, qtyValid, qtyNum, entryType, lotTrimmed]);

  const canSubmit =
    Boolean(selectedProduct) &&
    qtyValid &&
    expiresRequiredOk &&
    password.length > 0 &&
    projectedBalance != null &&
    projectedBalance >= 0;

  useScrollToFirstError(formError, { enabled: Boolean(formError) });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Estoque</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lotes, validade e entradas manuais com reautenticação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/estoque/movimentos">Histórico</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/insights">Validade &lt; 30 dias</Link>
          </Button>
        </div>
      </div>

      <div className="surface-card grid gap-3 p-4 sm:grid-cols-3">
        <FormField label="Fornecedor" htmlFor="stock-supplier">
          <AppSelect
            id="stock-supplier"
            value={supplierId}
            onValueChange={setSupplierId}
            emptyLabel="Todos"
            options={suppliers.map((s) => ({
              value: s.id,
              label: s.tradeName || s.legalName,
            }))}
          />
        </FormField>
        <FormField label="Grupo" htmlFor="stock-category">
          <AppSelect
            id="stock-category"
            value={categoryId}
            onValueChange={setCategoryId}
            emptyLabel="Todos"
            options={categories.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
        </FormField>
        <FormField label="Buscar" htmlFor="stock-q">
          <Input
            id="stock-q"
            placeholder="Nome, SKU ou código de barras"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </FormField>
      </div>

      {!isLoading && products.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {hasSelection
              ? `${selectedProducts.length} produto(s) selecionado(s)`
              : "Selecione produtos para exportar, imprimir ou ver alertas de validade"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasSelection || pdfBusy}
              onClick={() => void exportSelectedPdf()}
            >
              Exportar PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasSelection || pdfBusy}
              onClick={() => void printSelectedPdf()}
            >
              Imprimir
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasSelection}
              onClick={() => setAlertsOpen(true)}
            >
              Alertas de validade
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-muted-foreground">Carregando estoque…</p>
      ) : products.length === 0 ? (
        <div className="surface-card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Package className="h-12 w-12 text-primary/40" />
          <p className="text-muted-foreground">Nenhum produto encontrado.</p>
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectAllState(allSelected, someSelected)}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Lotes / validade</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const selected = selectedIds.has(p.id);
                return (
                  <TableRow
                    key={p.id}
                    className={cn(selected && "bg-muted/40")}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(v) => toggleProduct(p.id, v === true)}
                        aria-label={`Selecionar ${p.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <ProductListCell product={p} />
                    </TableCell>
                    <TableCell>{p.category?.name ?? "—"}</TableCell>
                    <TableCell>{p.supplier?.tradeName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.stockQty}
                    </TableCell>
                    <TableCell>
                      {p.hasExpiringSoon ? (
                        <span
                          className={cn(
                            "mb-1 inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400",
                          )}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {p.expiringLotsCount} lote(s) &lt; 30 dias
                        </span>
                      ) : null}
                      {p.lots.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          Sem lotes
                        </span>
                      ) : (
                        <ul className="space-y-0.5 text-sm">
                          {p.lots.slice(0, 3).map((l) => (
                            <li key={l.id}>
                              {l.lotCode} · {l.qty} un ·{" "}
                              {formatDate(l.expiresAt)}
                            </li>
                          ))}
                          {p.lots.length > 3 ? (
                            <li className="text-muted-foreground">
                              +{p.lots.length - 3} lote(s)
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Histórico de ${p.name}`}
                          title="Histórico de movimentações"
                          onClick={() => setHistoryProduct(p)}
                        >
                          <History className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openEntry(p)}
                        >
                          Movimentar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="surface-card p-6">
        <AuditLogPanel
          title="Histórico de movimentações (auditoria)"
          action="STOCK_ENTRY"
          take={40}
        />
      </div>

      <FormSheet
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        title="Alertas de validade"
        description={
          hasSelection
            ? `Entre os ${selectedProducts.length} selecionado(s), ${alertProducts.length} com validade em menos de 30 dias.`
            : undefined
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAlertsOpen(false)}
            >
              Fechar
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/insights">Ir para Insights</Link>
            </Button>
            <Button
              type="button"
              disabled={!alertProducts.length || pdfBusy}
              onClick={() => void exportAlertPdf()}
            >
              Exportar PDF só desses
            </Button>
          </div>
        }
      >
        {alertLots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum lote com validade crítica nos produtos selecionados.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {alertLots.map((row) => (
              <li
                key={row.lot.id}
                className="rounded-lg border border-border px-3 py-2"
              >
                <p className="font-medium text-foreground">{row.productName}</p>
                <p className="text-muted-foreground">
                  Lote {row.lot.lotCode} · {row.lot.qty} un ·{" "}
                  {formatDate(row.lot.expiresAt)}
                  {row.expired ? " · vencido" : ` · ${row.days} dia(s)`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </FormSheet>

      <FormSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
          else setSheetOpen(true);
        }}
        title="Movimentação de estoque"
        description={
          selectedProduct
            ? `${selectedProduct.name} — saldo atual: ${selectedProduct.stockQty}`
            : undefined
        }
        footer={
          <FormSheetActions
            onCancel={closeSheet}
            onSubmit={() => entry.mutate()}
            submitLabel="Confirmar"
            pending={entry.isPending}
            disabled={!canSubmit}
          />
        }
      >
        <FormGrid cols={2}>
          <FormField
            label="Tipo"
            htmlFor="stock-entry-type"
            className="sm:col-span-2"
          >
            <AppSelect
              id="stock-entry-type"
              value={entryType}
              onValueChange={(v) => setEntryType(v as EntryType)}
              options={[
                { value: "MANUAL_IN", label: "Entrada" },
                { value: "MANUAL_OUT", label: "Saída" },
                {
                  value: "ADJUST",
                  label: "Ajuste (definir quantidade)",
                },
              ]}
            />
          </FormField>
          <FormField label="Quantidade" htmlFor="stock-qty" required>
            <Input
              id="stock-qty"
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </FormField>
          <FormField
            label="Lote"
            htmlFor="stock-lot"
            hint="Opcional. Sem lote, a movimentação altera só o saldo do produto."
          >
            <Input
              id="stock-lot"
              value={lotCode}
              onChange={(e) => {
                const next = e.target.value;
                setLotCode(next);
                const match = selectedProduct?.lots.find(
                  (l) =>
                    l.lotCode.toLowerCase() === next.trim().toLowerCase(),
                );
                if (match?.expiresAt) {
                  const parsed =
                    parseIsoDate(match.expiresAt.slice(0, 10)) ??
                    new Date(match.expiresAt);
                  setExpiresAt(toIsoDate(parsed));
                } else if (!next.trim()) {
                  setExpiresAt("");
                }
              }}
              placeholder="Ex.: L2026-01"
            />
          </FormField>
          <FormField
            label="Validade"
            htmlFor="stock-expires"
            required={Boolean(lotTrimmed)}
            hint={
              lotTrimmed
                ? "Obrigatória quando há lote."
                : "Opcional sem lote (não será gravada)."
            }
          >
            <DatePicker
              id="stock-expires"
              value={expiresAt}
              onChange={setExpiresAt}
              placeholder={
                lotTrimmed ? "Validade do lote" : "Opcional sem lote"
              }
              disabled={!lotTrimmed}
            />
          </FormField>
          {selectedProduct && qtyValid && projectedBalance != null ? (
            <div
              className={cn(
                "sm:col-span-2 rounded-lg border px-3 py-2.5 text-sm",
                projectedBalance < 0
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-border bg-muted/30 text-foreground",
              )}
            >
              <p className="font-medium">Saldo após a movimentação</p>
              <p className="mt-0.5 tabular-nums">
                Atual: {selectedProduct.stockQty}
                {" → "}
                <span className="font-semibold">{projectedBalance}</span>
                {projectedBalance < 0
                  ? " (insuficiente — ajuste a quantidade)"
                  : null}
              </p>
            </div>
          ) : null}
          <FormField
            label="Motivo"
            htmlFor="stock-reason"
            className="sm:col-span-2"
          >
            <Input
              id="stock-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Opcional"
            />
          </FormField>
          <div className="sm:col-span-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Reautenticação</p>
            <p className="mt-1 text-muted-foreground">
              Usuário: {user?.email}
              {user?.matricula ? ` · Matrícula: ${user.matricula}` : ""}
            </p>
          </div>
          <FormField
            label="Senha"
            htmlFor="stock-password"
            required
            className="sm:col-span-2"
          >
            <Input
              id="stock-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Confirme sua senha"
            />
          </FormField>
          <FormErrorBanner message={formError} className="sm:col-span-2" />
        </FormGrid>
      </FormSheet>

      <FormSheet
        open={historyProduct != null}
        onOpenChange={(open) => {
          if (!open) setHistoryProduct(null);
        }}
        title={
          historyProduct
            ? `Histórico — ${historyProduct.name}`
            : "Histórico de movimentações"
        }
        description="Movimentações de estoque registradas para este produto."
        contentClassName="max-h-[85vh]"
      >
        {historyProduct ? (
          <AuditLogPanel
            key={historyProduct.id}
            title=""
            entityType="Product"
            entityId={historyProduct.id}
            action="STOCK_ENTRY"
            take={50}
            enabled={historyProduct != null}
          />
        ) : null}
      </FormSheet>
    </div>
  );
}
