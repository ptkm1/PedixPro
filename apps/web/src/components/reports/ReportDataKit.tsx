import { AppSelect } from "@/components/ui/app-select";
import { ReportBreadcrumb, ReportField } from "@/components/reports/ReportFormKit";
import {
    PERIOD_PRESET_LABELS,
    periodRange,
    type PeriodPreset,
} from "@/lib/period-presets";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

export function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPct(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Seller = { id: string; user: { name: string } };

export function useReportSellers() {
  return useQuery({
    queryKey: ["admin", "sellers"],
    queryFn: () => apiFetch<Seller[]>("/admin/sellers"),
  });
}

export function usePeriodState(defaultPreset: PeriodPreset = "this_month") {
  const [preset, setPreset] = useState<PeriodPreset>(defaultPreset);
  const range = useMemo(() => periodRange(preset), [preset]);
  return { preset, setPreset, range };
}

export function PeriodPresetBar(props: {
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(PERIOD_PRESET_LABELS) as PeriodPreset[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => props.onPreset(p)}
          className={cn(
            "glass-chip transition",
            props.preset === p && "glass-chip-active",
          )}
        >
          {PERIOD_PRESET_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

export function ReportKpis(props: {
  items: Array<{ label: string; value: string; hint?: string; negative?: boolean }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {props.items.map((k) => (
        <div
          key={k.label}
          className="surface-card-glass p-4"
        >
          <p className="text-sm text-muted-foreground">{k.label}</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums text-foreground",
              k.negative && "text-destructive",
            )}
          >
            {k.value}
          </p>
          {k.hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ReportDataLayout(props: {
  title: string;
  description?: string;
  filters?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <ReportBreadcrumb current={props.title} />
        <h1 className="text-2xl font-semibold text-foreground">{props.title}</h1>
        {props.description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {props.description}
          </p>
        ) : null}
      </div>
      {props.filters ? (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
          {props.filters}
        </div>
      ) : null}
      {props.children}
      <div>
        <Link
          to="/relatorios"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Voltar aos relatórios
        </Link>
      </div>
    </div>
  );
}

export function SellerFilterField(props: {
  value: string;
  onChange: (v: string) => void;
  sellers: Seller[];
}) {
  return (
    <ReportField label="Vendedor" className="sm:grid-cols-[auto_12rem]">
      <AppSelect
        value={props.value}
        onValueChange={props.onChange}
        emptyLabel="Todos"
        options={props.sellers.map((s) => ({
          value: s.id,
          label: s.user.name,
        }))}
      />
    </ReportField>
  );
}
