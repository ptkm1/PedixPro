import {
  formatBrazilPhoneDigits,
  formatCnpjMask,
  formatCpfMask,
  formatStructuredAddress,
} from "@pedidos/shared";
import PDFDocument from "pdfkit";
import { decToNum } from "../util/money.js";
import type { OrderPdfCustomer, OrderPdfInput } from "./order-pdf.js";
import {
  money,
  orderCode,
  orderCodeFileSlug,
  shortDateTime,
} from "./reports/pdf-common.js";

/** 80mm thermal roll ≈ 226.77pt wide. */
const MM = 72 / 25.4;
const PAGE_W = 80 * MM;
const MARGIN = 8;
const CONTENT_W = PAGE_W - MARGIN * 2;

function hr(doc: PDFKit.PDFDocument) {
  const y = doc.y;
  doc
    .strokeColor("#000000")
    .lineWidth(0.5)
    .moveTo(MARGIN, y)
    .lineTo(PAGE_W - MARGIN, y)
    .stroke();
  doc.moveDown(0.35);
}

function center(
  doc: PDFKit.PDFDocument,
  text: string,
  opts?: { size?: number; bold?: boolean },
) {
  doc
    .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts?.size ?? 9)
    .fillColor("#000000")
    .text(text, MARGIN, doc.y, {
      width: CONTENT_W,
      align: "center",
    });
}

function line(
  doc: PDFKit.PDFDocument,
  left: string,
  right: string,
  opts?: { bold?: boolean; size?: number },
) {
  const size = opts?.size ?? 8;
  const font = opts?.bold ? "Helvetica-Bold" : "Helvetica";
  const y = doc.y;
  doc.font(font).fontSize(size).fillColor("#000000");
  doc.text(left, MARGIN, y, { width: CONTENT_W * 0.55, lineBreak: false });
  doc.text(right, MARGIN + CONTENT_W * 0.45, y, {
    width: CONTENT_W * 0.55,
    align: "right",
    lineBreak: false,
  });
  doc.y = y + size + 4;
}

function customerPrimaryName(c: OrderPdfCustomer): string {
  return c.legalName?.trim() || c.tradeName?.trim() || c.name.trim() || "—";
}

function orgDisplayName(order: OrderPdfInput): string {
  return order.organization?.name?.trim() || order.organizationName || "—";
}

function writeOrgBlock(doc: PDFKit.PDFDocument, order: OrderPdfInput) {
  const org = order.organization ?? { name: orgDisplayName(order) };
  center(doc, org.name, { size: 10, bold: true });
  if (org.cnpj) {
    center(doc, `CNPJ ${org.cnpj}`, { size: 8 });
  }
  if (org.stateRegistration) {
    center(doc, `I.E. ${org.stateRegistration}`, { size: 7 });
  }
  if (org.address) {
    center(doc, org.address, { size: 7 });
  }
  if (org.complement) {
    center(doc, org.complement, { size: 7 });
  }
}

function writeCustomerBlock(
  doc: PDFKit.PDFDocument,
  customer: OrderPdfCustomer | null,
) {
  doc.font("Helvetica-Bold").fontSize(8).text("CLIENTE", MARGIN, doc.y, {
    width: CONTENT_W,
  });

  if (!customer) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .text("Sem cliente vinculado", MARGIN, doc.y, { width: CONTENT_W });
    return;
  }

  const primary = customerPrimaryName(customer);
  doc.font("Helvetica-Bold").fontSize(9).text(primary, MARGIN, doc.y, {
    width: CONTENT_W,
  });

  const trade = customer.tradeName?.trim();
  if (trade && trade !== primary) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(`Fantasia: ${trade}`, MARGIN, doc.y, { width: CONTENT_W });
  }

  const legal = customer.legalName?.trim();
  if (legal && legal !== primary && legal !== trade) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(`Razão: ${legal}`, MARGIN, doc.y, { width: CONTENT_W });
  }

  const cnpj = customer.cnpj?.replace(/\D/g, "") ?? "";
  const cpf = customer.cpf?.replace(/\D/g, "") ?? "";
  if (cnpj) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(`CNPJ ${formatCnpjMask(cnpj)}`, MARGIN, doc.y, { width: CONTENT_W });
  }
  if (cpf) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(`CPF ${formatCpfMask(cpf)}`, MARGIN, doc.y, { width: CONTENT_W });
  }

  const address = formatStructuredAddress(customer);
  if (address) {
    doc.font("Helvetica").fontSize(8).text(address, MARGIN, doc.y, {
      width: CONTENT_W,
    });
  }
  const note = customer.addressNote?.trim();
  if (note && note !== address) {
    doc.font("Helvetica").fontSize(8).text(note, MARGIN, doc.y, {
      width: CONTENT_W,
    });
  }

  if (customer.phone?.trim()) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(customer.phone.trim(), MARGIN, doc.y, { width: CONTENT_W });
  }
  if (customer.email?.trim()) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(customer.email.trim(), MARGIN, doc.y, { width: CONTENT_W });
  }
}

export function orderPdf80mmFilename(order: {
  id: string;
  orderNumber?: number | null;
}): string {
  return `pedido-${orderCodeFileSlug(order)}-80mm.pdf`;
}

/**
 * Cupom térmico 80mm (largura fixa, altura estimada pelo conteúdo).
 */
export async function buildOrderPdf80mm(order: OrderPdfInput): Promise<Buffer> {
  const code = orderCode(order);
  const total = decToNum(order.totalAmount);
  const comboDiscount = decToNum(order.comboDiscountTotal ?? 0);
  const itemsSubtotal = order.items.reduce(
    (sum, it) => sum + decToNum(it.unitPrice) * it.quantity,
    0,
  );
  const generatedAt = new Date().toLocaleString("pt-BR");
  const payLabel = order.paymentCondition?.label?.trim() || null;
  const showDiscount = comboDiscount > 0;

  const estimatedH = Math.max(
    520,
    300 +
      order.items.length * 44 +
      (order.notes?.trim() ? 80 : 0) +
      (payLabel ? 24 : 0) +
      (showDiscount ? 24 : 0) +
      80,
  );

  const doc = new PDFDocument({
    size: [PAGE_W, estimatedH],
    margin: MARGIN,
    autoFirstPage: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.y = MARGIN;

  if (order.logo) {
    try {
      const maxH = 28;
      const maxW = CONTENT_W * 0.55;
      const imgY = doc.y;
      doc.image(order.logo.buffer, MARGIN + (CONTENT_W - maxW) / 2, imgY, {
        fit: [maxW, maxH],
        align: "center",
        valign: "center",
      });
      doc.y = imgY + maxH + 4;
    } catch {
      // sem logo — segue com nome da org
    }
  }

  writeOrgBlock(doc, order);
  center(doc, "PEDIDO", { size: 10, bold: true });
  center(doc, code.startsWith("#") ? code : `#${code}`, {
    size: 12,
    bold: true,
  });
  doc.moveDown(0.25);
  hr(doc);

  doc.font("Helvetica").fontSize(8).fillColor("#000000");
  doc.text(`Data: ${shortDateTime(order.createdAt)}`, MARGIN, doc.y, {
    width: CONTENT_W,
  });
  doc.text(`Vendedor: ${order.seller.user.name}`, MARGIN, doc.y, {
    width: CONTENT_W,
  });
  const sellerPhone = order.seller.user.phone?.trim()
    ? formatBrazilPhoneDigits(order.seller.user.phone)
    : null;
  if (sellerPhone) {
    doc.text(`Tel. vendedor: ${sellerPhone}`, MARGIN, doc.y, {
      width: CONTENT_W,
    });
  }
  if (payLabel) {
    doc.text(`Pagamento: ${payLabel}`, MARGIN, doc.y, {
      width: CONTENT_W,
    });
  }
  doc.moveDown(0.2);
  hr(doc);

  writeCustomerBlock(doc, order.customer);
  doc.moveDown(0.25);
  hr(doc);

  doc.font("Helvetica-Bold").fontSize(8).text("ITENS", MARGIN, doc.y, {
    width: CONTENT_W,
  });
  doc.moveDown(0.15);

  if (order.items.length === 0) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .text("Nenhum item.", MARGIN, doc.y, { width: CONTENT_W });
  } else {
    for (const item of order.items) {
      const unit = decToNum(item.unitPrice);
      const sub = unit * item.quantity;
      const name = item.productName.trim() || "—";

      doc.font("Helvetica-Bold").fontSize(8).text(name, MARGIN, doc.y, {
        width: CONTENT_W,
      });
      line(doc, `${item.quantity} x ${money(unit)}`, money(sub), { size: 8 });
    }
  }

  doc.moveDown(0.15);
  hr(doc);

  if (showDiscount) {
    line(doc, "Subtotal", money(itemsSubtotal));
    line(doc, "Descontos", `− ${money(comboDiscount)}`);
  }
  line(doc, "TOTAL", money(total), { bold: true, size: 11 });

  if (order.notes?.trim()) {
    doc.moveDown(0.2);
    hr(doc);
    doc.font("Helvetica-Bold").fontSize(8).text("OBSERVAÇÕES", MARGIN, doc.y, {
      width: CONTENT_W,
    });
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(order.notes.trim(), MARGIN, doc.y, { width: CONTENT_W });
  }

  doc.moveDown(0.4);
  hr(doc);
  center(doc, `Gerado em ${generatedAt}`, { size: 7 });
  center(doc, "Obrigado!", { size: 8 });

  doc.end();
  return done;
}
