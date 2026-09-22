import type { OrderStatus } from "@prisma/client";
import { prisma } from "../../db.js";
import { decToNum } from "../../util/money.js";
import { sellerLabelOrDirect } from "../../util/order-seller-filter.js";
import { orderWhere, type OrdersPdfFilters } from "./orders-pdf.js";
import {
  drawEmptyState,
  drawHeader,
  drawInfoBar,
  drawTableFooter,
  drawTableHeader,
  drawTableRow,
  lineDiscount,
  money,
  orderCode,
  withPdfDoc,
  type PdfTable,
} from "./pdf-common.js";

export type OrderItemsPdfFilters = OrdersPdfFilters & {
  /** Soma quantidades e totais do mesmo produto entre os pedidos filtrados. */
  groupItems?: boolean;
};

const GROUPED_TABLE: PdfTable = {
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

export async function buildOrderItemsPdf(
  filters: OrderItemsPdfFilters,
): Promise<Buffer> {
  const [org, orders] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: filters.organizationId },
      select: { name: true, displayName: true },
    }),
    prisma.order.findMany({
      where: orderWhere(filters),
      orderBy: { createdAt: "asc" },
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

  type ItemRow = {
    code: string;
    name: string;
    qtyUnit: string;
    unit: number;
    discount: number;
    total: number;
  };

  function itemRows(o: (typeof orders)[number]): ItemRow[] {
    return o.items.map((it) => {
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
  }

  function aggregateItemRows(): ItemRow[] {
    const byProduct = new Map<
      string,
      {
        code: string;
        name: string;
        unitLabel: string;
        quantity: number;
        discount: number;
        total: number;
      }
    >();

    for (const o of orders) {
      for (const it of o.items) {
        const unit = decToNum(it.unitPrice);
        const disc =
          lineDiscount({
            unitPrice: it.unitPrice,
            basePrice: it.product?.basePrice,
          }) * it.quantity;
        const total = unit * it.quantity;
        const unitLabel = it.product?.purchaseUnit?.trim() || "UN";
        const code =
          it.product?.sku || it.product?.barcode || it.productId.slice(0, 8);
        const existing = byProduct.get(it.productId);

        if (existing) {
          existing.quantity += it.quantity;
          existing.discount += disc;
          existing.total += total;
        } else {
          byProduct.set(it.productId, {
            code,
            name: it.productName,
            unitLabel,
            quantity: it.quantity,
            discount: disc,
            total,
          });
        }
      }
    }

    return [...byProduct.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((item) => ({
        code: item.code,
        name: item.name,
        qtyUnit: `${item.quantity} ${item.unitLabel}`,
        unit: item.quantity > 0 ? item.total / item.quantity : 0,
        discount: item.discount,
        total: item.total,
      }));
  }

  if (filters.groupItems) {
    return withPdfDoc((doc) => {
      const rows = aggregateItemRows();

      drawHeader(
        doc,
        "Itens de pedidos (agrupado)",
        orgName,
        `${orders.length} pedido(s) · ${new Date().toLocaleString("pt-BR")}`,
      );

      if (rows.length === 0) {
        drawEmptyState(doc, "Nenhum item encontrado.");
        return;
      }

      drawTableHeader(doc, GROUPED_TABLE);
      let sum = 0;
      rows.forEach((row, i) => {
        sum += row.total;
        drawTableRow(
          doc,
          GROUPED_TABLE,
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
                "Itens de pedidos (agrupado, cont.)",
                orgName,
              ),
          },
        );
      });
      drawTableFooter(
        doc,
        `Produtos distintos: ${rows.length}`,
        `Total geral: ${money(sum)}`,
      );
    });
  }

  return withPdfDoc((doc) => {
    if (orders.length === 0) {
      drawHeader(doc, "Itens de pedidos", orgName);
      drawEmptyState(doc, "Nenhum item encontrado.");
      return;
    }
    orders.forEach((o, idx) => {
      if (idx > 0) doc.addPage();
      drawHeader(
        doc,
        `Itens — Pedido ${orderCode(o)}`,
        orgName,
        `${idx + 1} de ${orders.length}`,
      );
      drawInfoBar(doc, [
        { label: "Cliente:", value: o.customer?.name ?? "—" },
        { label: "Vendedor:", value: sellerLabelOrDirect(o.seller?.user.name) },
        {
          label: "Emissão:",
          value: o.createdAt.toLocaleString("pt-BR"),
        },
      ]);
      drawTableHeader(doc, GROUPED_TABLE);
      let sum = 0;
      const rows = itemRows(o);
      rows.forEach((row, i) => {
        sum += row.total;
        drawTableRow(
          doc,
          GROUPED_TABLE,
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
                `Itens — Pedido ${orderCode(o)} (cont.)`,
                orgName,
              ),
          },
        );
      });
      drawTableFooter(doc, `Itens: ${rows.length}`, `Total: ${money(sum)}`);
    });
  });
}

export type { OrderStatus };
