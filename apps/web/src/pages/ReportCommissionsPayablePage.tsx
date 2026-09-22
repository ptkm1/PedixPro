import { useAuth } from "@/auth/AuthContext";
import { ReportField } from "@/components/reports/ReportFormKit";
import {
  fmtMoney,
  ReportDataLayout,
  SellerFilterField,
  useReportSellers,
} from "@/components/reports/ReportDataKit";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, downloadPdf } from "@/lib/api";
import {
  PERIOD_PRESET_LABELS,
  periodRangeYmd,
  validateCustomPeriod,
  ymdToIsoRange,
} from "@/lib/period-presets";
import { canRead } from "@pedidos/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileDown, FileSpreadsheet } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

type PayableItem = {
  productName: string;
  quantity: number;
  saleAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  priceTableName: string;
};

type PayableOrder = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  referenceDate: string;
  saleAmount: number;
  commissionAmount: number;
  items: PayableItem[];
};

type PayableSeller = {
  sellerId: string;
  sellerName: string;
  orderCount: number;
  saleAmount: number;
  commissionAmount: number;
  orders: PayableOrder[];
};

type PayableReport = {
  criterion: string;
  criterionLabel: string;
  period: { from: string; to: string };
  totals: {
    sellerCount: number;
    orderCount: number;
    saleAmount: number;
    commissionAmount: number;
  };
  sellers: PayableSeller[];
};

function todayYmd() {
  return periodRangeYmd("this_month").to;
}

function fmtDateSp(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

export function ReportCommissionsPayablePage() {
  const { user } = useAuth();
  const canView = Boolean(
    user && canRead(user.role, "reports_commissions_payable", user.permissions),
  );
  const { data: sellers = [] } = useReportSellers();

  const initial = periodRangeYmd("this_month");
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [draftSellerId, setDraftSellerId] = useState("");
  const [appliedFrom, setAppliedFrom] = useState(initial.from);
  const [appliedTo, setAppliedTo] = useState(initial.to);
  const [appliedSellerId, setAppliedSellerId] = useState("");
  const [openSellerId, setOpenSellerId] = useState<string | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "xls" | null>(null);

  const periodError = validateCustomPeriod(draftFrom, draftTo);
  const appliedRange = useMemo(
    () => ymdToIsoRange(appliedFrom, appliedTo),
    [appliedFrom, appliedTo],
  );

  const queryPath = useMemo(() => {
    const p = new URLSearchParams({
      from: appliedRange.from,
      to: appliedRange.to,
    });
    if (appliedSellerId) p.set("sellerId", appliedSellerId);
    return p.toString();
  }, [appliedRange, appliedSellerId]);

  const q = useQuery({
    queryKey: ["admin", "reports", "commissions-payable", queryPath],
    queryFn: () =>
      apiFetch<PayableReport>(
        `/admin/reports/commissions-payable?${queryPath}`,
      ),
    enabled: canView,
  });

  function applyShortcut(preset: "this_month" | "last_month") {
    const r = periodRangeYmd(preset);
    setDraftFrom(r.from);
    setDraftTo(r.to);
    setAppliedFrom(r.from);
    setAppliedTo(r.to);
    setAppliedSellerId(draftSellerId);
    setOpenSellerId(null);
    setOpenOrderId(null);
  }

  function applyFilters() {
    if (periodError) return;
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
    setAppliedSellerId(draftSellerId);
    setOpenSellerId(null);
    setOpenOrderId(null);
  }

  async function exportFile(kind: "pdf" | "xls") {
    setExportErr(null);
    setExporting(kind);
    try {
      if (kind === "pdf") {
        await downloadPdf(
          `/admin/reports/commissions-payable.pdf?${queryPath}`,
          "comissoes-a-pagar.pdf",
        );
      } else {
        await downloadPdf(
          `/admin/reports/commissions-payable.xlsx?${queryPath}`,
          "comissoes-a-pagar.xls",
        );
      }
    } catch (e) {
      setExportErr(
        e instanceof Error ? e.message : "Falha ao exportar o relatório.",
      );
    } finally {
      setExporting(null);
    }
  }

  if (!canView) {
    return (
      <ReportDataLayout title="Comissões a Pagar">
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para visualizar o relatório de comissões a
          pagar.
        </p>
      </ReportDataLayout>
    );
  }

  const data = q.data;

  return (
    <ReportDataLayout
      title="Comissões a Pagar"
      description="Consolidado administrativo das comissões que já cumpriram o critério da empresa. Não inclui pedidos ainda inelegíveis."
      filters={
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Atalhos
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyShortcut("this_month")}
                  className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  {PERIOD_PRESET_LABELS.this_month}
                </button>
                <button
                  type="button"
                  onClick={() => applyShortcut("last_month")}
                  className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  {PERIOD_PRESET_LABELS.last_month}
                </button>
              </div>
            </div>
            <ReportField label="De">
              <DatePicker
                value={draftFrom}
                onChange={setDraftFrom}
                max={todayYmd()}
              />
            </ReportField>
            <ReportField label="Até">
              <DatePicker
                value={draftTo}
                onChange={setDraftTo}
                max={todayYmd()}
              />
            </ReportField>
            <SellerFilterField
              value={draftSellerId}
              onChange={setDraftSellerId}
              sellers={sellers}
            />
            <Button
              type="button"
              onClick={applyFilters}
              disabled={Boolean(periodError)}
            >
              Aplicar filtros
            </Button>
          </div>
          {periodError ? (
            <p className="text-xs text-destructive">{periodError}</p>
          ) : null}
        </div>
      }
    >
      {q.isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : q.isError ? (
        <p className="text-destructive">
          {q.error instanceof Error ? q.error.message : "Falha ao carregar"}
        </p>
      ) : data ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Critério:{" "}
              <span className="font-semibold text-foreground">
                {data.criterionLabel}
              </span>
              <span className="mx-2">·</span>
              {fmtDateSp(data.period.from)} — {fmtDateSp(data.period.to)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exporting != null}
                onClick={() => void exportFile("pdf")}
              >
                <FileDown className="h-4 w-4" />
                PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exporting != null}
                onClick={() => void exportFile("xls")}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
            </div>
          </div>
          {exportErr ? (
            <p className="text-sm text-destructive">{exportErr}</p>
          ) : null}

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Comissão a pagar
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
              R$ {fmtMoney(data.totals.commissionAmount)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.totals.orderCount} pedidos · vendas R${" "}
              {fmtMoney(data.totals.saleAmount)}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 w-10" />
                  <TableHead className="px-4">Vendedor</TableHead>
                  <TableHead className="px-4 text-right">Pedidos</TableHead>
                  <TableHead className="px-4 text-right">
                    Valor das vendas
                  </TableHead>
                  <TableHead className="px-4 text-right">
                    Comissão a pagar
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sellers.map((s) => {
                  const open = openSellerId === s.sellerId;
                  return (
                    <Fragment key={s.sellerId}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => {
                          setOpenSellerId(open ? null : s.sellerId);
                          setOpenOrderId(null);
                        }}
                      >
                        <TableCell className="px-4 py-2">
                          {open ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2 font-medium">
                          {s.sellerName}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-right tabular-nums">
                          {s.orderCount}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-right tabular-nums">
                          R$ {fmtMoney(s.saleAmount)}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-right tabular-nums text-base font-bold text-primary">
                          R$ {fmtMoney(s.commissionAmount)}
                        </TableCell>
                      </TableRow>
                      {open
                        ? s.orders.map((o) => {
                            const oOpen = openOrderId === o.orderId;
                            return (
                              <Fragment key={o.orderId}>
                                <TableRow
                                  className="cursor-pointer bg-muted/40"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setOpenOrderId(oOpen ? null : o.orderId);
                                  }}
                                >
                                  <TableCell className="px-4 py-2 pl-8">
                                    {oOpen ? (
                                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                  </TableCell>
                                  <TableCell className="px-4 py-2 text-sm">
                                    Pedido #{o.orderNumber} · {o.customerName}
                                  </TableCell>
                                  <TableCell className="px-4 py-2 text-right text-sm text-muted-foreground">
                                    {fmtDateSp(o.referenceDate)}
                                  </TableCell>
                                  <TableCell className="px-4 py-2 text-right tabular-nums text-sm">
                                    R$ {fmtMoney(o.saleAmount)}
                                  </TableCell>
                                  <TableCell className="px-4 py-2 text-right tabular-nums text-sm font-semibold">
                                    R$ {fmtMoney(o.commissionAmount)}
                                  </TableCell>
                                </TableRow>
                                {oOpen
                                  ? o.items.map((it, idx) => (
                                      <TableRow
                                        key={`${o.orderId}-${idx}`}
                                        className="bg-muted/20"
                                      >
                                        <TableCell />
                                        <TableCell className="px-4 py-1.5 pl-12 text-xs text-muted-foreground">
                                          {it.productName} · {it.quantity} un. ·{" "}
                                          {it.commissionPercent
                                            .toFixed(2)
                                            .replace(".", ",")}
                                          % · tabela {it.priceTableName}
                                        </TableCell>
                                        <TableCell />
                                        <TableCell className="px-4 py-1.5 text-right text-xs tabular-nums">
                                          R$ {fmtMoney(it.saleAmount)}
                                        </TableCell>
                                        <TableCell className="px-4 py-1.5 text-right text-xs tabular-nums">
                                          R$ {fmtMoney(it.commissionAmount)}
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  : null}
                              </Fragment>
                            );
                          })
                        : null}
                    </Fragment>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="px-4" />
                  <TableCell className="px-4 font-semibold">Total</TableCell>
                  <TableCell className="px-4 text-right tabular-nums font-semibold">
                    {data.totals.orderCount}
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums font-semibold">
                    R$ {fmtMoney(data.totals.saleAmount)}
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums text-base font-bold text-primary">
                    R$ {fmtMoney(data.totals.commissionAmount)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          {!data.sellers.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma comissão a pagar neste período.
            </p>
          ) : null}
        </div>
      ) : null}
    </ReportDataLayout>
  );
}
