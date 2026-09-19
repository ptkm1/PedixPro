import { useConfirm } from "@/components/confirm";
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
import {
  canRead,
  formatBrazilPhoneDigits,
  planHasFeature,
  SELLER_COMMISSION_TYPES,
  sellerCommissionTypeLabel,
  type SellerCommissionType,
} from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../lib/api";
import { isWebAdmin } from "../lib/staff";

type Manager = { id: string; name: string; email: string };

type Seller = {
  id: string;
  commissionType: SellerCommissionType;
  commissionPercent: unknown;
  active: boolean;
  managerUserId: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    matricula?: string | null;
    phone?: string | null;
    activatedAt?: string | null;
  };
  manager: Manager | null;
  team: { id: string; name: string } | null;
  defaultPriceTableId?: string | null;
  allowedPriceTables?: Array<{ priceTableId: string }>;
};

function selectAllState(
  allSelected: boolean,
  someSelected: boolean,
): boolean | "indeterminate" {
  if (allSelected) return true;
  if (someSelected) return "indeterminate";
  return false;
}

function userHasPlanFeature(
  user: ReturnType<typeof useAuth>["user"],
  feature: "teams" | "tracking",
): boolean {
  if (user?.subscription?.features?.length) {
    return user.subscription.features.includes(feature);
  }
  return planHasFeature(user?.subscription?.planId, feature);
}

export function SellersPage() {
  const { user } = useAuth();
  const admin = isWebAdmin(user?.role);
  const qc = useQueryClient();
  const { confirm } = useConfirm();

  const canOpenTeams = Boolean(
    user &&
      canRead(user.role, "teams", user.permissions) &&
      userHasPlanFeature(user, "teams"),
  );
  const canOpenTracking = Boolean(
    user &&
      canRead(user.role, "tracking", user.permissions) &&
      userHasPlanFeature(user, "tracking"),
  );

  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ["admin", "sellers"],
    queryFn: () => apiFetch<Seller[]>("/admin/sellers"),
    enabled: admin,
  });

  const { data: managers = [] } = useQuery({
    queryKey: ["admin", "managers"],
    queryFn: () => apiFetch<Manager[]>("/admin/managers"),
    enabled: admin,
  });

  const { data: priceTables = [] } = useQuery({
    queryKey: ["admin", "price-tables"],
    queryFn: () =>
      apiFetch<Array<{ id: string; name: string }>>("/admin/price-tables"),
    enabled: admin,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [commissionType, setCommissionType] =
    useState<SellerCommissionType>("FIXED");
  const [commission, setCommission] = useState("10");
  const [managerUserId, setManagerUserId] = useState("");
  const [active, setActive] = useState(true);
  const [allowedTableIds, setAllowedTableIds] = useState<string[]>([]);
  const [defaultPriceTableId, setDefaultPriceTableId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkManager, setBulkManager] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const sellerIds = useMemo(() => sellers.map((s) => s.id), [sellers]);
  const selectedSellers = useMemo(
    () => sellers.filter((s) => selectedIds.has(s.id)),
    [sellers, selectedIds],
  );
  const hasSelection = selectedIds.size > 0;
  const allSelected =
    sellerIds.length > 0 && sellerIds.every((id) => selectedIds.has(id));
  const someSelected =
    sellerIds.some((id) => selectedIds.has(id)) && !allSelected;

  useEffect(() => {
    const valid = new Set(sellerIds);
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sellerIds]);

  function resetForm() {
    setEditingId(null);
    setEmail("");
    setPassword("");
    setSendInvite(true);
    setName("");
    setPhone("");
    setCommissionType("FIXED");
    setCommission("10");
    setManagerUserId("");
    setActive(true);
    setAllowedTableIds([]);
    setDefaultPriceTableId("");
    setFormError(null);
    setShowValidation(false);
  }

  function openCreate() {
    resetForm();
    setSheetOpen(true);
  }

  function openEdit(s: Seller) {
    setEditingId(s.id);
    setEmail(s.user.email);
    setPassword("");
    setName(s.user.name);
    setPhone(s.user.phone ?? "");
    setCommissionType(s.commissionType ?? "FIXED");
    setCommission(String(Number(s.commissionPercent)));
    setManagerUserId(s.managerUserId ?? "");
    setActive(s.active);
    setAllowedTableIds(
      (s.allowedPriceTables ?? []).map((r) => r.priceTableId),
    );
    setDefaultPriceTableId(s.defaultPriceTableId ?? "");
    setFormError(null);
    setShowValidation(false);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    resetForm();
  }

  function toggleSeller(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(sellerIds) : new Set());
  }

  function invalidateSellers() {
    void qc.invalidateQueries({ queryKey: ["admin", "sellers"] });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const payload: Record<string, unknown> = {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          commissionType,
          active,
          managerUserId: managerUserId === "" ? null : managerUserId,
          defaultPriceTableId: defaultPriceTableId || null,
          allowedPriceTableIds: allowedTableIds,
        };
        if (commissionType === "FIXED") {
          payload.commissionPercent = Number(commission);
        }
        if (password.length > 0) payload.password = password;
        return apiFetch<{
          invited?: boolean;
          inviteEmailSent?: boolean;
          inviteEmailError?: string;
        }>(`/admin/sellers/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      const createBody: Record<string, unknown> = {
        email: email.trim(),
        name: name.trim(),
        phone: phone.trim(),
        commissionType,
        ...(commissionType === "FIXED"
          ? { commissionPercent: Number(commission) }
          : {}),
      };
      if (sendInvite || !password) {
        createBody.invite = true;
      } else {
        createBody.password = password;
      }
      return apiFetch<{
        invited?: boolean;
        inviteEmailSent?: boolean;
        inviteEmailError?: string;
      }>("/admin/sellers", {
        method: "POST",
        body: JSON.stringify(createBody),
      });
    },
    onSuccess: (data) => {
      invalidateSellers();
      closeSheet();
      if (data.invited && data.inviteEmailSent === false) {
        setActionError(
          data.inviteEmailError ??
            "O vendedor foi criado, mas o e-mail de convite não foi enviado.",
        );
      } else {
        setActionError(null);
      }
    },
    onError: (err) => {
      setFormError(
        err instanceof Error
          ? err.message
          : editingId
            ? "Erro ao atualizar vendedor"
            : "Erro ao criar vendedor",
      );
    },
  });

  const patch = useMutation({
    mutationFn: (body: {
      id: string;
      commissionType?: SellerCommissionType;
      commissionPercent?: number;
      active?: boolean;
      managerUserId?: string | null;
    }) =>
      apiFetch(`/admin/sellers/${body.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          commissionType: body.commissionType,
          commissionPercent: body.commissionPercent,
          active: body.active,
          managerUserId: body.managerUserId,
        }),
      }),
    onSuccess: () => invalidateSellers(),
    onError: (err) => {
      setActionError(
        err instanceof Error ? err.message : "Erro ao atualizar vendedor",
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/sellers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setActionError(null);
      invalidateSellers();
    },
    onError: (err) => {
      setActionError(
        err instanceof Error ? err.message : "Erro ao excluir vendedor",
      );
    },
  });

  const resendInvite = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/sellers/${id}/resend-invite`, { method: "POST" }),
    onSuccess: () => {
      setActionError(null);
    },
    onError: (err) => {
      setActionError(
        err instanceof Error
          ? err.message
          : "Não foi possível reenviar o convite",
      );
    },
  });

  const batchDelete = useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ deleted: number }>("/admin/sellers/batch-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      setActionError(null);
      setSelectedIds(new Set());
      invalidateSellers();
    },
    onError: (err) => {
      setActionError(
        err instanceof Error ? err.message : "Erro ao excluir vendedores",
      );
    },
  });

  const batchPatch = useMutation({
    mutationFn: (body: {
      ids: string[];
      active?: boolean;
      managerUserId?: string | null;
    }) =>
      apiFetch<{ updated: number }>("/admin/sellers/batch", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setActionError(null);
      setBulkManager("");
      setSelectedIds(new Set());
      invalidateSellers();
    },
    onError: (err) => {
      setBulkManager("");
      setActionError(
        err instanceof Error ? err.message : "Erro ao atualizar vendedores",
      );
    },
  });

  const batchBusy = batchDelete.isPending || batchPatch.isPending;

  const fieldErrors = useMemo(() => {
    if (!showValidation) return {} as Record<string, string>;
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Nome é obrigatório.";
    if (!email.trim()) e.email = "Email é obrigatório.";
    if (!phone.trim()) e.phone = "Telefone é obrigatório.";
    if (!editingId && !sendInvite && password.length < 6) {
      e.password = "Senha deve ter no mínimo 6 caracteres.";
    } else if (editingId && password.length > 0 && password.length < 6) {
      e.password = "Senha deve ter no mínimo 6 caracteres.";
    }
    return e;
  }, [showValidation, name, email, phone, password, editingId, sendInvite]);

  useScrollToFirstError(
    Object.keys(fieldErrors).length > 0 ? fieldErrors : formError,
    { enabled: showValidation || Boolean(formError) },
  );

  function trySubmit() {
    setShowValidation(true);
    setFormError(null);
    if (!name.trim() || !email.trim() || !phone.trim()) return;
    if (!editingId && !sendInvite && password.length < 6) return;
    if (editingId && password.length > 0 && password.length < 6) return;
    save.mutate();
  }

  async function confirmDeleteOne(s: Seller) {
    if (s.user.id === user?.id) {
      setActionError("Não é possível excluir a própria conta");
      return;
    }
    const ok = await confirm({
      title: "Excluir vendedor?",
      description: `“${s.user.name}” (${s.user.email}) será removido permanentemente.`,
      confirmLabel: "Excluir",
      tone: "destructive",
    });
    if (ok) remove.mutate(s.id);
  }

  async function confirmBatchDelete() {
    if (!hasSelection || batchBusy) return;
    const ok = await confirm({
      title: "Excluir vendedores selecionados?",
      description: `${selectedSellers.length} vendedor(es) serão removidos permanentemente.`,
      confirmLabel: "Excluir",
      tone: "destructive",
    });
    if (ok) batchDelete.mutate([...selectedIds]);
  }

  function applyBatchManager(v: string) {
    if (!hasSelection || batchBusy) return;
    setBulkManager(v);
    batchPatch.mutate({
      ids: [...selectedIds],
      managerUserId: v === "" ? null : v,
    });
  }

  function applyBatchActive(nextActive: boolean) {
    if (!hasSelection || batchBusy) return;
    batchPatch.mutate({ ids: [...selectedIds], active: nextActive });
  }

  if (!admin) {
    return (
      <p className="text-muted-foreground">
        A gestão de vendedores é exclusiva de administradores.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Vendedores da {user?.organizationName?.trim() || "sua empresa"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Somente a equipe de vendas desta empresa. Cadastros de outras
            empresas não aparecem aqui.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canOpenTeams ? (
            <Button variant="outline" asChild>
              <Link to="/equipes">Equipes</Link>
            </Button>
          ) : null}
          {canOpenTracking ? (
            <Button variant="outline" asChild>
              <Link to="/rastreio">Localização em tempo real</Link>
            </Button>
          ) : null}
          <Button type="button" onClick={openCreate}>
            Novo vendedor
          </Button>
        </div>
      </div>

      <FormSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
          else setSheetOpen(true);
        }}
        title={editingId ? "Editar vendedor" : "Novo vendedor"}
        description={
          editingId
            ? "Atualize dados, comissão, gestor ou defina uma nova senha."
            : "Envie um convite por e-mail (padrão) ou defina uma senha inicial."
        }
        footer={
          <FormSheetActions
            onCancel={closeSheet}
            onSubmit={trySubmit}
            submitLabel={
              editingId
                ? "Salvar"
                : sendInvite
                  ? "Enviar convite"
                  : "Criar vendedor"
            }
            pending={save.isPending}
          />
        }
      >
        <FormGrid cols={2}>
          <FormField
            label="Nome"
            htmlFor="seller-name"
            required
            error={fieldErrors.name}
            className="sm:col-span-2"
          >
            <Input
              id="seller-name"
              placeholder="Nome"
              aria-invalid={fieldErrors.name ? true : undefined}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField
            label="Email"
            htmlFor="seller-email"
            required
            error={fieldErrors.email}
          >
            <Input
              id="seller-email"
              type="email"
              placeholder="Email"
              aria-invalid={fieldErrors.email ? true : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <FormField
            label="Telefone"
            htmlFor="seller-phone"
            required
            error={fieldErrors.phone}
          >
            <Input
              id="seller-phone"
              type="tel"
              placeholder="Telefone"
              aria-invalid={fieldErrors.phone ? true : undefined}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </FormField>
          {!editingId ? (
            <FormField
              label="Convite por e-mail"
              htmlFor="seller-invite"
              className="sm:col-span-2"
              hint="O vendedor recebe um link para definir a própria senha."
            >
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  id="seller-invite"
                  checked={sendInvite}
                  onCheckedChange={(v) => {
                    setSendInvite(v === true);
                    if (v === true) setPassword("");
                  }}
                />
                Enviar convite (recomendado)
              </label>
            </FormField>
          ) : null}
          {(editingId || !sendInvite) && (
            <FormField
              label="Senha"
              htmlFor="seller-password"
              required={!editingId && !sendInvite}
              hint={
                editingId
                  ? "Deixe em branco para manter a senha atual"
                  : "Mínimo 6 caracteres"
              }
              error={fieldErrors.password}
            >
              <Input
                id="seller-password"
                type="password"
                placeholder={
                  editingId ? "Nova senha (opcional)" : "Senha inicial"
                }
                aria-invalid={fieldErrors.password ? true : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
          )}
          {editingId ? (
            <>
              <FormField label="Gestor" htmlFor="seller-manager">
                <AppSelect
                  id="seller-manager"
                  value={managerUserId}
                  emptyLabel="— Sem gestor —"
                  placeholder="— Sem gestor —"
                  options={managers.map((m) => ({
                    value: m.id,
                    label: m.name,
                  }))}
                  onValueChange={setManagerUserId}
                />
              </FormField>
              <FormField label="Ativo" htmlFor="seller-active-edit">
                <label className="flex h-10 items-center gap-2 text-sm">
                  <Checkbox
                    id="seller-active-edit"
                    checked={active}
                    onCheckedChange={(v) => setActive(v === true)}
                  />
                  Vendedor ativo
                </label>
              </FormField>
            </>
          ) : null}
        </FormGrid>

        <FormField
          label="Tipo de comissão"
          htmlFor="seller-commission-type"
          className="mt-4"
          hint="Define de onde vem o percentual nas vendas deste vendedor."
        >
          <div
            id="seller-commission-type"
            className="grid gap-2 sm:grid-cols-2"
            role="radiogroup"
            aria-label="Tipo de comissão"
          >
            {SELLER_COMMISSION_TYPES.map((opt) => {
              const selected = commissionType === opt.value;
              const disabled = Boolean(opt.comingSoon);
              return (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border px-3 py-3 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="commissionType"
                    className="mt-0.5"
                    value={opt.value}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => setCommissionType(opt.value)}
                  />
                  <span>
                    <span className="font-medium text-foreground">
                      {opt.label}
                      {opt.comingSoon ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          (em breve)
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {opt.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </FormField>

        {commissionType === "FIXED" ? (
          <FormField
            label="Comissão fixa (%)"
            htmlFor="seller-commission"
            className="mt-4 max-w-xs"
            hint="Percentual aplicado em todas as vendas."
          >
            <Input
              id="seller-commission"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
            />
          </FormField>
        ) : commissionType === "BY_PRODUCT" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Defina o percentual de comissão em cada{" "}
            <Link to="/produtos/novo" className="text-primary hover:underline">
              produto
            </Link>
            .
          </p>
        ) : commissionType === "BY_CATEGORY" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Defina o percentual de comissão em cada{" "}
            <Link
              to="/produtos/categorias"
              className="text-primary hover:underline"
            >
              grupo de produtos (categoria)
            </Link>
            .
          </p>
        ) : null}
        <FormField
          label="Tabelas de preço permitidas"
          className="mt-4"
          hint="Nenhuma marcada = o vendedor usa todas as tabelas ativas."
        >
          <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border p-3">
            {priceTables.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma tabela cadastrada.
              </p>
            ) : (
              priceTables.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={allowedTableIds.includes(t.id)}
                    onCheckedChange={(v) => {
                      setAllowedTableIds((prev) => {
                        if (v === true) return [...prev, t.id];
                        return prev.filter((id) => id !== t.id);
                      });
                    }}
                  />
                  {t.name}
                </label>
              ))
            )}
          </div>
        </FormField>
        <FormField
          label="Tabela padrão do vendedor"
          htmlFor="seller-default-pt"
          className="mt-3"
          hint="Usada se o cliente não tiver tabela padrão."
        >
          <AppSelect
            id="seller-default-pt"
            value={defaultPriceTableId}
            emptyLabel="Nenhuma"
            placeholder="Nenhuma"
            options={priceTables
              .filter(
                (t) =>
                  allowedTableIds.length === 0 ||
                  allowedTableIds.includes(t.id),
              )
              .map((t) => ({ value: t.id, label: t.name }))}
            onValueChange={setDefaultPriceTableId}
          />
        </FormField>
        <FormErrorBanner message={formError} className="mt-3" />
      </FormSheet>

      {!isLoading && sellers.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {hasSelection
              ? `${selectedSellers.length} vendedor(es) selecionado(s)`
              : "Selecione vendedores para alterar gestor, ativar/desativar ou excluir em lote"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AppSelect
              value={bulkManager}
              disabled={!hasSelection || batchBusy}
              placeholder="Alterar gestor…"
              emptyLabel="— Sem gestor —"
              triggerClassName="w-[12rem]"
              options={managers.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
              onValueChange={(v) => applyBatchManager(v)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasSelection || batchBusy}
              onClick={() => applyBatchActive(true)}
            >
              Ativar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasSelection || batchBusy}
              onClick={() => applyBatchActive(false)}
            >
              Desativar
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
      ) : sellers.length === 0 ? (
        <p className="text-muted-foreground">Nenhum vendedor cadastrado.</p>
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-4">
                  <Checkbox
                    checked={selectAllState(allSelected, someSelected)}
                    disabled={batchBusy}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="Selecionar todos"
                  />
                </TableHead>
                <TableHead className="px-4">Nome</TableHead>
                <TableHead className="px-4">Matrícula</TableHead>
                <TableHead className="px-4">Email</TableHead>
                <TableHead className="px-4">Telefone</TableHead>
                <TableHead className="px-4">Gestor</TableHead>
                <TableHead className="px-4">Equipe</TableHead>
                <TableHead className="px-4">Tipo comissão</TableHead>
                <TableHead className="px-4">Comissão %</TableHead>
                <TableHead className="px-4">Ativo</TableHead>
                <TableHead className="px-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellers.map((s) => {
                const type = s.commissionType ?? "FIXED";
                const selected = selectedIds.has(s.id);
                return (
                  <TableRow
                    key={s.id}
                    className={cn(selected && "bg-muted/40")}
                  >
                    <TableCell className="px-4 py-3">
                      <Checkbox
                        checked={selected}
                        disabled={batchBusy}
                        onCheckedChange={(v) => toggleSeller(s.id, v === true)}
                        aria-label={`Selecionar ${s.user.name}`}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3">{s.user.name}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {s.user.matricula ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">{s.user.email}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {s.user.phone?.trim()
                        ? formatBrazilPhoneDigits(s.user.phone)
                        : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <AppSelect
                        value={s.managerUserId ?? ""}
                        emptyLabel="— Sem gestor —"
                        placeholder="— Sem gestor —"
                        triggerClassName="max-w-[180px]"
                        disabled={batchBusy}
                        options={managers.map((m) => ({
                          value: m.id,
                          label: m.name,
                        }))}
                        onValueChange={(v) => {
                          patch.mutate({
                            id: s.id,
                            managerUserId: v === "" ? null : v,
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {s.team?.name ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <AppSelect
                        value={type}
                        triggerClassName="max-w-[200px] text-xs"
                        disabled={batchBusy}
                        options={[
                          ...SELLER_COMMISSION_TYPES.filter(
                            (t) => !t.comingSoon,
                          ).map((t) => ({
                            value: t.value,
                            label: t.label,
                          })),
                          {
                            value: "BY_SUPPLIER",
                            label: `${sellerCommissionTypeLabel("BY_SUPPLIER")} (em breve)`,
                            disabled: true,
                          },
                        ]}
                        onValueChange={(v) => {
                          const next = v as SellerCommissionType;
                          if (next === "BY_SUPPLIER") return;
                          patch.mutate({ id: s.id, commissionType: next });
                        }}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {type === "FIXED" ? (
                        <input
                          type="number"
                          className="w-20 rounded border px-2 py-1"
                          defaultValue={Number(s.commissionPercent)}
                          key={`${s.id}-${s.commissionPercent}-fixed`}
                          disabled={batchBusy}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (
                              !Number.isNaN(v) &&
                              v !== Number(s.commissionPercent)
                            ) {
                              patch.mutate({
                                id: s.id,
                                commissionPercent: v,
                              });
                            }
                          }}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Checkbox
                        checked={s.active}
                        disabled={batchBusy}
                        onCheckedChange={(v) =>
                          patch.mutate({ id: s.id, active: v === true })
                        }
                        aria-label={`Ativo: ${s.user.name}`}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right whitespace-nowrap">
                      {!s.user.activatedAt ? (
                        <button
                          type="button"
                          className="mr-3 text-primary hover:underline disabled:opacity-40"
                          disabled={batchBusy || resendInvite.isPending}
                          onClick={() => resendInvite.mutate(s.id)}
                        >
                          Reenviar convite
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="mr-3 text-primary hover:underline"
                        disabled={batchBusy}
                        onClick={() => openEdit(s)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="mr-3 text-destructive hover:underline disabled:opacity-40"
                        disabled={batchBusy || remove.isPending}
                        onClick={() => void confirmDeleteOne(s)}
                      >
                        Excluir
                      </button>
                      <Link
                        to={`/vendedores/${s.id}/produtos`}
                        className="text-primary hover:underline"
                      >
                        Produtos
                      </Link>
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
