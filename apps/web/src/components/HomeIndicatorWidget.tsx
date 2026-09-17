import { DatePicker } from "@/components/ui/date-picker";
import { apiFetch } from "@/lib/api";
import {
    CUSTOM_PERIOD_LABEL,
    PERIOD_PRESET_LABELS,
    periodRange,
    periodRangeYmd,
    validateCustomPeriod,
    ymdToIsoRange,
    type PeriodMode,
    type PeriodPreset,
} from "@/lib/period-presets";
import { cn } from "@/lib/utils";
import {
    HOME_INDICATOR_SHORT_LABELS,
    type HomeChartIndicatorKey,
} from "@pedidos/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

export type HomeIndicatorSummary = {
  key: HomeChartIndicatorKey;
  period: { from: string; to: string };
  metric: "sales" | "profit";
  totals: {
    totalAmount: number;
    orderCount: number;
    linesMissingCost?: number;
  };
  rows: Array<{
    id: string;
    label: string;
    value: number;
    secondary?: number;
    orderCount?: number;
  }>;
};

function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PRESETS: PeriodPreset[] = [
  "this_month",
  "last_month",
  "last_7_days",
  "last_90_days",
];

const EMPTY_HINT: Record<HomeChartIndicatorKey, string> = {
  sales_by_supplier: "Nenhuma venda com fornecedor no período.",
  sales_by_seller: "Nenhuma venda por vendedor no período.",
  profit_by_city: "Nenhuma rentabilidade por cidade no período.",
  profit_by_product: "Nenhum produto com rentabilidade no período.",
  profit_by_customer: "Nenhum cliente com rentabilidade no período.",
};

type Props = {
  indicatorKey: HomeChartIndicatorKey;
  /** Layout compacto para a coluna de widgets da home. */
  compact?: boolean;
  /** Filtro opcional por estabelecimento (consolidado = omitir). */
  establishmentId?: string | null;
};

export function HomeIndicatorWidget({
  indicatorKey,
  compact = false,
  establishmentId = null,
}: Props) {
  const [mode, setMode] = useState<PeriodMode>("this_month");
  const [customFrom, setCustomFrom] = useState(
    () => periodRangeYmd("this_month").from,
  );
  const [customTo, setCustomTo] = useState(
    () => periodRangeYmd("this_month").to,
  );

  const customError =
    mode === "custom" ? validateCustomPeriod(customFrom, customTo) : null;

  const range = useMemo(() => {
    if (mode === "custom") {
      if (customError) return null;
      return ymdToIsoRange(customFrom, customTo);
    }
    return periodRange(mode);
  }, [mode, customFrom, customTo, customError]);

  const q = useQuery({
    queryKey: [
      "admin",
      "home-indicator",
      indicatorKey,
      range?.from ?? "",
      range?.to ?? "",
      establishmentId ?? "",
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        key: indicatorKey,
        from: range!.from,
        to: range!.to,
        limit: "5",
      });
      if (establishmentId) params.set("establishmentId", establishmentId);
      return apiFetch<HomeIndicatorSummary>(
        `/admin/reports/home-indicator?${params}`,
      );
    },
    enabled: range != null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  function selectPreset(p: PeriodPreset) {
    setMode(p);
  }

  function selectCustom() {
    if (mode !== "custom") {
      const ymd = periodRangeYmd(mode);
      setCustomFrom(ymd.from);
      setCustomTo(ymd.to);
    }
    setMode("custom");
  }

  const isRefetching = q.isFetching && !q.isLoading;
  const isProfit =
    (q.data?.metric ?? indicatorKey.startsWith("profit_")) === "profit";
  const valueLabel = isProfit ? "Margem" : "Vendas";

  /** Truncagem para o eixo (tooltip usa `fullName`). Compact = coluna estreita da home. */
  const maxLabelChars = compact ? 14 : 22;
  const data = (q.data?.rows ?? []).map((s) => ({
    name:
      s.label.length > maxLabelChars
        ? `${s.label.slice(0, maxLabelChars - 1)}…`
        : s.label,
    fullName: s.label,
    total: Math.round(s.value * 100) / 100,
    orders: s.orderCount ?? 0,
    marginPct: s.secondary,
  }));

  const subtitleParts: string[] = [];
  if (q.data) {
    subtitleParts.push(
      `${fmtMoney(q.data.totals.totalAmount)} em ${q.data.totals.orderCount} pedido(s)`,
    );
    if (
      isProfit &&
      q.data.totals.linesMissingCost != null &&
      q.data.totals.linesMissingCost > 0
    ) {
      subtitleParts.push(
        `${q.data.totals.linesMissingCost} linha(s) sem custo cadastrado`,
      );
    }
  }

  const pillClass = (active: boolean) =>
    cn(
      "glass-chip transition-colors",
      compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs",
      active && "glass-chip-active",
    );

  return (
    <section
      className={cn(
        "surface-card-glass h-full p-4",
        compact ? "sm:p-4" : "mt-6 sm:p-6",
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-3",
          !compact && "sm:flex-row sm:items-start sm:justify-between",
        )}
      >
        <div className="min-w-0">
          <h2
            className={cn(
              "font-semibold text-foreground",
              compact ? "text-sm leading-snug" : "text-lg",
            )}
          >
            {HOME_INDICATOR_SHORT_LABELS[indicatorKey]}
          </h2>
          <p
            className={cn(
              "mt-1 text-muted-foreground",
              compact ? "line-clamp-2 text-xs" : "text-sm",
            )}
          >
            {compact
              ? (subtitleParts[0] ??
                (isProfit ? "Margem no período" : "Vendas no período"))
              : `${
                  isProfit
                    ? "Margem (receita − custo do produto) no período"
                    : "Vendas confirmadas no período"
                }${subtitleParts.length > 0 ? ` · ${subtitleParts.join(" · ")}` : ""}`}
          </p>
        </div>
        <div className={cn("flex flex-wrap gap-1.5", !compact && "gap-2")}>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => selectPreset(p)}
              className={pillClass(mode === p)}
            >
              {PERIOD_PRESET_LABELS[p]}
            </button>
          ))}
          <button
            type="button"
            onClick={selectCustom}
            className={pillClass(mode === "custom")}
          >
            {CUSTOM_PERIOD_LABEL}
          </button>
        </div>
      </div>

      {mode === "custom" ? (
        <div
          className={cn(
            "mt-3 flex flex-col gap-2",
            compact ? "gap-1.5" : "sm:flex-row sm:flex-wrap sm:items-center",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker
              value={customFrom}
              onChange={setCustomFrom}
              placeholder="De"
              className={cn(compact ? "h-8 w-[9.5rem] text-xs" : "w-[11rem]")}
              max={customTo || undefined}
            />
            <span className="text-xs text-muted-foreground">até</span>
            <DatePicker
              value={customTo}
              onChange={setCustomTo}
              placeholder="Até"
              className={cn(compact ? "h-8 w-[9.5rem] text-xs" : "w-[11rem]")}
              min={customFrom || undefined}
            />
          </div>
          {customError ? (
            <p className="text-xs text-destructive" role="alert">
              {customError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn("relative w-full", compact ? "mt-3 h-48" : "mt-6 h-64")}
      >
        {customError ? (
          <p className="text-sm text-muted-foreground">
            Ajuste o período para carregar o gráfico.
          </p>
        ) : q.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="sr-only">Carregando gráfico…</span>
          </div>
        ) : q.error ? (
          <p className="text-sm text-destructive">
            {(q.error as Error).message}
          </p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {EMPTY_HINT[indicatorKey]}
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              {/* Barras horizontais: nomes de categoria legíveis na coluna estreita da home. */}
              <BarChart
                layout="vertical"
                data={data}
                margin={{
                  top: 4,
                  right: compact ? 8 : 12,
                  left: 4,
                  bottom: 4,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{
                    fontSize: compact ? 10 : 12,
                    fill: "var(--muted-foreground)",
                  }}
                  tickFormatter={(v: number) =>
                    v >= 1000 || v <= -1000
                      ? `${(v / 1000).toFixed(1)}k`
                      : String(v)
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={compact ? 88 : 120}
                  interval={0}
                  tick={{
                    fontSize: compact ? 10 : 12,
                    fill: "var(--muted-foreground)",
                  }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value, _name, item) => {
                    const row = item?.payload as
                      | { marginPct?: number }
                      | undefined;
                    const money = fmtMoney(Number(value ?? 0));
                    if (isProfit && row?.marginPct != null) {
                      return [
                        `${money} (${row.marginPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`,
                        valueLabel,
                      ];
                    }
                    return [money, valueLabel];
                  }}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as
                      | { fullName?: string }
                      | undefined;
                    return row?.fullName ?? "";
                  }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--foreground)",
                  }}
                />
                <Bar
                  dataKey="total"
                  name={valueLabel}
                  fill="var(--sidebar-primary)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            {isRefetching ? (
              <div
                className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60 backdrop-blur-[1px]"
                aria-busy
                aria-label="Atualizando gráfico"
              >
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
