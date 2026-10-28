import { useAuth } from "@/auth/AuthContext";
import { HomeDashboardLayout } from "@/components/home/HomeDashboardLayout";
import { HomeSideWidgets } from "@/components/home/HomeSideWidgets";
import { HomeSlot } from "@/components/home/HomeSlot";
import { SalesMonthAreaChart } from "@/components/home/SalesMonthAreaChart";
import { RecentSalesList } from "@/components/RecentSalesList";
import { apiFetch } from "@/lib/api";
import { periodRange } from "@/lib/period-presets";
import { isWebTeamLeader } from "@/lib/staff";
import {
  parseHomeIndicators,
  type HomeIndicatorKey,
} from "@pedidos/shared";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

type ScorecardTotals = {
  totals: { orderCount: number; totalAmount: number; avgTicket: number };
  daily: Array<{ date: string; orderCount: number; totalAmount: number }>;
};

type HomeDashboardConfig = {
  homeIndicators: HomeIndicatorKey[];
};

export function DashboardHome() {
  const { user } = useAuth();
  const teamLeader = isWebTeamLeader(user);

  const {
    data: recentOrders = [],
    isLoading: recentOrdersLoading,
    isFetching: recentOrdersFetching,
  } = useQuery({
    queryKey: ["admin", "orders", "recent"],
    queryFn: () =>
      apiFetch<
        {
          id: string;
          orderNumber?: number | null;
          status: string;
          totalAmount: unknown;
          createdAt: string;
          paymentCondition?: {
            id: string;
            name: string;
            days: number;
            sortOrder: number;
          } | null;
          seller: { user: { name: string } };
          customer: {
            name: string;
            city?: string | null;
            tradeName?: string | null;
          } | null;
          items: { id: string }[];
        }[]
      >("/admin/orders"),
    staleTime: 30_000,
  });

  const monthRange = periodRange("this_month");
  const { data: scorecard, isLoading: scorecardLoading } = useQuery({
    queryKey: ["admin", "reports", "scorecard", "dashboard", monthRange.from],
    queryFn: () =>
      apiFetch<ScorecardTotals>(
        `/admin/reports/scorecard?from=${encodeURIComponent(monthRange.from)}&to=${encodeURIComponent(monthRange.to)}`,
      ),
    staleTime: 60_000,
  });

  const { data: homeConfig } = useQuery({
    queryKey: ["admin", "reports", "home-dashboard-config"],
    queryFn: () =>
      apiFetch<HomeDashboardConfig>("/admin/reports/home-dashboard-config"),
    staleTime: 60_000,
  });

  const { data: pendingRelease } = useQuery({
    queryKey: ["admin", "pending-release-summary"],
    queryFn: () =>
      apiFetch<{ count: number }>("/admin/orders/pending-release-summary"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const sideIndicatorKeys = useMemo(() => {
    const keys = parseHomeIndicators(homeConfig?.homeIndicators);
    if (!teamLeader) return keys;
    // Líderes não têm indicadores de rentabilidade (API 403).
    return keys.filter((k) => !k.startsWith("profit_"));
  }, [homeConfig?.homeIndicators, teamLeader]);

  const pendingCount = pendingRelease?.count ?? 0;

  const kpis = (
    <>
      <HomeSlot label="KPI 1" minHeightClassName="min-h-[6.5rem]">
        <Link
          to="/liberacao-pedidos"
          className="flex flex-1 flex-col justify-center p-4 transition-colors hover:bg-muted/40"
        >
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ClipboardCheck className="size-3.5" />
            Liberação de Pedidos
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {pendingCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {pendingCount === 1
              ? "pedido aguardando liberação"
              : "pedidos aguardando liberação"}
          </p>
        </Link>
      </HomeSlot>
      <HomeSlot label="KPI 2" minHeightClassName="min-h-[6.5rem]">
        <div className="flex flex-1 flex-col justify-center p-4">
          <p className="text-sm text-muted-foreground">Faturamento do mês</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {scorecardLoading
              ? "…"
              : `R$ ${(scorecard?.totals.totalAmount ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          </p>
        </div>
      </HomeSlot>
      <HomeSlot label="KPI 3" minHeightClassName="min-h-[6.5rem]">
        <div className="flex flex-1 flex-col justify-center p-4">
          <p className="text-sm text-muted-foreground">Pedidos confirmados</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {scorecardLoading ? "…" : String(scorecard?.totals.orderCount ?? 0)}
          </p>
          <Link
            to="/relatorios"
            className="mt-2 inline-block text-xs text-primary hover:underline"
          >
            Ver relatórios completos
          </Link>
        </div>
      </HomeSlot>
    </>
  );

  return (
    <HomeDashboardLayout
      kpis={kpis}
      mainChart={
        <HomeSlot
          label="Gráfico principal"
          minHeightClassName="min-h-[18rem]"
          className="overflow-hidden"
        >
          <SalesMonthAreaChart
            daily={scorecard?.daily ?? []}
            from={monthRange.from}
            to={monthRange.to}
            isLoading={scorecardLoading}
          />
        </HomeSlot>
      }
      ordersList={
        <div className="[&>section]:mt-0">
          <RecentSalesList
            orders={recentOrders}
            isLoading={recentOrdersLoading}
            isFetching={recentOrdersFetching}
          />
        </div>
      }
      sideWidgets={<HomeSideWidgets indicatorKeys={sideIndicatorKeys} />}
    />
  );
}
