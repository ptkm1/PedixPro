import type { User } from "@/auth/AuthContext";
import {
    canRead,
    planHasFeature,
    type PermissionResource,
    type PlanFeature,
} from "@pedidos/shared";
import type { LucideIcon } from "lucide-react";
import {
    BarChart3,
    Bell,
    ClipboardList,
    FileText,
    LayoutDashboard,
    MapPin,
    Navigation,
    Package,
    PackageCheck,
    Receipt,
    Settings,
    ShoppingCart,
    Sparkles,
    Truck,
    UserCircle,
    UserCog,
    Users,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  icon: LucideIcon;
  resource: PermissionResource;
  /** Feature de plano SaaS (além do RBAC). */
  planFeature?: PlanFeature;
};

/** Rota fixa no rodapé da sidebar (fora do drag-and-drop). */
export const SETTINGS_NAV_TO = "/configuracoes";

export function splitMainAndSettingsNav(items: NavItem[]): {
  main: NavItem[];
  settings: NavItem | null;
} {
  const settings = items.find((item) => item.to === SETTINGS_NAV_TO) ?? null;
  const main = items.filter((item) => item.to !== SETTINGS_NAV_TO);
  return { main, settings };
}

const home: NavItem = {
  to: "/",
  label: "Início",
  end: true,
  icon: LayoutDashboard,
  resource: "dashboard",
};

/** Catálogo completo (admin); filtrado por `canRead` efetivo. */
export const DASHBOARD_NAV: NavItem[] = [
  home,
  { to: "/produtos", label: "Produtos", icon: Package, resource: "products" },
  {
    to: "/fornecedores",
    label: "Fornecedores",
    icon: Truck,
    resource: "suppliers",
  },
  { to: "/vendedores", label: "Vendedores", icon: Users, resource: "sellers" },
  {
    to: "/notificar-vendedores",
    label: "Notificar vendedores",
    icon: Bell,
    resource: "broadcast",
    planFeature: "broadcast",
  },
  { to: "/usuarios", label: "Usuários", icon: UserCog, resource: "users" },
  {
    to: "/clientes",
    label: "Clientes",
    icon: UserCircle,
    resource: "customers",
  },
  {
    to: "/visitas",
    label: "Visitas em campo",
    icon: MapPin,
    resource: "visits",
    planFeature: "visits",
  },
  { to: "/pedidos", label: "Pedidos", icon: ShoppingCart, resource: "orders" },
  {
    to: "/romaneio-rota",
    label: "Romaneio de rota",
    icon: ClipboardList,
    resource: "orders",
  },
  {
    to: "/expedicao",
    label: "Expedição",
    icon: PackageCheck,
    resource: "expedition",
    planFeature: "expedition",
  },
  {
    to: "/financeiro",
    label: "Financeiro",
    icon: Receipt,
    resource: "fiscal",
  },
  {
    to: "/faturamento",
    label: "Faturamento",
    icon: FileText,
    resource: "fiscal",
    planFeature: "fiscal_nfe",
  },
  {
    to: "/emissao-boletos",
    label: "Boletos",
    icon: Receipt,
    resource: "boletos",
  },
  {
    to: "/relatorios",
    label: "Relatórios",
    icon: BarChart3,
    resource: "reports",
  },
  {
    to: "/indicadores/ia",
    label: "Indicadores IA",
    icon: Sparkles,
    resource: "reports",
    planFeature: "reports_ai",
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    resource: "permissions",
  },
];

export const TEAM_LEADER_NAV: NavItem[] = [
  home,
  {
    to: "/rastreio",
    label: "Localização em tempo real",
    icon: Navigation,
    resource: "tracking",
    planFeature: "tracking",
  },
  {
    to: "/visitas",
    label: "Visitas em campo",
    icon: MapPin,
    resource: "visits",
    planFeature: "visits",
  },
  { to: "/pedidos", label: "Pedidos", icon: ShoppingCart, resource: "orders" },
  {
    to: "/romaneio-rota",
    label: "Romaneio de rota",
    icon: ClipboardList,
    resource: "orders",
  },
  {
    to: "/relatorios",
    label: "Relatórios",
    icon: BarChart3,
    resource: "reports",
    planFeature: "insights",
  },
];

/** Prefixo de rota → recurso da matriz (para guards). */
export function resourceForPath(pathname: string): PermissionResource | null {
  if (pathname === "/" || pathname === "") return "dashboard";
  if (pathname.startsWith("/tabelas-preco")) return "price_tables";
  if (pathname.startsWith("/produtos")) return "products";
  if (pathname.startsWith("/fornecedores")) return "suppliers";
  if (pathname.startsWith("/condicoes-pagamento")) return "orders";
  if (pathname.startsWith("/estoque")) return "stock";
  if (pathname.startsWith("/vendedores")) return "sellers";
  if (pathname.startsWith("/notificar-vendedores")) return "broadcast";
  if (pathname.startsWith("/usuarios")) return "users";
  if (pathname.startsWith("/equipes")) return "teams";
  if (pathname.startsWith("/comissao")) return "commissions";
  if (pathname.startsWith("/clientes") || pathname.startsWith("/notificacoes"))
    return "customers";
  if (pathname.startsWith("/visitas")) return "visits";
  if (pathname.startsWith("/rastreio")) return "tracking";
  if (pathname.startsWith("/pedidos") || pathname.startsWith("/vendas"))
    return "orders";
  if (pathname.startsWith("/romaneio-rota")) return "orders";
  if (pathname.startsWith("/expedicao")) return "expedition";
  if (
    pathname.startsWith("/emissao-boletos") ||
    pathname.startsWith("/financeiro/boletos")
  )
    return "boletos";
  if (
    pathname.startsWith("/financeiro") ||
    pathname.startsWith("/fiscal") ||
    pathname.startsWith("/faturamento")
  )
    return "fiscal";
  if (
    pathname.startsWith("/relatorios") ||
    pathname.startsWith("/insights") ||
    pathname.startsWith("/indicadores")
  )
    return "reports";
  if (pathname.startsWith("/configuracoes")) return null;
  if (pathname.startsWith("/permissoes")) return "permissions";
  if (pathname.startsWith("/auditoria")) return "audit";
  if (pathname.startsWith("/guia") || pathname.startsWith("/ajuda")) return null;
  return null;
}

function userHasPlanFeature(
  user: Pick<User, "subscription"> | null | undefined,
  feature: PlanFeature | undefined,
): boolean {
  if (!feature) return true;
  const planId = user?.subscription?.planId;
  if (user?.subscription?.features?.length) {
    return user.subscription.features.includes(feature);
  }
  return planHasFeature(planId, feature);
}

export function navForRole(
  user:
    | Pick<User, "role" | "isTeamLeader" | "permissions" | "subscription">
    | null
    | undefined,
): NavItem[] {
  if (user?.isTeamLeader && user.role === "SELLER") {
    return TEAM_LEADER_NAV.filter((item) =>
      userHasPlanFeature(user, item.planFeature),
    );
  }
  if (!user) return [];

  return DASHBOARD_NAV.filter((item) => {
    if (!userHasPlanFeature(user, item.planFeature)) return false;
    if (item.to === "/indicadores/ia") {
      return user.role === "ADMIN";
    }
    if (item.to === "/configuracoes") {
      return (
        user.role === "ADMIN" ||
        canRead(user.role, "permissions", user.permissions) ||
        canRead(user.role, "audit", user.permissions)
      );
    }
    return canRead(user.role, item.resource, user.permissions);
  });
}

/** Features de plano para rotas fora do sidebar (acesso via outras páginas). */
const OFF_NAV_PLAN_FEATURES: { prefix: string; feature: PlanFeature }[] = [
  { prefix: "/tabelas-preco", feature: "price_tables" },
  { prefix: "/comissao", feature: "commissions" },
  { prefix: "/equipes", feature: "teams" },
  { prefix: "/rastreio", feature: "tracking" },
  { prefix: "/relatorios/comissoes", feature: "commissions" },
  { prefix: "/relatorios/clientes/visitas", feature: "visits" },
  { prefix: "/relatorios/faturamento", feature: "fiscal_nfe" },
  { prefix: "/relatorios/vendas/resumo", feature: "reports_advanced" },
  { prefix: "/relatorios/vendas/ranking", feature: "reports_advanced" },
  { prefix: "/relatorios/vendas/resultado-financeiro", feature: "reports_advanced" },
  { prefix: "/relatorios/clientes/carteira", feature: "reports_advanced" },
  { prefix: "/relatorios/clientes/carteira-vendedor", feature: "reports_advanced" },
  { prefix: "/relatorios/clientes/positivacao", feature: "reports_advanced" },
  { prefix: "/relatorios/clientes/abc", feature: "reports_advanced" },
  { prefix: "/relatorios/produtos/mais-vendidos", feature: "reports_advanced" },
  { prefix: "/relatorios/produtos/positivacao", feature: "reports_advanced" },
  { prefix: "/relatorios/gestao", feature: "reports_advanced" },
];

export function planFeatureForPath(pathname: string): PlanFeature | null {
  if (pathname === "/insights" || pathname.startsWith("/insights/")) {
    return "insights";
  }
  if (
    pathname === "/indicadores/ia" ||
    pathname.startsWith("/indicadores/ia/")
  ) {
    return "reports_ai";
  }
  // Prefixos mais específicos (relatórios avançados) antes do item «Relatórios».
  const offNav = OFF_NAV_PLAN_FEATURES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  if (offNav) return offNav.feature;
  const item = [...DASHBOARD_NAV, ...TEAM_LEADER_NAV].find((nav) => {
    if (nav.end) return pathname === nav.to;
    return pathname === nav.to || pathname.startsWith(`${nav.to}/`);
  });
  return item?.planFeature ?? null;
}
