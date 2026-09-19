import { useAuth } from "@/auth/AuthContext";
import { canRead, planHasFeature, type PlanFeature } from "@pedidos/shared";
import {
    BarChart3,
    ClipboardList,
    Lightbulb,
    Package,
    Percent,
    Receipt,
    Users,
    type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

type ReportLink = {
  to: string;
  title: string;
  description: string;
  planFeature?: PlanFeature;
};

type ReportCategory = {
  id: string;
  title: string;
  icon: LucideIcon;
  items: ReportLink[];
};

const CATEGORIES: ReportCategory[] = [
  {
    id: "insights",
    title: "Insights",
    icon: Lightbulb,
    items: [
      {
        to: "/insights",
        title: "Insights",
        description:
          "Painel analítico do dia a dia: totais, ranking, carteira e giro.",
        planFeature: "insights",
      },
    ],
  },
  {
    id: "vendas",
    title: "Vendas",
    icon: BarChart3,
    items: [
      {
        to: "/relatorios/vendas/resumo",
        title: "Resumo de vendas",
        description: "Totais, ticket médio e ranking no período.",
        planFeature: "reports_advanced",
      },
      {
        to: "/relatorios/vendas/resultado-financeiro",
        title: "Resultado financeiro",
        description:
          "Faturamento, custos, comissões e lucro das vendas no período.",
        planFeature: "reports_advanced",
      },
      {
        to: "/relatorios/vendas/detalhadas",
        title: "Vendas detalhadas",
        description: "PDF com pedidos confirmados e itens.",
      },
      {
        to: "/relatorios/vendas/ranking",
        title: "Ranking de vendedor / Meta",
        description: "Ranking de vendas e progresso das metas.",
        planFeature: "reports_advanced",
      },
      {
        to: "/relatorios/pedidos",
        title: "Pedidos / Romaneio",
        description: "Lista de pedidos ou romaneio detalhado em PDF.",
      },
      {
        to: "/relatorios/itens",
        title: "Itens de pedidos",
        description: "Linhas vendidas com código, preços e totais.",
      },
    ],
  },
  {
    id: "clientes",
    title: "Clientes",
    icon: Users,
    items: [
      {
        to: "/relatorios/clientes",
        title: "Clientes",
        description: "Lista com documento, cidade, vendedor e crédito.",
      },
      {
        to: "/relatorios/clientes/carteira",
        title: "Situação da carteira de clientes",
        description: "Aging de crédito e clientes em risco.",
        planFeature: "reports_advanced",
      },
      {
        to: "/relatorios/clientes/carteira-vendedor",
        title: "Carteira por vendedor",
        description: "Crédito em aberto e inadimplência por vendedor.",
        planFeature: "reports_advanced",
      },
      {
        to: "/relatorios/clientes/positivacao",
        title: "Positivação de clientes",
        description: "Quem comprou (e quem não) no período.",
        planFeature: "reports_advanced",
      },
      {
        to: "/relatorios/clientes/abc",
        title: "Curva ABC de clientes",
        description: "Classificação A/B/C por faturamento.",
        planFeature: "reports_advanced",
      },
      {
        to: "/relatorios/clientes/visitas",
        title: "Visitas com check-in",
        description: "Visitas registradas e conversão em venda.",
        planFeature: "visits",
      },
    ],
  },
  {
    id: "produtos",
    title: "Produtos",
    icon: Package,
    items: [
      {
        to: "/relatorios/produtos/mais-vendidos",
        title: "Produtos mais vendidos",
        description: "Ranking por quantidade e faturamento.",
        planFeature: "reports_advanced",
      },
      {
        to: "/relatorios/produtos/positivacao",
        title: "Positivação de produtos por cliente",
        description: "Produtos comprados por cada cliente.",
        planFeature: "reports_advanced",
      },
      {
        to: "/relatorios/estoque",
        title: "Estoque",
        description: "Saldos, grupos e fornecedores.",
      },
      {
        to: "/relatorios/estoque/contagem",
        title: "Lista para Contagem de Estoque",
        description: "PDF para contagem física com espaço para anotar quantidades.",
      },
    ],
  },
  {
    id: "faturamento",
    title: "Faturamento",
    icon: Receipt,
    items: [
      {
        to: "/relatorios/faturamento/pedidos",
        title: "Pedidos faturados",
        description: "NF-e autorizadas vinculadas a pedidos.",
        planFeature: "fiscal_nfe",
      },
      {
        to: "/romaneio-rota",
        title: "Romaneio de rota",
        description: "Documento A4 para conferência da carga.",
      },
    ],
  },
  {
    id: "comissoes",
    title: "Comissões",
    icon: Percent,
    items: [
      {
        to: "/relatorios/comissoes",
        title: "Relatório de comissões",
        description: "Extrato mensal por vendedor com metas.",
        planFeature: "commissions",
      },
      {
        to: "/relatorios/comissoes/por-pedido",
        title: "Comissões por pedido",
        description: "Comissão acumulada em cada pedido.",
        planFeature: "commissions",
      },
    ],
  },
];

function userHasPlanFeature(
  user: ReturnType<typeof useAuth>["user"],
  feature: PlanFeature | undefined,
): boolean {
  if (!feature) return true;
  const planId = user?.subscription?.planId;
  if (user?.subscription?.features?.length) {
    return user.subscription.features.includes(feature);
  }
  return planHasFeature(planId, feature);
}

export function ReportsHubPage() {
  const { user } = useAuth();
  const canReports = Boolean(
    user && canRead(user.role, "reports", user.permissions),
  );

  if (!canReports) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para acessar relatórios.
        </p>
      </div>
    );
  }

  const categories = CATEGORIES.map((cat) => ({
    ...cat,
    items: cat.items.filter((item) =>
      userHasPlanFeature(user, item.planFeature),
    ),
  })).filter((cat) => cat.items.length > 0);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <nav className="text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Início
          </Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground">Relatórios</span>
        </nav>
        <h1 className="text-2xl font-semibold text-foreground">Relatórios</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Insights e relatórios por categoria
          {userHasPlanFeature(user, "reports_advanced") ? (
            <>
              . Painel gerencial em{" "}
              <Link
                to="/relatorios/gestao"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Gestão
              </Link>
            </>
          ) : null}
          .
        </p>
      </div>

      {categories.map((cat) => {
        const Icon = cat.icon;
        return (
          <section key={cat.id} className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {cat.title}
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cat.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group surface-card-glass flex gap-3 p-4 transition hover:border-primary/40 hover:shadow-md"
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
