import type { CommissionPayableReport } from "../commission-payable-report.js";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(value: string, type: "String" | "Number" = "String"): string {
  return `<Cell><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
}

function moneyCell(n: number): string {
  return cell(n.toFixed(2).replace(".", ","), "String");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function fmtRange(fromIso: string, toIso: string): string {
  return `${fmtDate(fromIso)} a ${fmtDate(toIso)}`;
}

function row(cells: string): string {
  return `<Row>${cells}</Row>`;
}

export function buildCommissionPayableExcelXml(
  report: CommissionPayableReport,
  orgName: string,
): string {
  const range = fmtRange(report.period.from, report.period.to);
  const summaryRows = [
    row(
      cell("Vendedor") +
        cell("Pedidos considerados") +
        cell("Valor das vendas") +
        cell("Comissão a pagar"),
    ),
    ...report.sellers.map((s) =>
      row(
        cell(s.sellerName) +
          cell(String(s.orderCount), "Number") +
          moneyCell(s.saleAmount) +
          moneyCell(s.commissionAmount),
      ),
    ),
    row(
      cell("TOTAL") +
        cell(String(report.totals.orderCount), "Number") +
        moneyCell(report.totals.saleAmount) +
        moneyCell(report.totals.commissionAmount),
    ),
  ].join("");

  const detailRows = [
    row(
      cell("Vendedor") +
        cell("Pedido") +
        cell("Cliente") +
        cell("Data de referência") +
        cell("Venda") +
        cell("Comissão"),
    ),
    ...report.sellers.flatMap((s) =>
      s.orders.map((o) =>
        row(
          cell(s.sellerName) +
            cell(o.orderNumber) +
            cell(o.customerName) +
            cell(fmtDate(o.referenceDate)) +
            moneyCell(o.saleAmount) +
            moneyCell(o.commissionAmount),
        ),
      ),
    ),
    row(
      cell("TOTAL") +
        cell("") +
        cell("") +
        cell("") +
        moneyCell(report.totals.saleAmount) +
        moneyCell(report.totals.commissionAmount),
    ),
  ].join("");

  const itemsRows = [
    row(
      cell("Vendedor") +
        cell("Pedido") +
        cell("Produto") +
        cell("Qtd") +
        cell("Valor") +
        cell("% comissão") +
        cell("Comissão") +
        cell("Tabela de preço"),
    ),
    ...report.sellers.flatMap((s) =>
      s.orders.flatMap((o) =>
        o.items.map((it) =>
          row(
            cell(s.sellerName) +
              cell(o.orderNumber) +
              cell(it.productName) +
              cell(String(it.quantity), "Number") +
              moneyCell(it.saleAmount) +
              cell(it.commissionPercent.toFixed(2).replace(".", ",")) +
              moneyCell(it.commissionAmount) +
              cell(it.priceTableName),
          ),
        ),
      ),
    ),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Resumo">
<Table>
${row(cell("Comissões a pagar"))}
${row(cell("Empresa") + cell(orgName))}
${row(cell("Critério") + cell(report.criterionLabel))}
${row(cell("Período") + cell(range))}
${row(cell("COMISSÃO A PAGAR") + moneyCell(report.totals.commissionAmount))}
${row(cell(""))}
${summaryRows}
</Table>
</Worksheet>
<Worksheet ss:Name="Pedidos">
<Table>
${row(cell("Comissões a pagar — pedidos"))}
${row(cell("Critério") + cell(report.criterionLabel))}
${row(cell("Período") + cell(range))}
${row(cell(""))}
${detailRows}
</Table>
</Worksheet>
<Worksheet ss:Name="Produtos">
<Table>
${row(cell("Comissões a pagar — produtos"))}
${row(cell(""))}
${itemsRows}
</Table>
</Worksheet>
</Workbook>
`;
}
