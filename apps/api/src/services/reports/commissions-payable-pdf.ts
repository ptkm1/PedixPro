import {
  buildCommissionPayableReport,
  type CommissionPayableReport,
} from "../commission-payable-report.js";
import {
  drawEmptyState,
  drawHeader,
  drawInfoBar,
  drawTableFooter,
  drawTableHeader,
  drawTableRow,
  money,
  shortDateTime,
  withPdfDoc,
  type PdfTable,
} from "./pdf-common.js";

const SUMMARY: PdfTable = {
  columns: [
    { key: "seller", label: "Vendedor", width: 170 },
    { key: "orders", label: "Pedidos", width: 70, align: "right" },
    { key: "sales", label: "Vendas", width: 120, align: "right" },
    { key: "commission", label: "Comissão a pagar", width: 187, align: "right" },
  ],
  rowHeight: 22,
};

const DETAIL: PdfTable = {
  columns: [
    { key: "seller", label: "Vendedor", width: 110 },
    { key: "order", label: "Pedido", width: 58 },
    { key: "date", label: "Data ref.", width: 78 },
    { key: "customer", label: "Cliente", width: 121 },
    { key: "sale", label: "Venda", width: 80, align: "right" },
    { key: "commission", label: "Comissão", width: 100, align: "right" },
  ],
  rowHeight: 20,
};

function fmtRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return `${from.toLocaleDateString("pt-BR")} a ${to.toLocaleDateString("pt-BR")}`;
}

export async function buildCommissionPayablePdf(params: {
  organizationId: string;
  orgName?: string | null;
  from?: string;
  to?: string;
  sellerId?: string;
}): Promise<Buffer> {
  const report = await buildCommissionPayableReport(params);
  return renderCommissionPayablePdf(report, params.orgName ?? "");
}

export async function renderCommissionPayablePdf(
  report: CommissionPayableReport,
  orgName: string,
): Promise<Buffer> {
  return withPdfDoc((doc) => {
    const range = fmtRange(report.period.from, report.period.to);
    drawHeader(
      doc,
      "Comissões a pagar",
      orgName,
      `${report.criterionLabel} · ${range}`,
    );
    drawInfoBar(doc, [
      { label: "Critério:", value: report.criterionLabel },
      { label: "Período:", value: range },
    ]);

    if (!report.sellers.length) {
      drawEmptyState(
        doc,
        "Nenhuma comissão a pagar no período para o critério atual.",
      );
      return;
    }

    drawTableHeader(doc, SUMMARY);
    report.sellers.forEach((row, index) => {
      drawTableRow(
        doc,
        SUMMARY,
        {
          seller: row.sellerName,
          orders: String(row.orderCount),
          sales: money(row.saleAmount),
          commission: money(row.commissionAmount),
        },
        {
          index,
          onNewPage: () =>
            drawHeader(doc, "Comissões a pagar (cont.)", orgName),
        },
      );
    });
    drawTableFooter(
      doc,
      `Pedidos: ${report.totals.orderCount} · Vendas: ${money(report.totals.saleAmount)}`,
      `COMISSÃO A PAGAR: ${money(report.totals.commissionAmount)}`,
    );

    doc.addPage();
    drawHeader(doc, "Comissões a pagar — pedidos", orgName, range);
    drawTableHeader(doc, DETAIL);
    let idx = 0;
    for (const seller of report.sellers) {
      for (const order of seller.orders) {
        drawTableRow(
          doc,
          DETAIL,
          {
            seller: seller.sellerName,
            order: order.orderNumber,
            date: shortDateTime(new Date(order.referenceDate)),
            customer: order.customerName,
            sale: money(order.saleAmount),
            commission: money(order.commissionAmount),
          },
          {
            index: idx++,
            onNewPage: () =>
              drawHeader(doc, "Comissões a pagar — pedidos (cont.)", orgName),
          },
        );
      }
    }
    drawTableFooter(
      doc,
      `Pedidos: ${report.totals.orderCount}`,
      `COMISSÃO A PAGAR: ${money(report.totals.commissionAmount)}`,
    );
  });
}
