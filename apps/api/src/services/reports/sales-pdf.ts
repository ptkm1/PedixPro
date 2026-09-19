import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { decToNum } from "../../util/money.js";
import { sellerLabelOrDirect } from "../../util/order-seller-filter.js";
import {
    drawEmptyState,
    drawHeader,
    drawInfoBar,
    drawTableFooter,
    drawTableHeader,
    drawTableRow,
    ensureSpace,
    lineDiscount,
    money,
    orderCode,
    shortDateTime,
    shortName,
    withPdfDoc,
    type PdfTable,
} from "./pdf-common.js";

export type SalesPdfFilters = {
  organizationId: string;
  sellerId?: string;
  /** Quando definido, filtra por estes vendedores (relatórios mobile/equipe). */
  sellerIds?: string[];
  from?: string;
  to?: string;
  /** Lista consolidada de pedidos em vez de uma seção por pedido. */
  groupOrders?: boolean;
};

const ITEMS_TABLE: PdfTable = {
  columns: [
    { key: "code", label: "Código", width: 72 },
    { key: "name", label: "Produto", width: 180 },
    { key: "qtyUnit", label: "Qtd/un", width: 55, align: "right" },
    { key: "unit", label: "Vlr unit.", width: 75, align: "right" },
    { key: "discount", label: "Desc.", width: 70, align: "right" },
    { key: "total", label: "Val total", width: 95, align: "right" },
  ],
  rowHeight: 20,
};

const ORDERS_LIST_TABLE: PdfTable = {
  columns: [
    { key: "code", label: "Código", width: 58 },
    { key: "date", label: "Data", width: 90 },
    { key: "customer", label: "Cliente", width: 130 },
    { key: "seller", label: "Vendedor", width: 110 },
    { key: "items", label: "Itens", width: 40, align: "right" },
    { key: "total", label: "Total", width: 119, align: "right" },
  ],
  rowHeight: 22,
};

function salesWhere(filters: SalesPdfFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    organizationId: filters.organizationId,
    status: "CONFIRMED",
  };
  if (filters.sellerIds?.length) {
    where.sellerId = { in: filters.sellerIds };
  } else if (filters.sellerId) {
    where.sellerId = filters.sellerId;
  }
  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.from) createdAt.gte = new Date(filters.from);
  if (filters.to) createdAt.lte = new Date(filters.to);
  if (Object.keys(createdAt).length) where.createdAt = createdAt;
  return where;
}

export async function buildSalesDetailedPdf(
  filters: SalesPdfFilters,
): Promise<Buffer> {
  const [org, orders] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: filters.organizationId },
      select: { name: true, displayName: true },
    }),
    prisma.order.findMany({
      where: salesWhere(filters),
      orderBy: { createdAt: "desc" },
      include: {
        seller: { include: { user: { select: { name: true } } } },
        customer: { select: { name: true } },
        items: {
          include: {
            product: {
              select: {
                sku: true,
                barcode: true,
                purchaseUnit: true,
                basePrice: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const orgName = org?.displayName || org?.name || "";
  const generatedAt = new Date().toLocaleString("pt-BR");

  if (filters.groupOrders) {
    return withPdfDoc((doc) => {
      drawHeader(
        doc,
        "Vendas detalhadas — Lista de pedidos",
        orgName,
        `${orders.length} pedido(s) · Gerado em ${generatedAt}`,
      );

      if (orders.length === 0) {
        drawEmptyState(doc, "Nenhum pedido confirmado no período.");
        return;
      }

      drawTableHeader(doc, ORDERS_LIST_TABLE);

      let sum = 0;
      orders.forEach((o, index) => {
        const amount = decToNum(o.totalAmount);
        sum += amount;
        drawTableRow(
          doc,
          ORDERS_LIST_TABLE,
          {
            code: orderCode(o),
            date: shortDateTime(o.createdAt),
            customer: shortName(o.customer?.name ?? "—", 18),
            seller: shortName(sellerLabelOrDirect(o.seller?.user.name), 16),
            items: String(o.items.length),
            total: money(amount),
          },
          {
            index,
            onNewPage: () =>
              drawHeader(
                doc,
                "Vendas detalhadas — Lista de pedidos (cont.)",
                orgName,
                `${orders.length} pedido(s)`,
              ),
          },
        );
      });

      drawTableFooter(
        doc,
        `Total de pedidos: ${orders.length}`,
        `Total geral: ${money(sum)}`,
      );
    });
  }

  return withPdfDoc((doc) => {
    if (orders.length === 0) {
      drawHeader(doc, "Vendas detalhadas", orgName, `Gerado em ${generatedAt}`);
      drawEmptyState(doc, "Nenhum pedido confirmado no período.");
      return;
    }

    let grandSum = 0;

    orders.forEach((o, idx) => {
      if (idx > 0) doc.addPage();

      const orderTotal = decToNum(o.totalAmount);
      grandSum += orderTotal;

      const meta =
        idx === 0
          ? `${orders.length} pedido(s) · Gerado em ${generatedAt}`
          : `${idx + 1} de ${orders.length}`;

      drawHeader(
        doc,
        `Vendas detalhadas — Pedido ${orderCode(o)}`,
        orgName,
        meta,
      );

      drawInfoBar(doc, [
        { label: "Cliente:", value: o.customer?.name ?? "—" },
        { label: "Vendedor:", value: sellerLabelOrDirect(o.seller?.user.name) },
        { label: "Emissão:", value: shortDateTime(o.createdAt) },
        { label: "Total do pedido:", value: money(orderTotal) },
      ]);

      const rows = o.items.map((it) => {
        const unit = decToNum(it.unitPrice);
        const disc = lineDiscount({
          unitPrice: it.unitPrice,
          basePrice: it.product?.basePrice,
        });
        const unitLabel = it.product?.purchaseUnit?.trim() || "UN";
        return {
          code:
            it.product?.sku || it.product?.barcode || it.productId.slice(0, 8),
          name: it.productName,
          qtyUnit: `${it.quantity} ${unitLabel}`,
          unit,
          discount: disc * it.quantity,
          total: unit * it.quantity,
        };
      });

      drawTableHeader(doc, ITEMS_TABLE);
      let itemsSum = 0;
      rows.forEach((row, i) => {
        itemsSum += row.total;
        drawTableRow(
          doc,
          ITEMS_TABLE,
          {
            code: row.code,
            name: row.name,
            qtyUnit: row.qtyUnit,
            unit: money(row.unit),
            discount: money(row.discount),
            total: money(row.total),
          },
          {
            index: i,
            onNewPage: () =>
              drawHeader(
                doc,
                `Vendas detalhadas — Pedido ${orderCode(o)} (cont.)`,
                orgName,
              ),
          },
        );
      });

      drawTableFooter(doc, `Itens: ${rows.length}`, `Total: ${money(itemsSum)}`);
    });

    ensureSpace(doc, 36);
    doc.moveDown(0.6);
    drawTableFooter(
      doc,
      `Total de pedidos: ${orders.length}`,
      `Total geral: ${money(grandSum)}`,
    );
  });
}
