import { useConfirm } from "@/components/confirm";
import {
  FormField,
  FormGrid,
  FormSheet,
  FormSheetActions,
} from "@/components/forms";
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
import { useScrollToFirstError } from "@/hooks/useScrollToFirstError";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

export type PriceTableRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  adjustmentKind: "DISCOUNT" | "SURCHARGE";
  adjustmentMode: "PERCENT" | "AMOUNT";
  adjustmentValue: number;
  validFrom: string | null;
  validTo: string | null;
  items?: unknown[];
  _count?: { items: number; qtyTiers: number };
  customer: { id: string; name: string } | null;
  seller: { id: string; user: { name: string } } | null;
  region: { id: string; code: string; name: string } | null;
};

function ruleLabel(t: PriceTableRow): string {
  if (!t.adjustmentValue) return "Preços manuais / base";
  const sign = t.adjustmentKind === "DISCOUNT" ? "Desconto" : "Acréscimo";
  const val =
    t.adjustmentMode === "PERCENT"
      ? `${t.adjustmentValue}%`
      : `R$ ${t.adjustmentValue.toFixed(2).replace(".", ",")}`;
  return `${sign} ${val}`;
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

type TableForm = {
  name: string;
  status: "ACTIVE" | "INACTIVE";
  adjustmentKind: "DISCOUNT" | "SURCHARGE";
  adjustmentMode: "PERCENT" | "AMOUNT";
  adjustmentValue: string;
  validFrom: string;
  validTo: string;
};

const emptyForm = (): TableForm => ({
  name: "",
  status: "ACTIVE",
  adjustmentKind: "DISCOUNT",
  adjustmentMode: "PERCENT",
  adjustmentValue: "0",
  validFrom: "",
  validTo: "",
});

function formToPayload(form: TableForm) {
  return {
    name: form.name.trim(),
    status: form.status,
    adjustmentKind: form.adjustmentKind,
    adjustmentMode: form.adjustmentMode,
    adjustmentValue: Number(form.adjustmentValue.replace(",", ".")) || 0,
    validFrom: form.validFrom ? `${form.validFrom}T00:00:00.000Z` : null,
    validTo: form.validTo ? `${form.validTo}T23:59:59.000Z` : null,
  };
}

export function PriceTablesPage() {
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["admin", "price-tables"],
    queryFn: () => apiFetch<PriceTableRow[]>("/admin/price-tables"),
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PriceTableRow | null>(null);
  const [form, setForm] = useState<TableForm>(emptyForm());
  const [showValidation, setShowValidation] = useState(false);

  function resetForm() {
    setForm(emptyForm());
    setShowValidation(false);
    setEditing(null);
  }

  function openCreate() {
    resetForm();
    setSheetOpen(true);
  }

  function openEdit(table: PriceTableRow) {
    setEditing(table);
    setForm({
      name: table.name,
      status: table.status ?? "ACTIVE",
      adjustmentKind: table.adjustmentKind ?? "DISCOUNT",
      adjustmentMode: table.adjustmentMode ?? "PERCENT",
      adjustmentValue: String(table.adjustmentValue ?? 0),
      validFrom: toDateInput(table.validFrom),
      validTo: toDateInput(table.validTo),
    });
    setShowValidation(false);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    resetForm();
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = formToPayload(form);
      if (editing) {
        return apiFetch<PriceTableRow>(`/admin/price-tables/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<PriceTableRow>("/admin/price-tables", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "price-tables"] });
      closeSheet();
    },
  });

  const delTable = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/price-tables/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "price-tables"] });
    },
  });

  const duplicate = useMutation({
    mutationFn: (id: string) =>
      apiFetch<PriceTableRow>(`/admin/price-tables/${id}/duplicate`, {
        method: "POST",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "price-tables"] });
    },
  });

  const fieldErrors = useMemo(() => {
    if (!showValidation) return {} as Record<string, string>;
    return !form.name.trim() ? { name: "Nome é obrigatório." } : {};
  }, [showValidation, form.name]);

  useScrollToFirstError(fieldErrors, {
    enabled: showValidation && sheetOpen,
  });

  function trySave() {
    setShowValidation(true);
    if (!form.name.trim()) return;
    save.mutate();
  }

  async function confirmDeleteTable(table: PriceTableRow) {
    const ok = await confirm({
      title: "Excluir tabela?",
      description:
        "A tabela de preços, preços personalizados e faixas serão removidos.",
      confirmLabel: "Excluir",
      tone: "destructive",
    });
    if (ok) delTable.mutate(table.id);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Tabelas de preço
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Defina desconto ou acréscimo sobre o preço base, preços
            personalizados por produto e faixas de quantidade.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          Nova tabela
        </Button>
      </div>

      <FormSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
          else setSheetOpen(true);
        }}
        title={editing ? "Editar tabela" : "Nova tabela"}
        description="Nome, regra geral e validade. Preços por produto ficam na ficha da tabela."
        footer={
          <FormSheetActions
            onCancel={closeSheet}
            onSubmit={trySave}
            submitLabel={editing ? "Salvar" : "Criar tabela"}
            pending={save.isPending}
          />
        }
      >
        <FormGrid cols={1}>
          <FormField
            label="Nome"
            htmlFor="pt-name"
            required
            error={fieldErrors.name}
          >
            <Input
              id="pt-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormField>
          <FormField label="Situação" htmlFor="pt-status">
            <div className="flex gap-2">
              {(
                [
                  ["ACTIVE", "Ativa"],
                  ["INACTIVE", "Inativa"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={form.status === value ? "default" : "outline"}
                  onClick={() => setForm((f) => ({ ...f, status: value }))}
                >
                  {label}
                </Button>
              ))}
            </div>
          </FormField>
          <FormField
            label="Regra geral"
            hint="Aplica no preço base de todos os produtos, salvo preço personalizado."
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-md border">
                {(
                  [
                    ["DISCOUNT", "Desconto"],
                    ["SURCHARGE", "Acréscimo"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "px-3 py-1.5 text-sm",
                      form.adjustmentKind === value
                        ? "bg-primary text-primary-foreground"
                        : "bg-background",
                    )}
                    onClick={() =>
                      setForm((f) => ({ ...f, adjustmentKind: value }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Input
                className="w-28"
                inputMode="decimal"
                value={form.adjustmentValue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, adjustmentValue: e.target.value }))
                }
              />
              <div className="flex overflow-hidden rounded-md border">
                {(
                  [
                    ["PERCENT", "%"],
                    ["AMOUNT", "R$"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "px-3 py-1.5 text-sm",
                      form.adjustmentMode === value
                        ? "bg-primary text-primary-foreground"
                        : "bg-background",
                    )}
                    onClick={() =>
                      setForm((f) => ({ ...f, adjustmentMode: value }))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </FormField>
          <FormGrid cols={2}>
            <FormField label="Válida de" htmlFor="pt-from">
              <Input
                id="pt-from"
                type="date"
                value={form.validFrom}
                onChange={(e) =>
                  setForm((f) => ({ ...f, validFrom: e.target.value }))
                }
              />
            </FormField>
            <FormField label="Válida até" htmlFor="pt-to">
              <Input
                id="pt-to"
                type="date"
                value={form.validTo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, validTo: e.target.value }))
                }
              />
            </FormField>
          </FormGrid>
        </FormGrid>
      </FormSheet>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : tables.length === 0 ? (
        <div className="surface-card px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhuma tabela cadastrada.
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Regra</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/tabelas-preco/${t.id}`}
                      className="text-primary hover:underline"
                    >
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ruleLabel(t)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={t.status === "ACTIVE" ? "default" : "secondary"}
                    >
                      {t.status === "ACTIVE" ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {t._count?.items ?? t.items?.length ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to={`/tabelas-preco/${t.id}`}
                      className="text-primary"
                    >
                      Produtos
                    </Link>
                    <button
                      type="button"
                      className="ml-3 text-primary"
                      onClick={() => openEdit(t)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-primary"
                      disabled={duplicate.isPending}
                      onClick={() => duplicate.mutate(t.id)}
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-destructive"
                      disabled={delTable.isPending}
                      onClick={() => void confirmDeleteTable(t)}
                    >
                      Excluir
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
