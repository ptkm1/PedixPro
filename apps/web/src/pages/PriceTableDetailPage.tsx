import { useConfirm } from "@/components/confirm";
import {
  FormField,
  FormGrid,
  FormSheet,
  FormSheetActions,
} from "@/components/forms";
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
import { apiFetch } from "@/lib/api";
import { formatOrderMoney } from "@/lib/order-kanban";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

type CatalogRow = {
  productId: string;
  name: string;
  sku: string | null;
  basePrice: number;
  computedPrice: number;
  originLabel: string;
  useCustomPrice: boolean;
  customPrice: number | null;
  minPrice: number | null;
  qtyTiers: Array<{ id: string; minQuantity: number; price: number }>;
};

type TableHeadInfo = { id: string; name: string };

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return formatOrderMoney(n);
}

export function PriceTableDetailPage() {
  const { tableId = "" } = useParams();
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPercent, setBulkPercent] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const [editRow, setEditRow] = useState<CatalogRow | null>(null);
  const [useCustom, setUseCustom] = useState(false);
  const [customPrice, setCustomPrice] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [tierDraft, setTierDraft] = useState("10=9\n50=8");
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const tableQ = useQuery({
    queryKey: ["admin", "price-tables", tableId],
    queryFn: () => apiFetch<TableHeadInfo>(`/admin/price-tables/${tableId}`),
    enabled: Boolean(tableId),
  });

  const catalogQ = useQuery({
    queryKey: ["admin", "price-tables", tableId, "catalog", search],
    queryFn: () => {
      const qs = search.trim()
        ? `?q=${encodeURIComponent(search.trim())}`
        : "";
      return apiFetch<CatalogRow[]>(
        `/admin/price-tables/${tableId}/catalog${qs}`,
      );
    },
    enabled: Boolean(tableId),
  });

  const rows = catalogQ.data ?? [];
  const allIds = useMemo(() => rows.map((r) => r.productId), [rows]);
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selected.has(id));

  function invalidate() {
    void qc.invalidateQueries({
      queryKey: ["admin", "price-tables", tableId, "catalog"],
    });
  }

  const saveItem = useMutation({
    mutationFn: () =>
      apiFetch(`/admin/price-tables/${tableId}/items`, {
        method: "POST",
        body: JSON.stringify({
          productId: editRow!.productId,
          useCustomPrice: useCustom,
          price: useCustom
            ? Number(customPrice.replace(",", "."))
            : undefined,
          minPrice: minPrice.trim()
            ? Number(minPrice.replace(",", "."))
            : null,
        }),
      }),
    onSuccess: async () => {
      if (editRow) {
        const tiers = parseTiers(tierDraft);
        await apiFetch(
          `/admin/price-tables/${tableId}/items/${editRow.productId}/qty-tiers`,
          {
            method: "PUT",
            body: JSON.stringify({ tiers }),
          },
        );
      }
      invalidate();
      setEditRow(null);
    },
  });

  const bulk = useMutation({
    mutationFn: (body: {
      action: "apply_percent" | "set_price" | "clear_custom";
      value?: number;
    }) =>
      apiFetch(`/admin/price-tables/${tableId}/items/bulk`, {
        method: "POST",
        body: JSON.stringify({
          productIds: [...selected],
          ...body,
        }),
      }),
    onSuccess: () => {
      setSelected(new Set());
      invalidate();
    },
  });

  const importCsv = useMutation({
    mutationFn: () =>
      apiFetch(`/admin/price-tables/${tableId}/import`, {
        method: "POST",
        body: JSON.stringify({ csvText: importText }),
      }),
    onSuccess: () => {
      setImportOpen(false);
      setImportText("");
      invalidate();
    },
  });

  function openEdit(row: CatalogRow) {
    setEditRow(row);
    setUseCustom(row.useCustomPrice);
    setCustomPrice(row.customPrice != null ? String(row.customPrice) : "");
    setMinPrice(row.minPrice != null ? String(row.minPrice) : "");
    setTierDraft(
      row.qtyTiers
        .map((t) => `${t.minQuantity}=${t.price}`)
        .join("\n") || "10=9\n50=8",
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/tabelas-preco"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Tabelas de preço
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {tableQ.data?.name ?? "Tabela"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preço calculado, personalizado, mínimo e faixas (10+, 50+…).
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            Importar CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Buscar produto" htmlFor="pt-search" className="min-w-[16rem] flex-1">
          <Input
            id="pt-search"
            value={search}
            placeholder="Nome ou código"
            onChange={(e) => setSearch(e.target.value)}
          />
        </FormField>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <span className="text-sm text-muted-foreground">
            {selected.size} selecionado(s)
          </span>
          <Input
            className="w-24"
            placeholder="% "
            value={bulkPercent}
            onChange={(e) => setBulkPercent(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={bulk.isPending}
            onClick={() =>
              bulk.mutate({
                action: "apply_percent",
                value: Number(bulkPercent.replace(",", ".")),
              })
            }
          >
            Aplicar %
          </Button>
          <Input
            className="w-28"
            placeholder="Preço R$"
            value={bulkPrice}
            onChange={(e) => setBulkPrice(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={bulk.isPending}
            onClick={() =>
              bulk.mutate({
                action: "set_price",
                value: Number(bulkPrice.replace(",", ".")),
              })
            }
          >
            Definir preço
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={bulk.isPending}
            onClick={() => void confirmClear()}
          >
            Limpar personalizados
          </Button>
        </div>
      ) : null}

      {catalogQ.isLoading ? (
        <p className="text-muted-foreground">Carregando produtos…</p>
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) =>
                      setSelected(v === true ? new Set(allIds) : new Set())
                    }
                  />
                </TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Tabela</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.productId)}
                      onCheckedChange={(v) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(row.productId);
                          else next.delete(row.productId);
                          return next;
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    {row.sku ? (
                      <div className="text-xs text-muted-foreground">
                        {row.sku}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.basePrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.computedPrice)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.originLabel}
                    {row.qtyTiers.length
                      ? ` · ${row.qtyTiers.length} faixa(s)`
                      : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.minPrice)}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      className="text-primary"
                      onClick={() => openEdit(row)}
                    >
                      Editar preço
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <FormSheet
        open={Boolean(editRow)}
        onOpenChange={(open) => {
          if (!open) setEditRow(null);
        }}
        title={editRow ? `Preço · ${editRow.name}` : "Preço"}
        description="Personalize o preço deste produto, mínimo e faixas de quantidade."
        footer={
          <FormSheetActions
            onCancel={() => setEditRow(null)}
            onSubmit={() => saveItem.mutate()}
            submitLabel="Salvar"
            pending={saveItem.isPending}
          />
        }
      >
        {editRow ? (
          <FormGrid cols={1}>
            <p className="text-sm text-muted-foreground">
              Preço base {money(editRow.basePrice)} · calculado{" "}
              {money(editRow.computedPrice)}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={useCustom}
                onCheckedChange={(v) => setUseCustom(v === true)}
              />
              Usar preço personalizado
            </label>
            <FormField label="Preço personalizado" htmlFor="pt-custom">
              <Input
                id="pt-custom"
                disabled={!useCustom}
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
              />
            </FormField>
            <FormField
              label="Preço mínimo"
              htmlFor="pt-min"
              hint="Bloqueia venda abaixo deste valor"
            >
              <Input
                id="pt-min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </FormField>
            <FormField
              label="Faixas de quantidade"
              htmlFor="pt-tiers"
              hint="Uma por linha: quantidade mínima=preço. Ex.: 10=9"
            >
              <textarea
                id="pt-tiers"
                className="min-h-[6rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={tierDraft}
                onChange={(e) => setTierDraft(e.target.value)}
              />
            </FormField>
          </FormGrid>
        ) : null}
      </FormSheet>

      <FormSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar CSV"
        description="Colunas: codigo, nome, preco_base, preco_tabela, preco_minimo."
        footer={
          <FormSheetActions
            onCancel={() => setImportOpen(false)}
            onSubmit={() => importCsv.mutate()}
            submitLabel="Importar"
            pending={importCsv.isPending}
          />
        }
      >
        <textarea
          className="min-h-[12rem] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="codigo;nome;preco_base;preco_tabela;preco_minimo"
        />
      </FormSheet>
    </div>
  );

  async function confirmClear() {
    const ok = await confirm({
      title: "Limpar preços personalizados?",
      description: "Os produtos voltam a usar a regra geral da tabela.",
      confirmLabel: "Limpar",
      tone: "destructive",
    });
    if (ok) bulk.mutate({ action: "clear_custom" });
  }
}

function parseTiers(raw: string): Array<{ minQuantity: number; price: number }> {
  const out: Array<{ minQuantity: number; price: number }> = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const [minRaw, priceRaw] = t.split(/[=;:]/);
    const minQuantity = Number(minRaw);
    const price = Number((priceRaw ?? "").replace(",", "."));
    if (Number.isInteger(minQuantity) && minQuantity >= 1 && Number.isFinite(price)) {
      out.push({ minQuantity, price });
    }
  }
  return out;
}
