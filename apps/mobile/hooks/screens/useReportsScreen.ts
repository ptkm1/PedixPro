import { useAuth } from "@/context/AuthContext";
import { sharePdf } from "@/lib/api";
import {
    PERIOD_FILTER_PRESETS,
    PERIOD_PRESET_LABELS,
    periodRange,
    type PeriodPreset,
} from "@/lib/period-presets";
import { useCallback, useMemo, useState } from "react";

export type ReportKind =
  | "sales-summary"
  | "sales-by-customer"
  | "sales-by-supplier";

export type ReportScopeChoice = "own" | "team";

const REPORT_META: Record<
  ReportKind,
  { title: string; description: string; path: string; filename: string }
> = {
  "sales-summary": {
    title: "Resumo de vendas",
    description: "Lista consolidada de pedidos confirmados no período.",
    path: "/seller/reports/sales-summary.pdf",
    filename: "resumo-vendas.pdf",
  },
  "sales-by-customer": {
    title: "Por clientes",
    description: "Totais de vendas agrupados por cliente.",
    path: "/seller/reports/sales-by-customer.pdf",
    filename: "vendas-por-cliente.pdf",
  },
  "sales-by-supplier": {
    title: "Por fornecedor",
    description: "Totais de vendas agrupados por fornecedor/indústria.",
    path: "/seller/reports/sales-by-supplier.pdf",
    filename: "vendas-por-fornecedor.pdf",
  },
};

export function useReportsScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const isSeller = user?.role === "SELLER";
  const isTeamLeader = Boolean(user?.isTeamLeader && user.role === "SELLER");

  const [preset, setPreset] = useState<PeriodPreset | null>("this_month");
  const [customRange, setCustomRangeState] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [scope, setScope] = useState<ReportScopeChoice>("own");
  const [pendingKind, setPendingKind] = useState<ReportKind | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const range = useMemo(
    () => customRange ?? periodRange(preset ?? "this_month"),
    [customRange, preset],
  );

  const scopeLabel = useMemo(() => {
    if (isAdmin) return "Todas as vendas da organização";
    if (isTeamLeader && scope === "team") {
      return user?.teamName
        ? `Equipe ${user.teamName}`
        : "Toda a equipe";
    }
    return "Somente minhas vendas";
  }, [isAdmin, isTeamLeader, scope, user?.teamName]);

  const generate = useCallback(
    async (kind: ReportKind) => {
      setErr(null);
      setPendingKind(kind);
      try {
        const meta = REPORT_META[kind];
        const q = new URLSearchParams({
          from: range.from,
          to: range.to,
        });
        if (isTeamLeader) q.set("scope", scope);
        await sharePdf(`${meta.path}?${q.toString()}`, meta.filename);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao gerar relatório");
      } finally {
        setPendingKind(null);
      }
    },
    [isTeamLeader, range.from, range.to, scope],
  );

  return {
    isAdmin,
    isSeller,
    isTeamLeader,
    preset,
    selectPreset: (next: PeriodPreset) => {
      setCustomRangeState(null);
      setPreset(next);
    },
    setCustomRange: (next: { from: string; to: string }) => {
      setPreset(null);
      setCustomRangeState(next);
    },
    isCustomRange: customRange != null,
    range,
    presets: PERIOD_FILTER_PRESETS,
    periodLabels: PERIOD_PRESET_LABELS,
    scope,
    setScope,
    scopeLabel,
    reports: REPORT_META,
    pendingKind,
    err,
    generate,
  };
}
