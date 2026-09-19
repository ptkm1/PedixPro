import { canRead, planHasFeature } from "@pedidos/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import {
    BrowserRouter,
    Navigate,
    Outlet,
    Route,
    Routes,
    useLocation,
    useParams,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ConfirmProvider } from "./components/confirm";
import { AppLogo } from "./components/layout/AppLogo";
import {
    planFeatureForPath,
    resourceForPath,
} from "./components/layout/navConfig";
import { PublicAuthLayout } from "./components/layout/PublicAuthLayout";
import { PlanFeatureGate } from "./components/PlanFeatureGate";
import { AppNotificationsProvider } from "./lib/app-notifications";
import { createAppQueryClient } from "./lib/query-client";
import { isWebStaff, isWebTeamLeader } from "./lib/staff";
import { ThemeProvider } from "./lib/theme";
import { ActivateAccountPage } from "./pages/ActivateAccountPage";
import { BroadcastNotificationsPage } from "./pages/BroadcastNotificationsPage";
import { CommissionGoalsPage } from "./pages/CommissionGoalsPage";
import { CommissionHubPage } from "./pages/CommissionHubPage";
import { CommissionTiersPage } from "./pages/CommissionTiersPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CustomerVisitsPage } from "./pages/CustomerVisitsPage";
import { DashboardHome } from "./pages/DashboardHome";
import { DashboardLayout } from "./pages/DashboardLayout";
import { ExpeditionPickPage } from "./pages/ExpeditionPickPage";
import { ExpeditionQueuePage } from "./pages/ExpeditionQueuePage";
import { FaturamentoPage } from "./pages/FaturamentoPage";
import { FirstAccessPage } from "./pages/FirstAccessPage";
import { FiscalAccountsPayablePage } from "./pages/FiscalAccountsPayablePage";
import { FiscalFixedExpensesPage } from "./pages/FiscalFixedExpensesPage";
import { FiscalHubPage } from "./pages/FiscalHubPage";
import { BankingIntegrationsPage } from "./pages/BankingIntegrationsPage";
import { BoletosPage } from "./pages/BoletosPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { GuidePage } from "./pages/GuidePage";
import { HelpPage } from "./pages/HelpPage";
import { InsightsPage } from "./pages/InsightsPage";
import { IndicatorsAiPage } from "./pages/IndicatorsAiPage";
import { LegalDocumentPage } from "./pages/LegalDocumentPage";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PaymentConditionsPage } from "./pages/PaymentConditionsPage";
import { PriceTablesPage } from "./pages/PriceTablesPage";
import { PriceTableDetailPage } from "./pages/PriceTableDetailPage";
import { ProductCategoriesPage } from "./pages/ProductCategoriesPage";
import { ProductFormPage } from "./pages/ProductFormPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ProductFeaturedPage } from "./pages/ProductFeaturedPage";
import { ProductPromotionsPage } from "./pages/ProductPromotionsPage";
import { PaymentPendingPage } from "./pages/PaymentPendingPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import { ReportCustomersPage } from "./pages/ReportCustomersPage";
import {
  ReportCommissionByOrderPage,
  ReportCommissionsPage,
  ReportInvoicedOrdersPage,
} from "./pages/ReportBillingCatalogPages";
import { ReportCommissionsPayablePage } from "./pages/ReportCommissionsPayablePage";
import {
  ReportCustomerAbcPage,
  ReportCustomerPositivacaoPage,
  ReportPortfolioBySellerPage,
  ReportPortfolioPage,
  ReportVisitsCheckinPage,
} from "./pages/ReportCustomerCatalogPages";
import { ReportOrderItemsPage } from "./pages/ReportOrderItemsPage";
import { ReportOrdersPage } from "./pages/ReportOrdersPage";
import {
  ReportProductPositivacaoPage,
  ReportTopProductsPage,
} from "./pages/ReportProductCatalogPages";
import {
  ReportSalesDetailedPage,
  ReportSalesSummaryPage,
  ReportSellerRankingPage,
} from "./pages/ReportSalesCatalogPages";
import { ReportFinancialResultPage } from "./pages/ReportFinancialResultPage";
import { ReportsHubPage } from "./pages/ReportsHubPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReportStockPage } from "./pages/ReportStockPage";
import { ReportStockCountPage } from "./pages/ReportStockCountPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { RouteRomaneioPage } from "./pages/RouteRomaneioPage";
import { SellerProductsPage } from "./pages/SellerProductsPage";
import { SellersPage } from "./pages/SellersPage";
import { SellerTrackingPage } from "./pages/SellerTrackingPage";
import { StockMovementsPage } from "./pages/StockMovementsPage";
import { StockPage } from "./pages/StockPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { SystemSettingsPage } from "./pages/SystemSettingsPage";
import { AccountSettingsPage } from "./pages/settings/AccountSettingsPage";
import { CustomerSettingsPage } from "./pages/settings/CustomerSettingsPage";
import { EstablishmentsSettingsPage } from "./pages/settings/EstablishmentsSettingsPage";
import { HomePanelSettingsPage } from "./pages/settings/HomePanelSettingsPage";
import { OrderFlowSettingsPage } from "./pages/settings/OrderFlowSettingsPage";
import { OrderSyncSettingsPage } from "./pages/settings/OrderSyncSettingsPage";
import { TeamsPage } from "./pages/TeamsPage";
import { UsersPage } from "./pages/UsersPage";

const qc = createAppQueryClient();

function SellerNotice() {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card shadow-sm">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 md:h-16 md:px-6">
          <AppLogo to="/login" />
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-background"
          >
            Sair
          </button>
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <p className="max-w-md text-center text-foreground">
          O painel web é para administradores, gestores e líderes de equipe.
          Vendedores devem usar o aplicativo mobile.
        </p>
      </div>
    </div>
  );
}

const TEAM_LEADER_ROUTE_PREFIXES = [
  "/",
  "/perfil",
  "/guia",
  "/ajuda",
  "/rastreio",
  "/visitas",
  "/pedidos",
  "/romaneio-rota",
  "/vendas",
  "/insights",
  "/relatorios",
  "/indicadores",
];

function TeamLeaderRouteGuard() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!isWebTeamLeader(user)) return <Outlet />;
  const allowed = TEAM_LEADER_ROUTE_PREFIXES.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
  );
  if (!allowed) return <Navigate to="/" replace />;
  return <Outlet />;
}

function LegacyVendasRedirect() {
  const { orderId } = useParams<{ orderId?: string }>();
  return <Navigate to={orderId ? `/pedidos/${orderId}` : "/pedidos"} replace />;
}

/** ADMIN/MANAGER: rota visível se canRead efetivo do recurso + feature do plano. */
function PermissionRouteGuard() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return <Navigate to="/login" replace />;

  const planFeature = planFeatureForPath(pathname);
  if (planFeature) {
    const hasFeature =
      user.subscription?.features?.includes(planFeature) ??
      planHasFeature(user.subscription?.planId, planFeature);
    if (!hasFeature) {
      return <PlanFeatureGate feature={planFeature} />;
    }
  }

  if (isWebTeamLeader(user) && user?.role === "SELLER") return <Outlet />;
  const resource = resourceForPath(pathname);
  if (!resource) return <Outlet />;
  if (canRead(user.role, resource, user.permissions)) return <Outlet />;
  return <Navigate to="/" replace />;
}

function StaffGate({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (
    user.accessStatus === "SUSPENDED" ||
    user.accessStatus === "CANCELED"
  ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Acesso indisponível</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {user.orgAccessMessage ||
            "O acesso desta organização está temporariamente indisponível. Entre em contato com o administrador da empresa."}
        </p>
        <button
          type="button"
          className="text-sm font-medium text-primary underline"
          onClick={() => logout()}
        >
          Sair
        </button>
      </div>
    );
  }
  if (user.accessStatus === "PENDING_PAYMENT") {
    return <Navigate to="/pagamento" replace />;
  }
  if (!isWebStaff(user)) {
    return <SellerNotice />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={
          !loading && user && isWebStaff(user) ? (
            <Navigate
              to={
                user.accessStatus === "PENDING_PAYMENT" ? "/pagamento" : "/"
              }
              replace
            />
          ) : (
            <PublicAuthLayout variant="login">
              <LoginPage />
            </PublicAuthLayout>
          )
        }
      />
      <Route path="/legal/:slug" element={<LegalDocumentPage />} />
      <Route path="/termos" element={<Navigate to="/legal/termos" replace />} />
      <Route
        path="/privacidade"
        element={<Navigate to="/legal/privacidade" replace />}
      />
      <Route
        path="/cadastro"
        element={
          !loading &&
          user?.role === "ADMIN" &&
          user.accessStatus !== "PENDING_PAYMENT" ? (
            <Navigate to="/" replace />
          ) : (
            <PublicAuthLayout variant="register">
              <RegisterPage />
            </PublicAuthLayout>
          )
        }
      />
      <Route
        path="/pagamento"
        element={
          loading ? (
            <div className="flex min-h-screen items-center justify-center text-muted-foreground">
              Carregando…
            </div>
          ) : (
            <PublicAuthLayout variant="register">
              <PaymentPendingPage />
            </PublicAuthLayout>
          )
        }
      />
      <Route
        path="/ativar-conta"
        element={
          <PublicAuthLayout variant="login">
            <ActivateAccountPage />
          </PublicAuthLayout>
        }
      />
      <Route
        path="/esqueci-senha"
        element={
          <PublicAuthLayout variant="login">
            <ForgotPasswordPage />
          </PublicAuthLayout>
        }
      />
      <Route
        path="/redefinir-senha"
        element={
          <PublicAuthLayout variant="login">
            <ResetPasswordPage />
          </PublicAuthLayout>
        }
      />
      <Route
        path="/primeiro-acesso"
        element={
          <StaffGate>
            <FirstAccessPage />
          </StaffGate>
        }
      />
      <Route
        path="/"
        element={
          <StaffGate>
            <DashboardLayout />
          </StaffGate>
        }
      >
        <Route element={<TeamLeaderRouteGuard />}>
          <Route element={<PermissionRouteGuard />}>
            <Route index element={<DashboardHome />} />
            <Route path="perfil" element={<ProfilePage />} />
            <Route path="guia" element={<GuidePage />} />
            <Route path="ajuda" element={<HelpPage />} />
            <Route path="tabelas-preco" element={<PriceTablesPage />} />
            <Route
              path="tabelas-preco/:tableId"
              element={<PriceTableDetailPage />}
            />
            <Route
              path="produtos/categorias"
              element={<ProductCategoriesPage />}
            />
            <Route path="produtos/novo" element={<ProductFormPage />} />
            <Route
              path="produtos/promocoes"
              element={<ProductPromotionsPage />}
            />
            <Route
              path="produtos/destaques"
              element={<ProductFeaturedPage />}
            />
            <Route
              path="produtos/:productId/editar"
              element={<ProductFormPage />}
            />
            <Route path="produtos" element={<ProductsPage />} />
            <Route path="estoque" element={<StockPage />} />
            <Route path="estoque/movimentos" element={<StockMovementsPage />} />
            <Route path="fornecedores" element={<SuppliersPage />} />
            <Route
              path="condicoes-pagamento"
              element={<PaymentConditionsPage />}
            />
            <Route path="financeiro" element={<FiscalHubPage />} />
            <Route
              path="financeiro/despesas-fixas"
              element={<FiscalFixedExpensesPage />}
            />
            <Route
              path="financeiro/contas-a-pagar"
              element={<FiscalAccountsPayablePage />}
            />
            <Route
              path="financeiro/integracoes-bancarias"
              element={<BankingIntegrationsPage />}
            />
            <Route path="emissao-boletos" element={<BoletosPage />} />
            <Route
              path="financeiro/boletos"
              element={<Navigate to="/emissao-boletos" replace />}
            />
            <Route path="faturamento" element={<FaturamentoPage />} />
            <Route
              path="faturamento/xml"
              element={<Navigate to="/faturamento" replace />}
            />
            <Route
              path="fiscal"
              element={<Navigate to="/financeiro" replace />}
            />
            <Route
              path="fiscal/despesas-fixas"
              element={<Navigate to="/financeiro/despesas-fixas" replace />}
            />
            <Route
              path="fiscal/contas-a-pagar"
              element={<Navigate to="/financeiro/contas-a-pagar" replace />}
            />
            <Route
              path="fiscal/xml"
              element={<Navigate to="/faturamento" replace />}
            />
            <Route path="comissao" element={<CommissionHubPage />} />
            <Route path="comissao/faixas" element={<CommissionTiersPage />} />
            <Route path="comissao/metas" element={<CommissionGoalsPage />} />
            <Route path="vendedores" element={<SellersPage />} />
            <Route
              path="vendedores/:sellerId/produtos"
              element={<SellerProductsPage />}
            />
            <Route
              path="notificar-vendedores"
              element={<BroadcastNotificationsPage />}
            />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="equipes" element={<TeamsPage />} />
            <Route path="clientes" element={<CustomersPage />} />
            <Route path="notificacoes" element={<NotificationsPage />} />
            <Route
              path="permissoes"
              element={
                <Navigate to="/configuracoes?abrir=permissoes" replace />
              }
            />
            <Route
              path="auditoria"
              element={<Navigate to="/configuracoes?abrir=auditoria" replace />}
            />
            <Route path="configuracoes" element={<SystemSettingsPage />} />
            <Route
              path="configuracoes/conta"
              element={<AccountSettingsPage />}
            />
            <Route
              path="configuracoes/estabelecimentos"
              element={<EstablishmentsSettingsPage />}
            />
            <Route
              path="configuracoes/pedidos-sincronizacao"
              element={<OrderSyncSettingsPage />}
            />
            <Route
              path="configuracoes/fluxo-pedido"
              element={<OrderFlowSettingsPage />}
            />
            <Route
              path="configuracoes/clientes"
              element={<CustomerSettingsPage />}
            />
            <Route
              path="configuracoes/painel"
              element={<HomePanelSettingsPage />}
            />
            <Route path="relatorios" element={<ReportsHubPage />} />
            <Route
              path="relatorios/clientes"
              element={<ReportCustomersPage />}
            />
            <Route
              path="relatorios/clientes/carteira"
              element={<ReportPortfolioPage />}
            />
            <Route
              path="relatorios/clientes/carteira-vendedor"
              element={<ReportPortfolioBySellerPage />}
            />
            <Route
              path="relatorios/clientes/positivacao"
              element={<ReportCustomerPositivacaoPage />}
            />
            <Route
              path="relatorios/clientes/abc"
              element={<ReportCustomerAbcPage />}
            />
            <Route
              path="relatorios/clientes/visitas"
              element={<ReportVisitsCheckinPage />}
            />
            <Route path="relatorios/pedidos" element={<ReportOrdersPage />} />
            <Route path="relatorios/itens" element={<ReportOrderItemsPage />} />
            <Route path="relatorios/estoque" element={<ReportStockPage />} />
            <Route
              path="relatorios/estoque/contagem"
              element={<ReportStockCountPage />}
            />
            <Route
              path="relatorios/vendas/resumo"
              element={<ReportSalesSummaryPage />}
            />
            <Route
              path="relatorios/vendas/resultado-financeiro"
              element={<ReportFinancialResultPage />}
            />
            <Route
              path="relatorios/vendas/detalhadas"
              element={<ReportSalesDetailedPage />}
            />
            <Route
              path="relatorios/vendas/ranking"
              element={<ReportSellerRankingPage />}
            />
            <Route
              path="relatorios/produtos/mais-vendidos"
              element={<ReportTopProductsPage />}
            />
            <Route
              path="relatorios/produtos/positivacao"
              element={<ReportProductPositivacaoPage />}
            />
            <Route
              path="relatorios/faturamento/pedidos"
              element={<ReportInvoicedOrdersPage />}
            />
            <Route
              path="relatorios/comissoes"
              element={<ReportCommissionsPage />}
            />
            <Route
              path="relatorios/comissoes/por-pedido"
              element={<ReportCommissionByOrderPage />}
            />
            <Route
              path="relatorios/comissoes/a-pagar"
              element={<ReportCommissionsPayablePage />}
            />
            <Route path="relatorios/gestao" element={<ReportsPage />} />
            <Route path="visitas" element={<CustomerVisitsPage />} />
            <Route path="rastreio" element={<SellerTrackingPage />} />
            <Route path="pedidos" element={<OrdersPage />} />
            <Route path="pedidos/:orderId" element={<OrderDetailPage />} />
            <Route path="romaneio-rota" element={<RouteRomaneioPage />} />
            <Route path="expedicao" element={<ExpeditionQueuePage />} />
            <Route path="expedicao/:orderId" element={<ExpeditionPickPage />} />
            <Route path="vendas" element={<LegacyVendasRedirect />} />
            <Route path="vendas/:orderId" element={<LegacyVendasRedirect />} />
            <Route path="insights" element={<InsightsPage />} />
            <Route path="indicadores/ia" element={<IndicatorsAiPage />} />
            <Route
              path="indicadores"
              element={<Navigate to="/relatorios" replace />}
            />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <AppNotificationsProvider>
          <BrowserRouter>
            <AuthProvider>
              <ConfirmProvider>
                <AppRoutes />
              </ConfirmProvider>
            </AuthProvider>
          </BrowserRouter>
        </AppNotificationsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
