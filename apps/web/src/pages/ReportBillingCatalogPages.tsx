import {
  fmtDateTime,
  fmtMoney,
  fmtPct,
  PeriodPresetBar,
  ReportDataLayout,
  ReportKpis,
  SellerFilterField,
  usePeriodState,
  useReportSellers,
} from "@/components/reports/ReportDataKit";
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
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

type InvoicedOrders = {
  totals: { invoiceCount: number; invoiceAmount: number };
  rows: Array<{
    invoiceId: string;
    nfeNumber: number | null;
    nfeSeries: number | null;
    issuedAt: string | null;
    invoiceAmount: number;
    orderCode: string;
    sellerName: string;
    customerName: string;
  }>;
};

type CommissionStatement = {
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
};

type CommissionByOrder = {
  totals: { orderCount: number; revenue: number; commission: number };
  rows: Array<{
    orderId: string;
    orderCode: string;
    createdAt: string;
    sellerName: string;
    customerName: string;
    priceTableName?: string | null;
    revenue: number;
    commission: number;
    commissionPct: number;
    commissionOrigin?: string | null;
  }>;
};

export function ReportInvoicedOrdersPage() {
  const { preset, setPreset, range } = usePeriodState();
  const { data: sellers = [] } = useReportSellers();
  const [sellerId, setSellerId] = useState("");

  const q = useQuery({
    queryKey: [
      "admin",
      "reports",
      "invoiced-orders",
      range.from,
      range.to,
      sellerId,
    ],
    queryFn: () => {
      const p = new URLSearchParams({ from: range.from, to: range.to });
      if (sellerId) p.set("sellerId", sellerId);
      return apiFetch<InvoicedOrders>(
        `/admin/reports/invoiced-orders?${p.toString()}`,
      );
    },
  });

  return (
    <ReportDataLayout
      title="Pedidos faturados"
      description="NF-e de saída autorizadas no período, com vínculo ao pedido."
      filters={
        <>
          <PeriodPresetBar preset={preset} onPreset={setPreset} />
          <SellerFilterField
            value={sellerId}
            onChange={setSellerId}
            sellers={sellers}
          />
        </>
      }
    >
      {q.isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : q.isError ? (
        <p className="text-destructive">
          {q.error instanceof Error ? q.error.message : "Falha ao carregar"}
        </p>
      ) : q.data ? (
        <div className="space-y-6">
          <ReportKpis
            items={[
              {
                label: "NF-e",
                value: String(q.data.totals.invoiceCount),
              },
              {
                label: "Valor faturado",
                value: `R$ ${fmtMoney(q.data.totals.invoiceAmount)}`,
              },
            ]}
          />
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">NF-e</TableHead>
                  <TableHead className="px-4">Emissão</TableHead>
                  <TableHead className="px-4">Pedido</TableHead>
                  <TableHead className="px-4">Cliente</TableHead>
                  <TableHead className="px-4">Vendedor</TableHead>
                  <TableHead className="px-4">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.rows.map((r) => (
                  <TableRow key={r.invoiceId}>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {r.nfeNumber != null
                        ? `${r.nfeSeries ?? "—"}/${r.nfeNumber}`
                        : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-sm text-muted-foreground">
                      {fmtDateTime(r.issuedAt)}
                    </TableCell>
                    <TableCell className="px-4 py-2">{r.orderCode}</TableCell>
                    <TableCell className="px-4 py-2">{r.customerName}</TableCell>
                    <TableCell className="px-4 py-2 text-muted-foreground">
                      {r.sellerName}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      R$ {fmtMoney(r.invoiceAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </ReportDataLayout>
  );
}

export function ReportCommissionsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const q = useQuery({
    queryKey: ["admin", "reports", "commission", year, month],
    queryFn: () =>
      apiFetch<CommissionStatement>(
        `/admin/reports/commission-statement?year=${year}&month=${month}`,
      ),
  });

  return (
    <ReportDataLayout
      title="Relatório de comissões"
      description="Extrato consolidado de comissão e metas por vendedor no mês."
      filters={
        <div className="flex flex-wrap gap-3">
          <AppSelect
            value={String(month)}
            onValueChange={(v) => setMonth(Number(v))}
            options={Array.from({ length: 12 }, (_, i) => ({
              value: String(i + 1),
              label: new Date(2000, i, 1).toLocaleString("pt-BR", {
                month: "long",
              }),
            }))}
          />
          <AppSelect
            value={String(year)}
            onValueChange={(v) => setYear(Number(v))}
            options={[year - 1, year, year + 1].map((y) => ({
              value: String(y),
              label: String(y),
            }))}
          />
        </div>
      }
    >
      {q.isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : q.data ? (
        <div className="space-y-6">
          <ReportKpis
            items={[
              {
                label: "Faturamento",
                value: `R$ ${fmtMoney(q.data.totals.revenue)}`,
              },
              {
                label: "Comissão",
                value: `R$ ${fmtMoney(q.data.totals.commission)}`,
              },
              {
                label: "Vendedores",
                value: String(q.data.totals.sellersWithSales),
              },
            ]}
          />
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Vendedor</TableHead>
                  <TableHead className="px-4">Pedidos</TableHead>
                  <TableHead className="px-4">Faturamento</TableHead>
                  <TableHead className="px-4">Comissão</TableHead>
                  <TableHead className="px-4">Meta</TableHead>
                  <TableHead className="px-4">% meta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.bySeller.map((r) => (
                  <TableRow key={r.sellerId}>
                    <TableCell className="px-4 py-2">{r.name}</TableCell>
                    <TableCell className="px-4 py-2">{r.orderCount}</TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      R$ {fmtMoney(r.revenue)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums font-medium">
                      R$ {fmtMoney(r.commission)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums text-muted-foreground">
                      {r.goalTarget != null
                        ? `R$ ${fmtMoney(r.goalTarget)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {r.goalPct != null ? fmtPct(r.goalPct) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </ReportDataLayout>
  );
}

export function ReportCommissionByOrderPage() {
  const { preset, setPreset, range } = usePeriodState();
  const { data: sellers = [] } = useReportSellers();
  const [sellerId, setSellerId] = useState("");

  const q = useQuery({
    queryKey: [
      "admin",
      "reports",
      "commission-by-order",
      range.from,
      range.to,
      sellerId,
    ],
    queryFn: () => {
      const p = new URLSearchParams({ from: range.from, to: range.to });
      if (sellerId) p.set("sellerId", sellerId);
      return apiFetch<CommissionByOrder>(
        `/admin/reports/commission-by-order?${p.toString()}`,
      );
    },
  });

  return (
    <ReportDataLayout
      title="Comissões por pedido"
      description="Comissão acumulada por pedido confirmado no período."
      filters={
        <>
          <PeriodPresetBar preset={preset} onPreset={setPreset} />
          <SellerFilterField
            value={sellerId}
            onChange={setSellerId}
            sellers={sellers}
          />
        </>
      }
    >
      {q.isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : q.data ? (
        <div className="space-y-6">
          <ReportKpis
            items={[
              {
                label: "Pedidos",
                value: String(q.data.totals.orderCount),
              },
              {
                label: "Faturamento",
                value: `R$ ${fmtMoney(q.data.totals.revenue)}`,
              },
              {
                label: "Comissão",
                value: `R$ ${fmtMoney(q.data.totals.commission)}`,
              },
            ]}
          />
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Pedido</TableHead>
                  <TableHead className="px-4">Data</TableHead>
                  <TableHead className="px-4">Cliente</TableHead>
                  <TableHead className="px-4">Vendedor</TableHead>
                  <TableHead className="px-4">Tabela</TableHead>
                  <TableHead className="px-4">Origem</TableHead>
                  <TableHead className="px-4">Total</TableHead>
                  <TableHead className="px-4">Comissão</TableHead>
                  <TableHead className="px-4">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.rows.map((r) => (
                  <TableRow key={r.orderId}>
                    <TableCell className="px-4 py-2">{r.orderCode}</TableCell>
                    <TableCell className="px-4 py-2 text-sm text-muted-foreground">
                      {fmtDateTime(r.createdAt)}
                    </TableCell>
                    <TableCell className="px-4 py-2">{r.customerName}</TableCell>
                    <TableCell className="px-4 py-2 text-muted-foreground">
                      {r.sellerName}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-muted-foreground">
                      {r.priceTableName ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-muted-foreground">
                      {r.commissionOrigin === "VARIAS"
                        ? "Várias"
                        : r.commissionOrigin === "COMISSAO_TABELA_PRECO"
                          ? "Tabela de preço"
                          : r.commissionOrigin === "COMISSAO_PRODUTO_VENDEDOR"
                            ? "Produto + vendedor"
                            : r.commissionOrigin === "COMISSAO_PRODUTO"
                              ? "Produto"
                              : r.commissionOrigin === "COMISSAO_GRUPO"
                                ? "Grupo"
                                : r.commissionOrigin ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      R$ {fmtMoney(r.revenue)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums font-medium">
                      R$ {fmtMoney(r.commission)}
                    </TableCell>
                    <TableCell className="px-4 py-2 tabular-nums">
                      {fmtPct(r.commissionPct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </ReportDataLayout>
  );
}
