import type { ApexOptions } from "apexcharts";
import { apiFetch } from "@/lib/api";
import { periodRange } from "@/lib/period-presets";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Chart from "react-apexcharts";
import { Link } from "react-router-dom";
import "apexcharts/dist/apexcharts.css";

type PositivacaoSummary = {
  period: { from: string; to: string };
  totals: {
    customerCount: number;
    positivados: number;
    semPositivacao: number;
    positivacaoPct: number;
    totalAmount: number;
  };
  categories: {
    novos: number;
    ativos: number;
    inativosRecentes: number;
    inativosAntigos: number;
  };
};

type ThemeColors = {
  chart1: string;
  chart2: string;
  chart4: string;
  chart5: string;
  muted: string;
  foreground: string;
  isDark: boolean;
};

const CATEGORY_LABELS = [
  "Novos",
  "Ativos",
  "Inativos recentes",
  "Inativos antigos",
] as const;

function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  return {
    chart1: style.getPropertyValue("--chart-1").trim() || "#02445c",
    chart2: style.getPropertyValue("--chart-2").trim() || "#1e6b7a",
    chart4: style.getPropertyValue("--chart-4").trim() || "#0d9488",
    chart5: style.getPropertyValue("--chart-5").trim() || "#f59e0b",
    muted: style.getPropertyValue("--muted-foreground").trim() || "#64748b",
    foreground: style.getPropertyValue("--foreground").trim() || "#111827",
    isDark: document.documentElement.classList.contains("dark"),
  };
}

function monthLabel(fromIso: string): string {
  const d = new Date(fromIso);
  if (Number.isNaN(d.getTime())) return "Mês atual";
  const label = d.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Widget de positivação (radialBar múltiplo) — quantidades inteiras no centro/labels,
 * não percentual.
 */
export function PositivacaoRadialWidget() {
  const monthRange = periodRange("this_month");
  const [colors, setColors] = useState<ThemeColors>(() =>
    typeof document !== "undefined"
      ? readThemeColors()
      : {
          chart1: "#02445c",
          chart2: "#1e6b7a",
          chart4: "#0d9488",
          chart5: "#f59e0b",
          muted: "#64748b",
          foreground: "#111827",
          isDark: false,
        },
  );

  useEffect(() => {
    const sync = () => setColors(readThemeColors());
    sync();
    const root = document.documentElement;
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const q = useQuery({
    queryKey: [
      "admin",
      "reports",
      "customer-positivacao",
      "home",
      monthRange.from,
    ],
    queryFn: () =>
      apiFetch<PositivacaoSummary>(
        `/admin/reports/customer-positivacao?from=${encodeURIComponent(monthRange.from)}&to=${encodeURIComponent(monthRange.to)}`,
      ),
    staleTime: 60_000,
  });

  const counts = useMemo(() => {
    const c = q.data?.categories;
    return [
      c?.novos ?? 0,
      c?.ativos ?? 0,
      c?.inativosRecentes ?? 0,
      c?.inativosAntigos ?? 0,
    ];
  }, [q.data?.categories]);

  const positivados = q.data?.totals.positivados ?? 0;
  const radialMax = Math.max(...counts, 1);

  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "radialBar",
        fontFamily: "Sora, system-ui, sans-serif",
        background: "transparent",
        toolbar: { show: false },
      },
      colors: [colors.chart1, colors.chart2, colors.chart4, colors.chart5],
      labels: [...CATEGORY_LABELS],
      plotOptions: {
        radialBar: {
          offsetY: 0,
          startAngle: 0,
          endAngle: 270,
          hollow: {
            margin: 4,
            size: "28%",
          },
          track: {
            background: colors.isDark
              ? "rgba(148, 163, 184, 0.15)"
              : "rgba(2, 68, 92, 0.08)",
            strokeWidth: "100%",
          },
          max: radialMax,
          dataLabels: {
            name: {
              fontSize: "12px",
              color: colors.muted,
              offsetY: -10,
            },
            value: {
              fontSize: "18px",
              fontWeight: 600,
              color: colors.foreground,
              offsetY: 2,
              formatter: (val) => String(Math.round(Number(val))),
            },
            total: {
              show: true,
              label: "Positivados",
              fontSize: "11px",
              color: colors.muted,
              formatter: () => String(positivados),
            },
          },
        },
      },
      legend: {
        show: true,
        floating: true,
        fontSize: "11px",
        position: "left",
        offsetX: 0,
        offsetY: 8,
        labels: {
          useSeriesColors: true,
        },
        markers: {
          size: 5,
        },
        formatter: (seriesName, opts) => {
          const n = counts[opts?.seriesIndex ?? -1] ?? 0;
          return `${seriesName}: ${n}`;
        },
        itemMargin: {
          vertical: 2,
        },
      },
      tooltip: {
        theme: colors.isDark ? "dark" : "light",
        y: {
          formatter: (_val, opts) => {
            const n = counts[opts?.seriesIndex ?? -1] ?? 0;
            return `${n} cliente(s)`;
          },
        },
      },
      stroke: { lineCap: "round" },
    }),
    [colors, counts, positivados, radialMax],
  );

  const series = counts;

  let chartBody: ReactNode;
  if (q.isLoading) {
    chartBody = (
      <div className="flex h-full min-h-56 items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  } else if (q.error) {
    chartBody = (
      <p className="px-1 py-6 text-sm text-destructive">
        {(q.error as Error).message}
      </p>
    );
  } else if (counts.every((n) => n === 0)) {
    chartBody = (
      <p className="px-1 py-6 text-sm text-muted-foreground">
        Nenhum cliente na carteira neste período.
      </p>
    );
  } else {
    chartBody = (
      <Chart type="radialBar" height={260} series={series} options={options} />
    );
  }

  return (
    <section className="surface-card-glass flex h-full flex-col p-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Positivação
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {monthLabel(monthRange.from)} · Clientes positivados:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {q.isLoading ? "…" : String(positivados)}
          </span>
        </p>
      </div>

      <div className="relative mt-2 min-h-56 flex-1">{chartBody}</div>

      <Link
        to="/relatorios/clientes/positivacao"
        className="mt-1 text-xs font-medium text-primary hover:underline"
      >
        Detalhar positivação
      </Link>
    </section>
  );
}
