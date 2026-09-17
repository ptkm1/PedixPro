import { AppSelect } from "@/components/ui/app-select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import {
    PERIOD_PRESET_LABELS,
    periodRange,
    type PeriodPreset,
} from "@/lib/period-presets";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

type ReportTab =
  | "comercial"
  | "margem"
  | "comissao"
  | "estoque"
  | "credito"
  | "fiscal"
  | "visitas";

function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function PeriodBar(props: {
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
          className={`glass-chip transition ${
            props.preset === p ? "glass-chip-active" : ""
          }`}
        >
          {PERIOD_PRESET_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

function KpiCards(props: {
  items: Array<{ label: string; value: string; hint?: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {props.items.map((k) => (
        <div
          key={k.label}
          className="rounded-xl border border-border bg-card p-4"
        >
          <p className="text-sm text-muted-foreground">{k.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
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

export function ManagementReportsPanel(props: { showAdminOnly: boolean }) {
  const [tab, setTab] = useState<ReportTab>("comercial");
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const range = useMemo(() => periodRange(preset), [preset]);
  const now = new Date();
  const [commYear, setCommYear] = useState(now.getFullYear());
  const [commMonth, setCommMonth] = useState(now.getMonth() + 1);

  const tabs: Array<{ id: ReportTab; label: string; adminOnly?: boolean }> = [
    { id: "comercial", label: "Comercial" },
    { id: "margem", label: "Margem", adminOnly: true },
    { id: "comissao", label: "Comissão", adminOnly: true },
    { id: "estoque", label: "Estoque", adminOnly: true },
    { id: "credito", label: "Crédito", adminOnly: true },
    { id: "fiscal", label: "Fiscal", adminOnly: true },
    { id: "visitas", label: "Visitas" },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || props.showAdminOnly);

  const scorecardQ = useQuery({
    queryKey: ["admin", "reports", "scorecard", range.from, range.to],
    queryFn: () =>
      apiFetch<{
        totals: { orderCount: number; totalAmount: number; avgTicket: number };
        bySeller: Array<{
          sellerId: string;
          name: string;
          orderCount: number;
          totalAmount: number;
        }>;
        byTeam: Array<{
          teamId: string;
          teamName: string;
          orderCount: number;
          totalAmount: number;
        }>;
        daily: Array<{ date: string; orderCount: number; totalAmount: number }>;
      }>(
        `/admin/reports/scorecard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
    enabled: tab === "comercial",
    staleTime: 45_000,
  });

  const marginQ = useQuery({
    queryKey: ["admin", "reports", "margin", range.from, range.to],
    queryFn: () =>
      apiFetch<{
        totals: {
          revenue: number;
          cost: number;
          margin: number;
          marginPct: number;
          linesMissingCost: number;
        };
        byProduct: Array<{
          id: string;
          label: string;
          quantity: number;
          revenue: number;
          cost: number;
          margin: number;
          marginPct: number;
        }>;
        bySupplier: Array<{
          id: string;
          label: string;
          revenue: number;
          margin: number;
          marginPct: number;
        }>;
        bySeller: Array<{
          id: string;
          label: string;
          revenue: number;
          margin: number;
          marginPct: number;
        }>;
      }>(
        `/admin/reports/margin?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
    enabled: tab === "margem" && props.showAdminOnly,
    staleTime: 45_000,
  });

  const commissionQ = useQuery({
    queryKey: ["admin", "reports", "commission", commYear, commMonth],
    queryFn: () =>
      apiFetch<{
        totals: {
          revenue: number;
          commission: number;
          sellersWithSales: number;
        };
        bySeller: Array<{
          sellerId: string;
          name: string;
          orderCount: number;
          revenue: number;
          commission: number;
          goalTarget: number | null;
          goalPct: number | null;
        }>;
      }>(
        `/admin/reports/commission-statement?year=${commYear}&month=${commMonth}`,
      ),
    enabled: tab === "comissao" && props.showAdminOnly,
    staleTime: 45_000,
  });

  const stockQ = useQuery({
    queryKey: ["admin", "reports", "stock-health"],
    queryFn: () =>
      apiFetch<{
        totals: {
          productCount: number;
          belowMinCount: number;
          aboveMaxCount: number;
          stagnantWithStockCount: number;
          approxValuation: number;
        };
        belowMin: Array<{
          productId: string;
          name: string;
          sku: string | null;
          quantity: number;
          minStockQty: number;
          deficit: number;
        }>;
        aboveMax: Array<{
          productId: string;
          name: string;
          quantity: number;
          maxStockQty: number;
          excess: number;
        }>;
        stagnantWithStock: Array<{
          productId: string;
          name: string;
          quantity: number;
          daysSinceLastSale: number | null;
          neverSold: boolean;
          approxValue: number;
        }>;
      }>("/admin/reports/stock-health"),
    enabled: tab === "estoque" && props.showAdminOnly,
    staleTime: 45_000,
  });

  const creditQ = useQuery({
    queryKey: ["admin", "reports", "credit-aging"],
    queryFn: () =>
      apiFetch<{
        totals: {
          openBalance: number;
          buckets: {
            current: number;
            d1_30: number;
            d31_60: number;
            d61_90: number;
            d90_plus: number;
          };
          blockedCustomers: number;
          overLimitCustomers: number;
        };
        customers: Array<{
          customerId: string;
          name: string;
          sellerName: string | null;
          openBalance: number;
          creditLimit: number | null;
          limitUtilizationPct: number | null;
          overLimit: boolean;
          creditBlocked: boolean;
          buckets: {
            current: number;
            d1_30: number;
            d31_60: number;
            d61_90: number;
            d90_plus: number;
          };
        }>;
      }>("/admin/reports/credit-aging"),
    enabled: tab === "credito" && props.showAdminOnly,
    staleTime: 45_000,
  });

  const fiscalQ = useQuery({
    queryKey: ["admin", "reports", "fiscal", range.from, range.to],
    queryFn: () =>
      apiFetch<{
        totals: {
          confirmedOrders: number;
          commercialTotal: number;
          ordersWithoutNfe: number;
          ordersWithAuthorizedNfe: number;
          outboundAuthorizedTotal: number;
          inboundTotal: number;
          inboundCount: number;
        };
        ordersWithoutNfe: Array<{
          orderId: string;
          createdAt: string;
          customerName: string;
          sellerName: string;
          totalAmount: number;
        }>;
        rejectedOrCancelled: Array<{
          orderId: string;
          status: string;
          customerName: string;
          totalAmount: number;
        }>;
      }>(
        `/admin/reports/fiscal-reconciliation?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
    enabled: tab === "fiscal" && props.showAdminOnly,
    staleTime: 45_000,
  });

  const fiscalSummaryQ = useQuery({
    queryKey: [
      "admin",
      "reports",
      "fiscal-outbound-summary",
      range.from,
      range.to,
    ],
    queryFn: () =>
      apiFetch<{
        counts: {
          drafts: number;
          authorized: number;
          rejected: number;
          transmitted: number;
          queuePending: number;
          queueFailed: number;
        };
        recentRejected: Array<{
          id: string;
          number: number | null;
          series: number | null;
          rejectionReason: string | null;
          updatedAt: string;
          orderNumber: number | null;
          customerName: string;
        }>;
      }>(
        `/admin/reports/fiscal-outbound-summary?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
    enabled: tab === "fiscal" && props.showAdminOnly,
    staleTime: 45_000,
  });

  const visitsQ = useQuery({
    queryKey: ["admin", "reports", "visits", range.from, range.to],
    queryFn: () =>
      apiFetch<{
        totals: {
          visits: number;
          converted: number;
          conversionRate: number;
          convertedAmount: number;
          coveragePct: number;
          visitedCustomers: number;
          assignedCustomers: number;
        };
        conversionWindowDays: number;
        bySeller: Array<{
          sellerId: string;
          name: string;
          visits: number;
          converted: number;
          conversionRate: number;
          revenue: number;
        }>;
        visitsWithoutSale: Array<{
          visitId: string;
          sellerName: string;
          customerName: string;
          checkedInAt: string;
        }>;
      }>(
        `/admin/reports/visit-effectiveness?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
    enabled: tab === "visitas",
    staleTime: 45_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "comercial" ||
        tab === "margem" ||
        tab === "fiscal" ||
        tab === "visitas") && (
        <PeriodBar preset={preset} onPreset={setPreset} />
      )}

      {tab === "comercial" && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Scorecard de vendas</h2>
          {scorecardQ.isLoading ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : scorecardQ.error ? (
            <p className="text-sm text-destructive">
              {(scorecardQ.error as Error).message}
            </p>
          ) : scorecardQ.data ? (
            <>
              <KpiCards
                items={[
                  {
                    label: "Faturamento",
                    value: `R$ ${fmtMoney(scorecardQ.data.totals.totalAmount)}`,
                  },
                  {
                    label: "Pedidos",
                    value: String(scorecardQ.data.totals.orderCount),
                  },
                  {
                    label: "Ticket médio",
                    value: `R$ ${fmtMoney(scorecardQ.data.totals.avgTicket)}`,
                  },
                  {
                    label: "Vendedores com venda",
                    value: String(
                      scorecardQ.data.bySeller.filter((s) => s.orderCount > 0)
                        .length,
                    ),
                  },
                ]}
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-card">
                  <p className="border-b border-border px-4 py-3 text-sm font-medium">
                    Por vendedor
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-4">Vendedor</TableHead>
                        <TableHead className="px-4">Pedidos</TableHead>
                        <TableHead className="px-4">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scorecardQ.data.bySeller.slice(0, 15).map((r) => (
                        <TableRow key={r.sellerId}>
                          <TableCell className="px-4 py-2">{r.name}</TableCell>
                          <TableCell className="px-4 py-2">
                            {r.orderCount}
                          </TableCell>
                          <TableCell className="px-4 py-2 tabular-nums">
                            R$ {fmtMoney(r.totalAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="rounded-xl border border-border bg-card">
                  <p className="border-b border-border px-4 py-3 text-sm font-medium">
                    Por equipe
                  </p>
                  {scorecardQ.data.byTeam.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                      Nenhuma equipe com vendas.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-4">Equipe</TableHead>
                          <TableHead className="px-4">Pedidos</TableHead>
                          <TableHead className="px-4">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scorecardQ.data.byTeam.map((r) => (
                          <TableRow key={r.teamId}>
                            <TableCell className="px-4 py-2">
                              {r.teamName}
                            </TableCell>
                            <TableCell className="px-4 py-2">
                              {r.orderCount}
                            </TableCell>
                            <TableCell className="px-4 py-2 tabular-nums">
                              R$ {fmtMoney(r.totalAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
              {scorecardQ.data.daily.length > 0 ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="mb-3 text-sm font-medium">Tendência diária</p>
                  <div className="flex h-28 items-end gap-1 overflow-x-auto">
                    {scorecardQ.data.daily.map((d) => {
                      const max = Math.max(
                        ...scorecardQ.data!.daily.map((x) => x.totalAmount),
                        1,
                      );
                      const h = Math.max(
                        4,
                        Math.round((d.totalAmount / max) * 100),
                      );
                      return (
                        <div
                          key={d.date}
                          title={`${d.date}: R$ ${fmtMoney(d.totalAmount)} (${d.orderCount} pedidos)`}
                          className="w-3 shrink-0 rounded-t bg-primary/80"
                          style={{ height: `${h}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      )}

      {tab === "margem" && marginQ.data && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Margem / contribuição</h2>
          <KpiCards
            items={[
              {
                label: "Receita",
                value: `R$ ${fmtMoney(marginQ.data.totals.revenue)}`,
              },
              {
                label: "Custo",
                value: `R$ ${fmtMoney(marginQ.data.totals.cost)}`,
              },
              {
                label: "Margem",
                value: `R$ ${fmtMoney(marginQ.data.totals.margin)}`,
              },
              {
                label: "Margem %",
                value: fmtPct(marginQ.data.totals.marginPct),
                hint:
                  marginQ.data.totals.linesMissingCost > 0
                    ? `${marginQ.data.totals.linesMissingCost} linhas sem costPrice`
                    : undefined,
              },
            ]}
          />
          <div className="rounded-xl border border-border bg-card">
            <p className="border-b border-border px-4 py-3 text-sm font-medium">
              Por produto (top 50)
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Produto</TableHead>
                  <TableHead className="px-4">Receita</TableHead>
                  <TableHead className="px-4">Margem</TableHead>
                  <TableHead className="px-4">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marginQ.data.byProduct.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="px-4 py-2">{r.label}</TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      R$ {fmtMoney(r.revenue)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      R$ {fmtMoney(r.margin)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {fmtPct(r.marginPct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card">
              <p className="border-b border-border px-4 py-3 text-sm font-medium">
                Por fornecedor
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Fornecedor</TableHead>
                    <TableHead className="px-4">Margem</TableHead>
                    <TableHead className="px-4">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marginQ.data.bySupplier.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="px-4 py-2">{r.label}</TableCell>
                      <TableCell className="px-4 py-2 tabular-nums">
                        R$ {fmtMoney(r.margin)}
                      </TableCell>
                      <TableCell className="px-4 py-2 tabular-nums">
                        {fmtPct(r.marginPct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="rounded-xl border border-border bg-card">
              <p className="border-b border-border px-4 py-3 text-sm font-medium">
                Por vendedor
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Vendedor</TableHead>
                    <TableHead className="px-4">Margem</TableHead>
                    <TableHead className="px-4">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marginQ.data.bySeller.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="px-4 py-2">{r.label}</TableCell>
                      <TableCell className="px-4 py-2 tabular-nums">
                        R$ {fmtMoney(r.margin)}
                      </TableCell>
                      <TableCell className="px-4 py-2 tabular-nums">
                        {fmtPct(r.marginPct)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}
      {tab === "margem" && marginQ.isLoading && (
        <p className="text-muted-foreground">Carregando…</p>
      )}

      {tab === "comissao" && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Extrato de comissão</h2>
          <div className="flex flex-wrap gap-3">
            <AppSelect
              value={String(commMonth)}
              onValueChange={(v) => setCommMonth(Number(v))}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: String(i + 1),
                label: new Date(2000, i, 1).toLocaleString("pt-BR", {
                  month: "long",
                }),
              }))}
            />
            <AppSelect
              value={String(commYear)}
              onValueChange={(v) => setCommYear(Number(v))}
              options={[commYear - 1, commYear, commYear + 1].map((y) => ({
                value: String(y),
                label: String(y),
              }))}
            />
          </div>
          {commissionQ.isLoading ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : commissionQ.data ? (
            <>
              <KpiCards
                items={[
                  {
                    label: "Faturamento base",
                    value: `R$ ${fmtMoney(commissionQ.data.totals.revenue)}`,
                  },
                  {
                    label: "Comissão total",
                    value: `R$ ${fmtMoney(commissionQ.data.totals.commission)}`,
                  },
                  {
                    label: "Vendedores",
                    value: String(commissionQ.data.totals.sellersWithSales),
                  },
                ]}
              />
              <div className="rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4">Vendedor</TableHead>
                      <TableHead className="px-4">Pedidos</TableHead>
                      <TableHead className="px-4">Faturamento</TableHead>
                      <TableHead className="px-4">Comissão</TableHead>
                      <TableHead className="px-4">Meta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissionQ.data.bySeller.map((r) => (
                      <TableRow key={r.sellerId}>
                        <TableCell className="px-4 py-2">{r.name}</TableCell>
                        <TableCell className="px-4 py-2">
                          {r.orderCount}
                        </TableCell>
                        <TableCell className="px-4 py-2 tabular-nums">
                          R$ {fmtMoney(r.revenue)}
                        </TableCell>
                        <TableCell className="px-4 py-2 tabular-nums font-medium">
                          R$ {fmtMoney(r.commission)}
                        </TableCell>
                        <TableCell className="px-4 py-2 text-sm text-muted-foreground">
                          {r.goalTarget != null
                            ? `${fmtPct(r.goalPct ?? 0)} de R$ ${fmtMoney(r.goalTarget)}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </section>
      )}

      {tab === "estoque" && stockQ.data && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Saúde de estoque</h2>
            <Link
              to="/estoque"
              className="text-sm text-primary hover:underline"
            >
              Abrir módulo Estoque
            </Link>
          </div>
          <KpiCards
            items={[
              {
                label: "Abaixo do mínimo",
                value: String(stockQ.data.totals.belowMinCount),
              },
              {
                label: "Acima do máximo",
                value: String(stockQ.data.totals.aboveMaxCount),
              },
              {
                label: "Parados c/ saldo",
                value: String(stockQ.data.totals.stagnantWithStockCount),
              },
              {
                label: "Valor approx.",
                value: `R$ ${fmtMoney(stockQ.data.totals.approxValuation)}`,
                hint: "qty × costPrice",
              },
            ]}
          />
          <div className="rounded-xl border border-border bg-card">
            <p className="border-b border-border px-4 py-3 text-sm font-medium">
              Abaixo do mínimo
            </p>
            {stockQ.data.belowMin.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Nenhum produto abaixo do mínimo.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Produto</TableHead>
                    <TableHead className="px-4">Saldo</TableHead>
                    <TableHead className="px-4">Mín.</TableHead>
                    <TableHead className="px-4">Déficit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockQ.data.belowMin.map((r) => (
                    <TableRow key={r.productId}>
                      <TableCell className="px-4 py-2">{r.name}</TableCell>
                      <TableCell className="px-4 py-2">{r.quantity}</TableCell>
                      <TableCell className="px-4 py-2">
                        {r.minStockQty}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-destructive">
                        {r.deficit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card">
            <p className="border-b border-border px-4 py-3 text-sm font-medium">
              Parados com saldo (30+ dias)
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Produto</TableHead>
                  <TableHead className="px-4">Saldo</TableHead>
                  <TableHead className="px-4">Dias</TableHead>
                  <TableHead className="px-4">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockQ.data.stagnantWithStock.slice(0, 30).map((r) => (
                  <TableRow key={r.productId}>
                    <TableCell className="px-4 py-2">{r.name}</TableCell>
                    <TableCell className="px-4 py-2">{r.quantity}</TableCell>
                    <TableCell className="px-4 py-2">
                      {r.neverSold ? "Nunca" : r.daysSinceLastSale}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      R$ {fmtMoney(r.approxValue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
      {tab === "estoque" && stockQ.isLoading && (
        <p className="text-muted-foreground">Carregando…</p>
      )}

      {tab === "credito" && creditQ.data && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Aging de crédito</h2>
          <KpiCards
            items={[
              {
                label: "Em aberto",
                value: `R$ ${fmtMoney(creditQ.data.totals.openBalance)}`,
              },
              {
                label: "0–30 dias",
                value: `R$ ${fmtMoney(creditQ.data.totals.buckets.d1_30)}`,
              },
              {
                label: "31–90",
                value: `R$ ${fmtMoney(creditQ.data.totals.buckets.d31_60 + creditQ.data.totals.buckets.d61_90)}`,
              },
              {
                label: "90+",
                value: `R$ ${fmtMoney(creditQ.data.totals.buckets.d90_plus)}`,
                hint: `${creditQ.data.totals.overLimitCustomers} acima do limite · ${creditQ.data.totals.blockedCustomers} bloqueados`,
              },
            ]}
          />
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Cliente</TableHead>
                  <TableHead className="px-4">Aberto</TableHead>
                  <TableHead className="px-4">Limite %</TableHead>
                  <TableHead className="px-4">A vencer</TableHead>
                  <TableHead className="px-4">1–30</TableHead>
                  <TableHead className="px-4">31–60</TableHead>
                  <TableHead className="px-4">61–90</TableHead>
                  <TableHead className="px-4">90+</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditQ.data.customers.slice(0, 50).map((c) => (
                  <TableRow key={c.customerId}>
                    <TableCell className="px-4 py-2">
                      <Link
                        to={`/clientes`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.creditBlocked ? (
                        <span className="ml-2 text-xs text-destructive">
                          Bloqueado
                        </span>
                      ) : null}
                      {c.overLimit ? (
                        <span className="ml-2 text-xs text-amber-700">
                          Sobre limite
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      R$ {fmtMoney(c.openBalance)}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      {c.limitUtilizationPct != null
                        ? fmtPct(c.limitUtilizationPct)
                        : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {fmtMoney(c.buckets.current)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {fmtMoney(c.buckets.d1_30)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {fmtMoney(c.buckets.d31_60)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {fmtMoney(c.buckets.d61_90)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {fmtMoney(c.buckets.d90_plus)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
      {tab === "credito" && creditQ.isLoading && (
        <p className="text-muted-foreground">Carregando…</p>
      )}

      {tab === "fiscal" && fiscalSummaryQ.data && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Fila e rejeições NF-e</h2>
            <Link
              to="/faturamento"
              className="text-sm text-primary hover:underline"
            >
              Ir para Faturamento
            </Link>
          </div>
          <KpiCards
            items={[
              {
                label: "Rascunhos",
                value: String(fiscalSummaryQ.data.counts.drafts),
              },
              {
                label: "Autorizadas",
                value: String(fiscalSummaryQ.data.counts.authorized),
              },
              {
                label: "Rejeitadas",
                value: String(fiscalSummaryQ.data.counts.rejected),
              },
              {
                label: "Na fila / falhas",
                value: `${fiscalSummaryQ.data.counts.queuePending} / ${fiscalSummaryQ.data.counts.queueFailed}`,
                hint:
                  fiscalSummaryQ.data.counts.transmitted > 0
                    ? `${fiscalSummaryQ.data.counts.transmitted} aguardando SEFAZ`
                    : undefined,
              },
            ]}
          />
          {fiscalSummaryQ.data.recentRejected.length > 0 ? (
            <div className="rounded-xl border border-border bg-card">
              <p className="border-b border-border px-4 py-3 text-sm font-medium">
                Últimas rejeições
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Nota</TableHead>
                    <TableHead className="px-4">Cliente</TableHead>
                    <TableHead className="px-4">Motivo</TableHead>
                    <TableHead className="px-4">Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fiscalSummaryQ.data.recentRejected.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="px-4 py-2 font-mono text-xs">
                        {r.series}/{r.number}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        {r.customerName}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-sm text-destructive">
                        {(r.rejectionReason ?? "—").slice(0, 120)}
                      </TableCell>
                      <TableCell className="px-4 py-2 whitespace-nowrap text-xs">
                        {new Date(r.updatedAt).toLocaleString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </section>
      )}

      {tab === "fiscal" && fiscalQ.data && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Conciliação NF-e × vendas</h2>
            <Link
              to="/faturamento"
              className="text-sm text-primary hover:underline"
            >
              Ir para Faturamento
            </Link>
          </div>
          <KpiCards
            items={[
              {
                label: "Vendas confirmadas",
                value: `R$ ${fmtMoney(fiscalQ.data.totals.commercialTotal)}`,
                hint: `${fiscalQ.data.totals.confirmedOrders} pedidos`,
              },
              {
                label: "Sem NF-e",
                value: String(fiscalQ.data.totals.ordersWithoutNfe),
              },
              {
                label: "NF-e saída",
                value: `R$ ${fmtMoney(fiscalQ.data.totals.outboundAuthorizedTotal)}`,
              },
              {
                label: "NF-e entrada",
                value: `R$ ${fmtMoney(fiscalQ.data.totals.inboundTotal)}`,
                hint: `${fiscalQ.data.totals.inboundCount} notas`,
              },
            ]}
          />
          <div className="rounded-xl border border-border bg-card">
            <p className="border-b border-border px-4 py-3 text-sm font-medium">
              Pedidos sem NF-e autorizada
            </p>
            {fiscalQ.data.ordersWithoutNfe.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Todos os pedidos do período têm NF-e.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Data</TableHead>
                    <TableHead className="px-4">Cliente</TableHead>
                    <TableHead className="px-4">Vendedor</TableHead>
                    <TableHead className="px-4">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fiscalQ.data.ordersWithoutNfe.map((o) => (
                    <TableRow key={o.orderId}>
                      <TableCell className="px-4 py-2 whitespace-nowrap">
                        {new Date(o.createdAt).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        {o.customerName}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        {o.sellerName}
                      </TableCell>
                      <TableCell className="px-4 py-2 tabular-nums">
                        R$ {fmtMoney(o.totalAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </section>
      )}
      {tab === "fiscal" && fiscalQ.isLoading && (
        <p className="text-muted-foreground">Carregando…</p>
      )}

      {tab === "visitas" && visitsQ.data && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Efetividade de visitas</h2>
          <p className="text-sm text-muted-foreground">
            Conversão: visita com pedido confirmado no mesmo dia (janela de{" "}
            {visitsQ.data.conversionWindowDays} dia(s)).
          </p>
          <KpiCards
            items={[
              { label: "Visitas", value: String(visitsQ.data.totals.visits) },
              {
                label: "Conversão",
                value: fmtPct(visitsQ.data.totals.conversionRate),
                hint: `${visitsQ.data.totals.converted} com venda`,
              },
              {
                label: "Receita convertida",
                value: `R$ ${fmtMoney(visitsQ.data.totals.convertedAmount)}`,
              },
              {
                label: "Cobertura carteira",
                value: fmtPct(visitsQ.data.totals.coveragePct),
                hint: `${visitsQ.data.totals.visitedCustomers}/${visitsQ.data.totals.assignedCustomers} clientes`,
              },
            ]}
          />
          <div className="rounded-xl border border-border bg-card">
            <p className="border-b border-border px-4 py-3 text-sm font-medium">
              Por vendedor
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Vendedor</TableHead>
                  <TableHead className="px-4">Visitas</TableHead>
                  <TableHead className="px-4">Convertidas</TableHead>
                  <TableHead className="px-4">Taxa</TableHead>
                  <TableHead className="px-4">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitsQ.data.bySeller.map((r) => (
                  <TableRow key={r.sellerId}>
                    <TableCell className="px-4 py-2">{r.name}</TableCell>
                    <TableCell className="px-4 py-2">{r.visits}</TableCell>
                    <TableCell className="px-4 py-2">{r.converted}</TableCell>
                    <TableCell className="px-4 py-2">
                      {fmtPct(r.conversionRate)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      R$ {fmtMoney(r.revenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
      {tab === "visitas" && visitsQ.isLoading && (
        <p className="text-muted-foreground">Carregando…</p>
      )}
    </div>
  );
}
