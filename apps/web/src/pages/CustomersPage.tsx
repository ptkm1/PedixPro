import { AuditLogPanel } from "@/components/AuditLogPanel";
import { CsvImportSheet } from "@/components/CsvImportSheet";
import { useConfirm } from "@/components/confirm";
import {
    FormField,
    FormGrid,
    FormSection,
    FormSheet,
    FormSheetActions,
} from "@/components/forms";
import { AppSelect } from "@/components/ui/app-select";
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
import { useScrollToFirstError } from "@/hooks/useScrollToFirstError";
import { cn } from "@/lib/utils";
import type {
    CustomerFormValues,
    CustomerRecord,
    CustomerStatus,
} from "@pedidos/shared";
import {
    canWrite,
    customerToForm,
    emptyCustomerForm,
    formToCustomerPayload,
    formatCnpjMask,
    formatCpfMask,
    validateCustomerForm,
} from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { CustomerFormFields } from "../components/CustomerFormFields";
import { CustomerTitlesPanel } from "../components/CustomerTitlesPanel";
import {
    LocationPinMap,
    splitLatLngPaste,
} from "../components/LocationPinMap";
import { apiFetch } from "../lib/api";

/** Limite da API em PATCH/POST batch de clientes. */
const CUSTOMER_BATCH_CHUNK = 100;

function chunkIds(ids: string[], size = CUSTOMER_BATCH_CHUNK): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

const CUSTOMER_STATUS_OPTIONS: {
  value: CustomerStatus;
  label: string;
}[] = [
  { value: "ACTIVE", label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
];

function selectAllState(
  allSelected: boolean,
  someSelected: boolean,
): boolean | "indeterminate" {
  if (allSelected) return true;
  if (someSelected) return "indeterminate";
  return false;
}

function customerStatusLabel(status: CustomerStatus | undefined): string {
  return status === "INACTIVE" ? "Inativo" : "Ativo";
}

type Seller = { id: string; user: { name: string } };

type PendingCustomer = CustomerRecord & {
  seller?: { user: { name: string } } | null;
  createdAt?: string;
};

function customerHasMapCoords(c: CustomerRecord): boolean {
  return (
    c.latitude != null &&
    c.longitude != null &&
    String(c.latitude).trim() !== "" &&
    String(c.longitude).trim() !== ""
  );
}

function formatDocument(c: CustomerRecord): string {
  if (c.cnpj) return formatCnpjMask(c.cnpj);
  if (c.cpf) return formatCpfMask(c.cpf);
  return "—";
}

function formatCityUf(c: CustomerRecord): string {
  if (c.city && c.state) return `${c.city}/${c.state}`;
  if (c.state) return c.state;
  return "—";
}

function approvalBadge(status: CustomerRecord["approvalStatus"]) {
  if (status === "PENDING") {
    return (
      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">
        Aguardando validação
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">
        Rejeitado
      </span>
    );
  }
  return null;
}

function statusBadge(status: CustomerRecord["status"]) {
  if (status === "INACTIVE") {
    return (
      <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">
        Inativo
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
      Ativo
    </span>
  );
}

export function CustomersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { confirm, alert } = useConfirm();
  const canApprove = Boolean(
    user &&
      (user.role === "ADMIN" ||
        canWrite(user.role, "customers", user.permissions)),
  );

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["admin", "customers", debouncedSearch.trim()],
    queryFn: () => {
      const qs = new URLSearchParams();
      const term = debouncedSearch.trim();
      if (term) qs.set("q", term);
      const q = qs.toString();
      return apiFetch<CustomerRecord[]>(
        `/admin/customers${q ? `?${q}` : ""}`,
      );
    },
  });
  const { data: pending = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["admin", "customers", "pending-approval"],
    queryFn: () =>
      apiFetch<PendingCustomer[]>("/admin/customers/pending-approval"),
  });
  const { data: sellers = [] } = useQuery({
    queryKey: ["admin", "sellers"],
    queryFn: () => apiFetch<Seller[]>("/admin/sellers"),
  });
  const { data: priceTables = [] } = useQuery({
    queryKey: ["admin", "price-tables"],
    queryFn: () =>
      apiFetch<Array<{ id: string; name: string }>>("/admin/price-tables"),
  });
  const { data: catalogProducts = [] } = useQuery({
    queryKey: ["admin", "products", "names"],
    queryFn: () =>
      apiFetch<Array<{ id: string; name: string }>>("/admin/products"),
    enabled: sheetOpen && Boolean(editing),
  });

  const { data: pricingSettings } = useQuery({
    queryKey: ["admin", "pricing-settings"],
    queryFn: () =>
      apiFetch<{
        defaultMaxSellerDiscountPercent: number;
        creditPolicy: string;
      }>("/admin/pricing-settings"),
  });

  const patchPricing = useMutation({
    mutationFn: (creditPolicy: string) =>
      apiFetch("/admin/pricing-settings", {
        method: "PATCH",
        body: JSON.stringify({ creditPolicy }),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["admin", "pricing-settings"] }),
  });

  const approve = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/customers/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
    onError: (e: Error) => {
      void alert({
        title: "Não foi possível aprovar",
        description: e.message,
        tone: "danger",
      });
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiFetch(`/admin/customers/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
    onError: (e: Error) => {
      void alert({
        title: "Não foi possível rejeitar",
        description: e.message,
        tone: "danger",
      });
    },
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormValues>(emptyCustomerForm());
  const [showValidation, setShowValidation] = useState(false);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [sellerId, setSellerId] = useState("");
  const [defaultPriceTableId, setDefaultPriceTableId] = useState("");
  const [specialPrices, setSpecialPrices] = useState<
    Array<{ productId: string; price: string; validFrom: string; validTo: string }>
  >([]);
  const [creditLimitStr, setCreditLimitStr] = useState("");
  const [creditBlockedEdit, setCreditBlockedEdit] = useState(false);
  const [statusEdit, setStatusEdit] = useState<CustomerStatus>("ACTIVE");
  const [geoLatStr, setGeoLatStr] = useState("");
  const [geoLngStr, setGeoLngStr] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkSeller, setBulkSeller] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const canEditCustomers = Boolean(
    user &&
      (user.role === "ADMIN" ||
        canWrite(user.role, "customers", user.permissions)),
  );

  const customerIds = useMemo(() => customers.map((c) => c.id), [customers]);
  const allSelected =
    customerIds.length > 0 && customerIds.every((id) => selectedIds.has(id));
  const someSelected =
    customerIds.some((id) => selectedIds.has(id)) && !allSelected;
  const hasSelection = selectedIds.size > 0;

  useEffect(() => {
    const valid = new Set(customerIds);
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [customerIds]);

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(customerIds) : new Set());
  }

  function patchForm(patch: Partial<CustomerFormValues>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyCustomerForm());
    setShowValidation(false);
    setSellerId("");
    setDefaultPriceTableId("");
    setSpecialPrices([]);
    setCreditLimitStr("");
    setCreditBlockedEdit(false);
    setStatusEdit("ACTIVE");
    setGeoLatStr("");
    setGeoLngStr("");
  }

  function openCreate() {
    resetForm();
    setSheetOpen(true);
  }

  function openEdit(c: CustomerRecord) {
    setEditing(c);
    setForm(customerToForm(c));
    setSellerId(c.sellerId ?? "");
    setDefaultPriceTableId(c.defaultPriceTableId ?? "");
    setCreditBlockedEdit(Boolean(c.creditBlocked));
    setStatusEdit(c.status === "INACTIVE" ? "INACTIVE" : "ACTIVE");
    setCreditLimitStr(
      c.creditLimit != null && c.creditLimit !== ""
        ? String(Number(c.creditLimit as string))
        : "",
    );
    setGeoLatStr(
      c.latitude != null && c.latitude !== ""
        ? String(Number(c.latitude as string))
        : "",
    );
    setGeoLngStr(
      c.longitude != null && c.longitude !== ""
        ? String(Number(c.longitude as string))
        : "",
    );
    setSheetOpen(true);
    void apiFetch<
      Array<{
        productId: string;
        price: number;
        validFrom: string | null;
        validTo: string | null;
      }>
    >(`/admin/customers/${c.id}/special-prices`).then((rows) => {
      setSpecialPrices(
        rows.map((r) => ({
          productId: r.productId,
          price: String(r.price),
          validFrom: r.validFrom ? r.validFrom.slice(0, 10) : "",
          validTo: r.validTo ? r.validTo.slice(0, 10) : "",
        })),
      );
    });
  }

  function closeSheet() {
    setSheetOpen(false);
    resetForm();
  }

  function parseGeo(): { latitude?: number | null; longitude?: number | null } {
    const lt = geoLatStr.trim();
    const lg = geoLngStr.trim();
    if (!lt && !lg) return { latitude: null, longitude: null };
    if (!lt || !lg)
      throw new Error("Informe latitude e longitude, ou deixe os dois vazios.");
    const latitude = Number(lt.replace(",", "."));
    const longitude = Number(lg.replace(",", "."));
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
      throw new Error("Latitude inválida.");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
      throw new Error("Longitude inválida.");
    return { latitude, longitude };
  }

  const create = useMutation({
    mutationFn: () => {
      const geo = parseGeo();
      return apiFetch("/admin/customers", {
        method: "POST",
        body: JSON.stringify(
          formToCustomerPayload(form, {
            sellerId: sellerId || null,
            defaultPriceTableId: defaultPriceTableId || null,
            ...geo,
          }),
        ),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
      closeSheet();
    },
    onError: (e: Error) => {
      void alert({
        title: "Não foi possível criar o cliente",
        description: e.message,
        tone: "danger",
      });
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      const geo = parseGeo();
      const updated = await apiFetch(`/admin/customers/${editing!.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...formToCustomerPayload(form, {
            sellerId: sellerId || null,
            defaultPriceTableId: defaultPriceTableId || null,
            creditLimit:
              creditLimitStr.trim() === ""
                ? null
                : Number(creditLimitStr.replace(",", ".")),
            creditBlocked: creditBlockedEdit,
            status: statusEdit,
            ...geo,
          }),
        }),
      });
      await apiFetch(`/admin/customers/${editing!.id}/special-prices`, {
        method: "PUT",
        body: JSON.stringify({
          items: specialPrices
            .filter((r) => r.productId && r.price.trim())
            .map((r) => ({
              productId: r.productId,
              price: Number(r.price.replace(",", ".")),
              validFrom: r.validFrom || null,
              validTo: r.validTo || null,
            })),
        }),
      });
      return updated;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
      closeSheet();
    },
    onError: (e: Error) => {
      void alert({
        title: "Não foi possível atualizar o cliente",
        description: e.message,
        tone: "danger",
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/customers/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] }),
  });

  const batchPatch = useMutation({
    mutationFn: async (body: {
      ids: string[];
      status?: CustomerStatus;
      creditBlocked?: boolean;
      sellerId?: string | null;
    }) => {
      let updated = 0;
      for (const ids of chunkIds(body.ids)) {
        const res = await apiFetch<{ updated: number }>(
          "/admin/customers/batch",
          {
            method: "PATCH",
            body: JSON.stringify({ ...body, ids }),
          },
        );
        updated += res.updated;
      }
      return { updated };
    },
    onSuccess: () => {
      setActionError(null);
      setBulkStatus("");
      setBulkSeller("");
      setSelectedIds(new Set());
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
    onError: (err) => {
      setBulkStatus("");
      setBulkSeller("");
      setActionError(
        err instanceof Error ? err.message : "Erro ao atualizar clientes",
      );
    },
  });

  const batchDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      let deleted = 0;
      for (const chunk of chunkIds(ids)) {
        const res = await apiFetch<{ deleted: number }>(
          "/admin/customers/batch-delete",
          {
            method: "POST",
            body: JSON.stringify({ ids: chunk }),
          },
        );
        deleted += res.deleted;
      }
      return { deleted };
    },
    onSuccess: () => {
      setActionError(null);
      setSelectedIds(new Set());
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    },
    onError: (err) => {
      setActionError(
        err instanceof Error ? err.message : "Erro ao excluir clientes",
      );
    },
  });

  const batchBusy = batchPatch.isPending || batchDelete.isPending;

  async function applyBatchStatus(status: CustomerStatus) {
    if (!canEditCustomers || !hasSelection || batchBusy) return;
    const ok = await confirm({
      title: `Alterar status de ${selectedIds.size} cliente(s)?`,
      description: `A situação comercial será alterada para “${customerStatusLabel(status)}”.`,
      confirmLabel: "Alterar status",
      tone: status === "INACTIVE" ? "destructive" : "default",
    });
    if (!ok) {
      setBulkStatus("");
      return;
    }
    setBulkStatus(status);
    batchPatch.mutate({ ids: [...selectedIds], status });
  }

  function applyBatchCreditBlocked(blocked: boolean) {
    if (!canEditCustomers || !hasSelection || batchBusy) return;
    batchPatch.mutate({ ids: [...selectedIds], creditBlocked: blocked });
  }

  function applyBatchSeller(v: string) {
    if (!canEditCustomers || !hasSelection || batchBusy) return;
    setBulkSeller(v);
    batchPatch.mutate({
      ids: [...selectedIds],
      sellerId: v === "" ? null : v,
    });
  }

  async function confirmBatchDelete() {
    if (!canEditCustomers || !hasSelection || batchBusy) return;
    const ok = await confirm({
      title: "Excluir clientes selecionados?",
      description: `${selectedIds.size} cliente(s) serão removidos permanentemente do sistema.`,
      confirmLabel: "Excluir",
      tone: "destructive",
    });
    if (ok) batchDelete.mutate([...selectedIds]);
  }

  const formErrors = useMemo(
    () => (showValidation ? validateCustomerForm(form) : {}),
    [form, showValidation],
  );

  useScrollToFirstError(formErrors, { enabled: showValidation });

  function trySubmit() {
    const errors = validateCustomerForm(form);
    if (Object.keys(errors).length > 0) {
      setShowValidation(true);
      return;
    }
    if (editing) update.mutate();
    else create.mutate();
  }

  async function handleReject(c: PendingCustomer) {
    const ok = await confirm({
      title: `Rejeitar cadastro de ${c.name}?`,
      description:
        "O vendedor verá o status rejeitado. O cliente não poderá ser usado em vendas.",
      confirmLabel: "Rejeitar",
      tone: "destructive",
    });
    if (!ok) return;
    reject.mutate({ id: c.id });
  }

  const savePending = editing ? update.isPending : create.isPending;
  const actionBusy = approve.isPending || reject.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            Importar CSV
          </Button>
          <Button type="button" onClick={openCreate}>
            Novo cliente
          </Button>
        </div>
      </div>

      <CsvImportSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="customers"
        title="Importar clientes (CSV)"
        templatePath="/admin/imports/customers/template.csv"
        templateFilename="clientes-modelo.csv"
        previewPath="/admin/imports/customers/preview"
        commitPath="/admin/imports/customers/commit"
        onImported={() =>
          void qc.invalidateQueries({ queryKey: ["admin", "customers"] })
        }
      />

      {!pendingLoading && pending.length > 0 ? (
        <FormSection
          id="pendentes"
          title={`Cadastros pendentes (${pending.length})`}
          description="Clientes criados pelo vendedor aguardando validação do escritório."
          className="border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/30"
        >
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {pending.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{c.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDocument(c)}
                    {c.city || c.state ? ` · ${formatCityUf(c)}` : ""}
                    {c.seller?.user.name
                      ? ` · Vendedor: ${c.seller.user.name}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(c)}
                  >
                    Ver
                  </Button>
                  {canApprove ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={actionBusy}
                        onClick={() => approve.mutate(c.id)}
                      >
                        Aprovar
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={actionBusy}
                        onClick={() => void handleReject(c)}
                      >
                        Rejeitar
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </FormSection>
      ) : null}

      <FormSection
        title="Quando o cliente está “ruim” no crédito"
        description="Escolha se o app só avisa o vendedor, bloqueia o pedido ou envia para aprovação no escritório."
        className="border-sky-100 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/30"
      >
        <FormGrid cols={2}>
          <FormField
            label="Política da empresa"
            htmlFor="credit-policy"
            className="sm:col-span-2 max-w-md"
          >
            <AppSelect
              id="credit-policy"
              value={pricingSettings?.creditPolicy ?? "WARN_ONLY"}
              disabled={patchPricing.isPending || pricingSettings === undefined}
              options={[
                { value: "WARN_ONLY", label: "Só avisar (não bloqueia)" },
                { value: "BLOCK_ORDER", label: "Bloquear pedido" },
                {
                  value: "REQUIRE_APPROVAL",
                  label: "Pedir aprovação no escritório",
                },
              ]}
              onValueChange={(v) => patchPricing.mutate(v)}
            />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
          else setSheetOpen(true);
        }}
        title={editing ? "Editar cliente" : "Pré-cadastro de cliente"}
        description="Dados cadastrais completos, localização no mapa e, na edição, crédito."
        footer={
          <FormSheetActions
            onCancel={closeSheet}
            onSubmit={trySubmit}
            submitLabel={editing ? "Salvar alterações" : "Cadastrar"}
            pending={savePending}
          />
        }
      >
        <CustomerFormFields
          values={form}
          onChange={patchForm}
          errors={formErrors}
          showCnpjLookup={!editing || form.documentType === "CNPJ"}
        />

        <FormGrid cols={2} className="mt-6">
          <FormField
            label="Vendedor"
            htmlFor="cust-seller"
            className="sm:col-span-2"
          >
            <AppSelect
              id="cust-seller"
              value={sellerId}
              emptyLabel="Opcional"
              placeholder="Opcional"
              options={sellers.map((s) => ({
                value: s.id,
                label: s.user.name,
              }))}
              onValueChange={setSellerId}
            />
          </FormField>
          <FormField
            label="Tabela de preço padrão"
            htmlFor="cust-default-pt"
            className="sm:col-span-2"
            hint="Ao abrir um pedido, esta tabela é selecionada automaticamente."
          >
            <AppSelect
              id="cust-default-pt"
              value={defaultPriceTableId}
              emptyLabel="Nenhuma"
              placeholder="Nenhuma"
              options={priceTables.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
              onValueChange={setDefaultPriceTableId}
            />
          </FormField>
        </FormGrid>

        <div className="mt-4 rounded-lg border border-dashed border-border bg-background/90 p-4">
          <p className="text-xs font-semibold text-foreground">
            Localização no mapa (app do vendedor)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Marque no mapa ou informe latitude/longitude em graus decimais.
            Opcional; necessário para rota e «próximos».
          </p>
          <LocationPinMap
            className="mt-3"
            active={sheetOpen}
            latitude={geoLatStr}
            longitude={geoLngStr}
            onChange={(lat, lng) => {
              setGeoLatStr(lat);
              setGeoLngStr(lng);
            }}
          />
          <FormGrid cols={2} className="mt-3">
            <FormField label="Latitude" htmlFor="cust-lat">
              <Input
                id="cust-lat"
                placeholder="Ex.: -23.5505"
                value={geoLatStr}
                onChange={(e) => {
                  const v = e.target.value;
                  const split = splitLatLngPaste(v);
                  if (split) {
                    setGeoLatStr(split.lat);
                    setGeoLngStr(split.lng);
                    return;
                  }
                  setGeoLatStr(v);
                }}
                autoComplete="off"
              />
            </FormField>
            <FormField label="Longitude" htmlFor="cust-lng">
              <Input
                id="cust-lng"
                placeholder="Ex.: -46.6333"
                value={geoLngStr}
                onChange={(e) => {
                  const v = e.target.value;
                  const split = splitLatLngPaste(v);
                  if (split) {
                    setGeoLatStr(split.lat);
                    setGeoLngStr(split.lng);
                    return;
                  }
                  setGeoLngStr(v);
                }}
                autoComplete="off"
              />
            </FormField>
          </FormGrid>
        </div>

        {editing ? (
          <div className="mt-4 space-y-4">
            <FormSection
              title="Situação comercial"
              description="Ativo ou inativo. Cliente inativo pode voltar a ativo ao confirmar uma nova compra (se a regra automática estiver ligada) ou ao alterar aqui."
              className="border-border bg-muted/30"
            >
              <FormField
                label="Status do cliente"
                htmlFor="cust-status"
                className="max-w-sm"
              >
                <AppSelect
                  id="cust-status"
                  value={statusEdit}
                  options={CUSTOMER_STATUS_OPTIONS}
                  onValueChange={(v) => setStatusEdit(v as CustomerStatus)}
                />
              </FormField>
            </FormSection>

            <FormGrid
              cols={2}
              className="rounded-lg border border-border bg-background/80 p-4"
            >
              <FormField
                label="Crédito"
                className="flex flex-row items-center gap-2 sm:col-span-2"
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={creditBlockedEdit}
                    onCheckedChange={(v) => setCreditBlockedEdit(v === true)}
                  />
                  Cliente bloqueado para vendas
                </label>
              </FormField>
              <FormField
                label="Limite de crédito (R$)"
                htmlFor="cust-credit-limit"
                hint="Vazio = sem limite"
              >
                <Input
                  id="cust-credit-limit"
                  placeholder="Sem limite"
                  value={creditLimitStr}
                  onChange={(e) => setCreditLimitStr(e.target.value)}
                />
              </FormField>
            </FormGrid>
          </div>
        ) : null}

        {editing ? (
          <div className="mt-4 rounded-lg border border-border bg-background/80 p-4">
            <p className="text-sm font-medium">Preços especiais</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Preço por produto, com validade opcional. Depois do prazo, volta
              automaticamente à tabela.
            </p>
            <div className="mt-3 space-y-2">
              {specialPrices.map((row, idx) => (
                <div
                  key={`${row.productId}-${idx}`}
                  className="grid gap-2 sm:grid-cols-[1fr_6rem_7rem_7rem_auto]"
                >
                  <AppSelect
                    value={row.productId}
                    placeholder="Produto"
                    options={catalogProducts.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    onValueChange={(productId) =>
                      setSpecialPrices((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, productId } : r,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="Preço"
                    value={row.price}
                    onChange={(e) =>
                      setSpecialPrices((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, price: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <Input
                    type="date"
                    value={row.validFrom}
                    onChange={(e) =>
                      setSpecialPrices((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, validFrom: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <Input
                    type="date"
                    value={row.validTo}
                    onChange={(e) =>
                      setSpecialPrices((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, validTo: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSpecialPrices((prev) =>
                        prev.filter((_, i) => i !== idx),
                      )
                    }
                  >
                    Remover
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSpecialPrices((prev) => [
                    ...prev,
                    { productId: "", price: "", validFrom: "", validTo: "" },
                  ])
                }
              >
                Adicionar preço especial
              </Button>
            </div>
          </div>
        ) : null}

        {editing ? <CustomerTitlesPanel customerId={editing.id} /> : null}
        {editing ? (
          <AuditLogPanel
            className="mt-6"
            entityType="Customer"
            entityId={editing.id}
            enabled={sheetOpen}
            take={25}
          />
        ) : null}
      </FormSheet>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Input
          className="max-w-md"
          placeholder="Buscar por nome, fantasia, documento, cidade, vendedor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
        {debouncedSearch.trim() && !isLoading ? (
          <p className="text-sm text-muted-foreground">
            {customers.length} resultado(s)
          </p>
        ) : null}
      </div>

      {canEditCustomers && customers.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {hasSelection
              ? `${selectedIds.size} cliente(s) selecionado(s)`
              : "Selecione clientes para editar em lote"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AppSelect
              value={bulkStatus}
              disabled={!hasSelection || batchBusy}
              placeholder="Alterar status…"
              emptyLabel="Alterar status…"
              triggerClassName="w-[11.5rem]"
              options={CUSTOMER_STATUS_OPTIONS}
              onValueChange={(v) => {
                if (v === "ACTIVE" || v === "INACTIVE")
                  void applyBatchStatus(v);
              }}
            />
            <AppSelect
              value={bulkSeller}
              disabled={!hasSelection || batchBusy}
              placeholder="Alterar vendedor…"
              emptyLabel="— Sem vendedor —"
              triggerClassName="w-[12rem]"
              options={sellers.map((s) => ({
                value: s.id,
                label: s.user.name,
              }))}
              onValueChange={(v) => applyBatchSeller(v)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasSelection || batchBusy}
              onClick={() => applyBatchCreditBlocked(false)}
            >
              Desbloquear crédito
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasSelection || batchBusy}
              onClick={() => applyBatchCreditBlocked(true)}
            >
              Bloquear crédito
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!hasSelection || batchBusy}
              onClick={() => void confirmBatchDelete()}
            >
              {batchDelete.isPending ? "Excluindo…" : "Excluir selecionados"}
            </Button>
          </div>
        </div>
      ) : null}

      {actionError ? (
        <p className="text-sm text-destructive">{actionError}</p>
      ) : null}

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {canEditCustomers ? (
                  <TableHead className="w-10 px-4">
                    <Checkbox
                      checked={selectAllState(allSelected, someSelected)}
                      disabled={batchBusy}
                      onCheckedChange={(v) => toggleAll(v === true)}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                ) : null}
                <TableHead className="px-4">Nome</TableHead>
                <TableHead className="px-4">Documento</TableHead>
                <TableHead className="px-4">Cidade/UF</TableHead>
                <TableHead className="px-4">Telefone</TableHead>
                <TableHead className="px-4">Vendedor</TableHead>
                <TableHead className="px-4">Mapa</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Validação</TableHead>
                <TableHead className="px-4">Crédito</TableHead>
                <TableHead className="px-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const selected = selectedIds.has(c.id);
                return (
                  <TableRow
                    key={c.id}
                    className={cn(selected && "bg-muted/40")}
                  >
                    {canEditCustomers ? (
                      <TableCell className="px-4 py-3">
                        <Checkbox
                          checked={selected}
                          disabled={batchBusy}
                          onCheckedChange={(v) => toggleOne(c.id, v === true)}
                          aria-label={`Selecionar ${c.name}`}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="px-4 py-3">{c.name}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs">
                      {formatDocument(c)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {formatCityUf(c)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {c.phone ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {(
                        c as CustomerRecord & {
                          seller?: { user: { name: string } };
                        }
                      ).seller?.user.name ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {customerHasMapCoords(c) ? (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Sim
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Não</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {statusBadge(c.status)}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {approvalBadge(c.approvalStatus) ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {(() => {
                        const row = c as CustomerRecord & {
                          creditSituation?: string;
                          creditOpenAmount?: number;
                          creditOverdueAmount?: number;
                        };
                        if (row.creditBlocked || row.creditSituation === "OVERDUE") {
                          return (
                            <div>
                              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900">
                                Inadimplente
                              </span>
                              {row.creditOverdueAmount != null &&
                              row.creditOverdueAmount > 0 ? (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Vencido R${" "}
                                  {row.creditOverdueAmount
                                    .toFixed(2)
                                    .replace(".", ",")}
                                </div>
                              ) : null}
                            </div>
                          );
                        }
                        if (row.creditSituation === "OPEN") {
                          return (
                            <div>
                              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                                Em aberto
                              </span>
                              {row.creditOpenAmount != null ? (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  R${" "}
                                  {row.creditOpenAmount
                                    .toFixed(2)
                                    .replace(".", ",")}
                                </div>
                              ) : null}
                            </div>
                          );
                        }
                        return (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                            Em dia
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="text-primary"
                        onClick={() => openEdit(c)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="ml-3 text-destructive"
                        onClick={() => {
                          void confirm({
                            title: "Excluir cliente?",
                            description:
                              "O cliente será removido permanentemente do sistema.",
                            confirmLabel: "Excluir",
                            tone: "destructive",
                          }).then((ok) => {
                            if (ok) remove.mutate(c.id);
                          });
                        }}
                      >
                        Excluir
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
