import { FormSection } from "@/components/forms";
import { SettingsCategory } from "@/components/settings/SettingsCategory";
import {
  SettingsShortcutList,
  type SettingsShortcutItem,
} from "@/components/settings/SettingsShortcutList";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { canRead, planHasFeature } from "@pedidos/shared";
import {
  Building2,
  CreditCard,
  History,
  LayoutDashboard,
  RefreshCw,
  Shield,
  Table,
  Target,
  UserRound,
  UserPlus,
  UserX,
  Wallet,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuditLogsPanel } from "./AuditLogsPage";
import { PermissionsPanel } from "./PermissionsPage";

type SettingsModal = "permissions" | "audit" | null;

export function SystemSettingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modal, setModal] = useState<SettingsModal>(null);

  const isAdmin = user?.role === "ADMIN";
  const canPermissions = Boolean(
    user && canRead(user.role, "permissions", user.permissions),
  );
  const canAuditRbac = Boolean(
    user && canRead(user.role, "audit", user.permissions),
  );
  const hasAuditPlan =
    user?.subscription?.features?.includes("audit") ??
    planHasFeature(user?.subscription?.planId, "audit");
  const canAudit = canAuditRbac && hasAuditPlan;
  const canAccess = isAdmin || canPermissions || canAuditRbac;

  const hasPriceTablesPlan =
    user?.subscription?.features?.includes("price_tables") ??
    planHasFeature(user?.subscription?.planId, "price_tables");
  const canPriceTables = Boolean(
    user &&
      canRead(user.role, "price_tables", user.permissions) &&
      hasPriceTablesPlan,
  );
  const canPaymentConditions = Boolean(
    user && canRead(user.role, "orders", user.permissions),
  );
  const hasCommissionsPlan =
    user?.subscription?.features?.includes("commissions") ??
    planHasFeature(user?.subscription?.planId, "commissions");
  const canCommissions = Boolean(
    user &&
      canRead(user.role, "commissions", user.permissions) &&
      hasCommissionsPlan,
  );
  const canSalesSettings =
    canPriceTables || canPaymentConditions || canCommissions;

  const accountShortcuts: SettingsShortcutItem[] = isAdmin
    ? [
        {
          to: "/configuracoes/conta",
          title: "Plano e assinatura",
          description: "Plano atual, limites e cobrança",
          icon: CreditCard,
        },
      ]
    : [];

  const establishmentShortcuts: SettingsShortcutItem[] = isAdmin
    ? [
        {
          to: "/configuracoes/estabelecimentos",
          title: "Estabelecimentos (CNPJs)",
          description: "CNPJs da conta, estoque e fiscal por CNPJ",
          icon: Building2,
        },
      ]
    : [];

  const orderShortcuts: SettingsShortcutItem[] = isAdmin
    ? [
        {
          to: "/configuracoes/pedidos-sincronizacao",
          title: "Sincronização de pedidos",
          description: "Envio automático/manual e edição na fila",
          icon: RefreshCw,
        },
        {
          to: "/configuracoes/fluxo-pedido",
          title: "Fluxo do pedido",
          description: "Etapas do Kanban e do detalhe do pedido",
          icon: Workflow,
        },
      ]
    : [];

  const customerShortcuts: SettingsShortcutItem[] = isAdmin
    ? [
        {
          to: "/configuracoes/clientes#carteira",
          title: "Clientes no app do vendedor",
          description: "Carteira sem vendedor na lista, rota e vendas",
          icon: UserRound,
        },
        {
          to: "/configuracoes/clientes#cadastro",
          title: "Cadastro pelo vendedor",
          description: "Liberação automática ou validação no escritório",
          icon: UserPlus,
        },
        {
          to: "/configuracoes/clientes#inativacao",
          title: "Inativação automática",
          description: "Inativar clientes sem movimento há 6 meses",
          icon: UserX,
        },
      ]
    : [];

  const panelShortcuts: SettingsShortcutItem[] = isAdmin
    ? [
        {
          to: "/configuracoes/painel",
          title: "Indicadores do painel",
          description: "Widgets exibidos na coluna direita da home",
          icon: LayoutDashboard,
        },
      ]
    : [];

  const salesShortcuts: SettingsShortcutItem[] = [
    ...(canPriceTables
      ? [
          {
            to: "/tabelas-preco",
            title: "Tabelas de preço",
            description: "Tabelas e preços por produto",
            icon: Table,
          } satisfies SettingsShortcutItem,
        ]
      : []),
    ...(canPaymentConditions
      ? [
          {
            to: "/condicoes-pagamento",
            title: "Condições de pagamento",
            description: "Prazos, formas e regras de pagamento",
            icon: Wallet,
          } satisfies SettingsShortcutItem,
        ]
      : []),
    ...(canCommissions
      ? [
          {
            to: "/comissao",
            title: "Comissões e metas",
            description: "Quando a comissão a pagar entra, faixas e metas",
            icon: Target,
          } satisfies SettingsShortcutItem,
        ]
      : []),
  ];

  const securityShortcuts: SettingsShortcutItem[] = [
    ...(canPermissions
      ? [
          {
            to: "/configuracoes?abrir=permissoes",
            title: "Permissões",
            description: "Matriz de leitura e escrita por role",
            icon: Shield,
            onClick: () => setModal("permissions"),
          } satisfies SettingsShortcutItem,
        ]
      : []),
    ...(canAudit
      ? [
          {
            to: "/configuracoes?abrir=auditoria",
            title: "Auditoria",
            description: "Histórico de alterações no painel e no app",
            icon: History,
            onClick: () => setModal("audit"),
          } satisfies SettingsShortcutItem,
        ]
      : []),
  ];

  useEffect(() => {
    const abrir = searchParams.get("abrir");
    if (abrir === "permissoes" && canPermissions) setModal("permissions");
    else if (abrir === "auditoria" && canAudit) setModal("audit");
  }, [searchParams, canPermissions, canAudit]);

  function closeModal() {
    setModal(null);
    if (searchParams.has("abrir")) {
      const next = new URLSearchParams(searchParams);
      next.delete("abrir");
      setSearchParams(next, { replace: true });
    }
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!canAccess) return <Navigate to="/" replace />;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Regras do sistema e ferramentas administrativas, agrupadas por área.
        </p>
      </div>

      {accountShortcuts.length > 0 ? (
        <SettingsCategory
          id="conta"
          title="Conta e assinatura"
          description="Plano da organização, limites e cobrança."
        >
          <FormSection
            title="Atalhos"
            description="Abra cada área na tela dedicada."
          >
            <SettingsShortcutList items={accountShortcuts} />
          </FormSection>
        </SettingsCategory>
      ) : null}

      {establishmentShortcuts.length > 0 ? (
        <SettingsCategory
          id="estabelecimentos"
          title="Estabelecimentos"
          description="CNPJs da conta (estoque compartilhado, fiscal por CNPJ)."
        >
          <FormSection
            title="Atalhos"
            description="Abra cada área na tela dedicada."
          >
            <SettingsShortcutList items={establishmentShortcuts} />
          </FormSection>
        </SettingsCategory>
      ) : null}

      {orderShortcuts.length > 0 ? (
        <SettingsCategory
          id="pedidos"
          title="Pedidos e app do vendedor"
          description="Sincronização, edição na fila e etapas do fluxo de pedido."
        >
          <FormSection
            title="Atalhos"
            description="Abra cada área na tela dedicada."
          >
            <SettingsShortcutList items={orderShortcuts} />
          </FormSection>
        </SettingsCategory>
      ) : null}

      {customerShortcuts.length > 0 ? (
        <SettingsCategory
          id="clientes"
          title="Clientes"
          description="Carteira no app, aprovação de cadastro e inativação automática."
        >
          <FormSection
            title="Atalhos"
            description="Abra cada área na tela dedicada."
          >
            <SettingsShortcutList items={customerShortcuts} />
          </FormSection>
        </SettingsCategory>
      ) : null}

      {panelShortcuts.length > 0 ? (
        <SettingsCategory
          id="painel"
          title="Painel"
          description="Widgets exibidos na coluna direita da home."
        >
          <FormSection
            title="Atalhos"
            description="Abra cada área na tela dedicada."
          >
            <SettingsShortcutList items={panelShortcuts} />
          </FormSection>
        </SettingsCategory>
      ) : null}

      {canSalesSettings ? (
        <SettingsCategory
          id="vendas"
          title="Configurações de venda"
          description="Tabelas de preço, condições de pagamento e comissões."
        >
          <FormSection
            title="Atalhos"
            description="Abra cada área na tela dedicada."
          >
            <SettingsShortcutList items={salesShortcuts} />
          </FormSection>
        </SettingsCategory>
      ) : null}

      {securityShortcuts.length > 0 ? (
        <SettingsCategory
          id="seguranca"
          title="Segurança e administração"
          description="Permissões por perfil e histórico de auditoria."
        >
          <FormSection
            title="Ferramentas"
            description="Abra cada área em um painel, sem sair desta tela."
          >
            <SettingsShortcutList items={securityShortcuts} />
          </FormSection>
        </SettingsCategory>
      ) : null}

      <Dialog
        open={modal === "permissions"}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle>Permissões</DialogTitle>
            <DialogDescription>
              Ajuste o acesso de cada role na organização.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {modal === "permissions" ? <PermissionsPanel embedded /> : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modal === "audit"}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle>Auditoria</DialogTitle>
            <DialogDescription>
              Consulte o histórico de ações na organização.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {modal === "audit" ? <AuditLogsPanel embedded /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
