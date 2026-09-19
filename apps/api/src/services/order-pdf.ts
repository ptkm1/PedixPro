import {
  APP_BRAND_PRIMARY,
  formatCnpjMask,
  formatCpfMask,
  formatStructuredAddress,
} from "@pedidos/shared";
import { decToNum } from "../util/money.js";
import { sellerLabelOrDirect } from "../util/order-seller-filter.js";
import type { OrderPdfLogo } from "./order-pdf-logo.js";
import {
  COLORS,
  PAGE,
  money,
  orderCode,
  orderCodeFileSlug,
  shortDateTime,
  withPdfDoc,
} from "./reports/pdf-common.js";

export type OrderPdfCustomer = {
  name: string;
  email?: string | null;
  phone?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  documentType?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  stateRegistration?: string | null;
  buyerName?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  addressNote?: string | null;
};

/** Dados do emitente (Organization / white-label). */
export type OrderPdfOrganization = {
  name: string;
  cnpj?: string | null;
  stateRegistration?: string | null;
  address?: string | null;
  complement?: string | null;
};

export type OrderPdfPaymentCondition = {
  name: string;
  days: number;
  label: string;
};

export type OrderPdfInput = {
  id: string;
  orderNumber?: number | null;
  totalAmount: unknown;
  comboDiscountTotal?: unknown;
  notes: string | null;
  createdAt: Date;
  /** @deprecated prefer `organization.name` */
  organizationName: string;
  organization: OrderPdfOrganization;
  paymentCondition?: OrderPdfPaymentCondition | null;
  logo?: OrderPdfLogo | null;
  seller: { user: { name: string; email?: string | null } } | null;
  customer: OrderPdfCustomer | null;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: unknown;
    product?: {
      sku: string | null;
      barcode?: string | null;
      purchaseUnit?: string | null;
      grossWeightKg?: unknown;
      netWeightKg?: unknown;
      basePrice?: unknown;
    } | null;
  }>;
};

export function orderPdfFilename(order: {
  id: string;
  orderNumber?: number | null;
}): string {
  return `pedido-${orderCodeFileSlug(order)}.pdf`;
}

const COLS = {
  code: { x: PAGE.left, w: 68 },
  product: { x: PAGE.left + 68, w: 190 },
  unitLabel: { x: PAGE.left + 258, w: 36 },
  qty: { x: PAGE.left + 294, w: 44 },
  unit: { x: PAGE.left + 338, w: 72 },
  discount: { x: PAGE.left + 410, w: 60 },
  sub: { x: PAGE.left + 470, w: 77 },
} as const;

const CONTENT_BOTTOM = 52;
const BRAND = APP_BRAND_PRIMARY;

function pageBottom(doc: PDFKit.PDFDocument) {
  return doc.page.height - CONTENT_BOTTOM;
}

/**
 * Rodapé fixo no fim da página.
 * PDFKit chama addPage() se y + lineHeight > page.height - margins.bottom.
 * Dois `.text()` nessa condição = exatamente +2 páginas (quase) em branco —
 * sintomas do romaneio. Desliga a margem inferior só durante o desenho.
 */
function drawPageFooter(
  doc: PDFKit.PDFDocument,
  leftText: string,
  rightText: string,
) {
  const prevY = doc.y;
  const prevBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  const textH = 10;
  const textY = doc.page.height - prevBottom - textH;
  const lineY = textY - 6;
  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .moveTo(PAGE.left, lineY)
    .lineTo(PAGE.right, lineY)
    .stroke();
  doc
    .fillColor(COLORS.muted)
    .fontSize(8)
    .font("Helvetica")
    .text(leftText, PAGE.left, textY, {
      width: PAGE.width / 2,
      lineBreak: false,
      height: textH,
    });
  doc.text(rightText, PAGE.left, textY, {
    width: PAGE.width,
    align: "right",
    lineBreak: false,
    ellipsis: true,
    height: textH,
  });

  doc.page.margins.bottom = prevBottom;
  doc.y = prevY;
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  needed: number,
  redrawHeader?: () => void,
) {
  if (doc.y + needed <= pageBottom(doc)) return;
  doc.addPage();
  redrawHeader?.();
}

function drawBand(
  doc: PDFKit.PDFDocument,
  y: number,
  h: number,
  fill: string,
) {
  doc.rect(PAGE.left, y, PAGE.width, h).fill(fill);
}

function drawSectionLabel(
  doc: PDFKit.PDFDocument,
  label: string,
  x: number,
  y: number,
) {
  doc
    .fillColor(COLORS.muted)
    .fontSize(8)
    .font("Helvetica-Bold")
    .text(label.toUpperCase(), x, y, {
      lineBreak: false,
      characterSpacing: 0.5,
    });
}

function drawMetaPair(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  doc
    .fillColor(COLORS.muted)
    .fontSize(8)
    .font("Helvetica")
    .text(label, x, y, { width, lineBreak: false });
  doc
    .fillColor(COLORS.text)
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(value, x, y + 12, { width, lineBreak: false, ellipsis: true });
}

function drawItemsTableHeader(doc: PDFKit.PDFDocument) {
  ensureSpace(doc, 28);
  const y = doc.y;
  const h = 22;
  drawBand(doc, y, h, COLORS.headerBg);
  doc.fillColor(COLORS.headerFg).fontSize(8).font("Helvetica-Bold");

  const pad = 6;
  doc.text("Código", COLS.code.x + pad, y + 7, {
    width: COLS.code.w - pad * 2,
    lineBreak: false,
  });
  doc.text("Produto", COLS.product.x + pad, y + 7, {
    width: COLS.product.w - pad * 2,
    lineBreak: false,
  });
  doc.text("Un.", COLS.unitLabel.x + pad, y + 7, {
    width: COLS.unitLabel.w - pad * 2,
    align: "center",
    lineBreak: false,
  });
  doc.text("Qtd", COLS.qty.x + pad, y + 7, {
    width: COLS.qty.w - pad * 2,
    align: "right",
    lineBreak: false,
  });
  doc.text("Preço unit.", COLS.unit.x + pad, y + 7, {
    width: COLS.unit.w - pad * 2,
    align: "right",
    lineBreak: false,
  });
  doc.text("Desc.", COLS.discount.x + pad, y + 7, {
    width: COLS.discount.w - pad * 2,
    align: "right",
    lineBreak: false,
  });
  doc.text("Subtotal", COLS.sub.x + pad, y + 7, {
    width: COLS.sub.w - pad * 2,
    align: "right",
    lineBreak: false,
  });

  doc.y = y + h;
  doc.fillColor(COLORS.text).font("Helvetica");
}

function drawItemRow(
  doc: PDFKit.PDFDocument,
  item: OrderPdfInput["items"][number],
  index: number,
) {
  const unit = decToNum(item.unitPrice);
  const sub = unit * item.quantity;
  const basePrice = item.product?.basePrice ? decToNum(item.product.basePrice) : unit;
  const discountPercent =
    basePrice > unit && basePrice > 0
      ? ((basePrice - unit) / basePrice) * 100
      : 0;
  const code =
    item.product?.sku?.trim() ||
    item.product?.barcode?.trim() ||
    item.productName.trim().slice(0, 8) ||
    "—";
  const unitLabel = item.product?.purchaseUnit?.trim() || "UN";
  const name = item.productName.trim() || "—";
  const pad = 6;

  doc.fontSize(9).font("Helvetica");
  const nameH = Math.max(
    14,
    doc.heightOfString(name, { width: COLS.product.w - pad * 2 }),
  );
  const rowH = Math.max(22, nameH + 10);

  ensureSpace(doc, rowH + 2, () => drawItemsTableHeader(doc));

  const y = doc.y;
  const bg = index % 2 === 0 ? COLORS.rowEven : COLORS.rowOdd;
  drawBand(doc, y, rowH, bg);
  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.4)
    .moveTo(PAGE.left, y + rowH)
    .lineTo(PAGE.right, y + rowH)
    .stroke();

  const textY = y + 6;
  doc.fillColor(COLORS.text).fontSize(9).font("Helvetica");
  doc
    .fillColor(COLORS.muted)
    .fontSize(8)
    .text(code, COLS.code.x + pad, textY, {
      width: COLS.code.w - pad * 2,
      lineBreak: false,
      ellipsis: true,
      height: rowH - 8,
    });
  doc.text(name, COLS.product.x + pad, textY, {
    width: COLS.product.w - pad * 2,
    height: rowH - 8,
    ellipsis: true,
  });
  doc
    .fillColor(COLORS.text)
    .fontSize(8)
    .text(unitLabel, COLS.unitLabel.x + pad, textY, {
      width: COLS.unitLabel.w - pad * 2,
      align: "center",
      lineBreak: false,
      ellipsis: true,
      height: rowH - 8,
    });
  doc
    .fillColor(COLORS.text)
    .fontSize(9)
    .text(String(item.quantity), COLS.qty.x + pad, textY, {
      width: COLS.qty.w - pad * 2,
      align: "right",
      lineBreak: false,
    });
  doc.text(money(unit), COLS.unit.x + pad, textY, {
    width: COLS.unit.w - pad * 2,
    align: "right",
    lineBreak: false,
  });
  doc.text(formatPercent(discountPercent), COLS.discount.x + pad, textY, {
    width: COLS.discount.w - pad * 2,
    align: "right",
    lineBreak: false,
  });
  doc.font("Helvetica-Bold").text(money(sub), COLS.sub.x + pad, textY, {
    width: COLS.sub.w - pad * 2,
    align: "right",
    lineBreak: false,
  });

  doc.y = y + rowH;
  doc.font("Helvetica").fillColor(COLORS.text);
}

function customerDocumentLine(c: OrderPdfCustomer): string | null {
  const cnpj = c.cnpj?.replace(/\D/g, "") ?? "";
  const cpf = c.cpf?.replace(/\D/g, "") ?? "";
  const parts: string[] = [];
  if (cnpj) parts.push(`CNPJ ${formatCnpjMask(cnpj)}`);
  if (cpf) parts.push(`CPF ${formatCpfMask(cpf)}`);
  if (parts.length === 0 && c.documentType === "CNPJ" && c.cnpj?.trim()) {
    parts.push(`CNPJ ${c.cnpj.trim()}`);
  }
  if (parts.length === 0 && c.documentType === "CPF" && c.cpf?.trim()) {
    parts.push(`CPF ${c.cpf.trim()}`);
  }
  return parts.length > 0 ? parts.join("  ·  ") : null;
}

function customerPrimaryName(c: OrderPdfCustomer): string {
  return c.legalName?.trim() || c.tradeName?.trim() || c.name.trim() || "—";
}

function buildCustomerDetailLines(c: OrderPdfCustomer): Array<{
  label?: string;
  text: string;
  primary?: boolean;
}> {
  const lines: Array<{ label?: string; text: string; primary?: boolean }> = [];
  const primary = customerPrimaryName(c);
  lines.push({ text: primary, primary: true });

  const trade = c.tradeName?.trim();
  if (trade && trade !== primary) {
    lines.push({ label: "Nome fantasia", text: trade });
  }

  const legal = c.legalName?.trim();
  if (legal && legal !== primary && legal !== trade) {
    lines.push({ label: "Razão social", text: legal });
  }

  const cadastro = c.name.trim();
  if (
    cadastro &&
    cadastro !== primary &&
    cadastro !== trade &&
    cadastro !== legal
  ) {
    lines.push({ label: "Nome", text: cadastro });
  }

  const docLine = customerDocumentLine(c);
  if (docLine) lines.push({ text: docLine });
  if (c.stateRegistration?.trim()) {
    lines.push({ label: "I.E.", text: c.stateRegistration.trim() });
  }
  if (c.buyerName?.trim()) {
    lines.push({ label: "Comprador", text: c.buyerName.trim() });
  }

  const structured = formatStructuredAddress(c);
  if (structured) lines.push({ label: "Endereço", text: structured });
  const note = c.addressNote?.trim();
  if (note && note !== structured) {
    lines.push({
      label: structured ? "Complemento" : "Endereço",
      text: note,
    });
  }

  const comm: string[] = [];
  if (c.phone?.trim()) comm.push(c.phone.trim());
  if (c.email?.trim()) comm.push(c.email.trim());
  if (comm.length) lines.push({ label: "Contato", text: comm.join("  ·  ") });

  return lines;
}

function drawInfoCard(
  doc: PDFKit.PDFDocument,
  label: string,
  lines: Array<{ label?: string; text: string; primary?: boolean }>,
) {
  const padX = 12;
  const padY = 10;
  const innerW = PAGE.width - padX * 2;

  doc.fontSize(11).font("Helvetica-Bold");
  let contentH = 18;
  for (const line of lines) {
    const size = line.primary ? 11 : 9;
    const font = line.primary ? "Helvetica-Bold" : "Helvetica";
    doc.font(font).fontSize(size);
    const prefix = line.label ? `${line.label}: ` : "";
    const h = doc.heightOfString(prefix + line.text, { width: innerW });
    contentH += Math.max(line.primary ? 16 : 13, h + 2);
  }
  contentH += padY;

  ensureSpace(doc, contentH + 8);
  const top = doc.y;
  doc
    .roundedRect(PAGE.left, top, PAGE.width, contentH, 5)
    .fillAndStroke("#f8fafc", COLORS.border);
  doc.rect(PAGE.left, top, 3, contentH).fill(BRAND);

  drawSectionLabel(doc, label, PAGE.left + padX, top + padY);
  let ty = top + padY + 16;

  for (const line of lines) {
    const size = line.primary ? 11 : 9;
    const font = line.primary ? "Helvetica-Bold" : "Helvetica";
    const full = line.label ? `${line.label}: ${line.text}` : line.text;
    doc.font(font).fontSize(size);
    const h = Math.max(
      line.primary ? 14 : 12,
      doc.heightOfString(full, { width: innerW }),
    );
    doc
      .fillColor(COLORS.text)
      .font(font)
      .fontSize(size)
      .text(full, PAGE.left + padX, ty, { width: innerW, height: h + 2 });
    ty += h + 2;
  }

  doc.y = top + contentH + 14;
  doc.font("Helvetica").fillColor(COLORS.text);
}

function drawCustomerBlock(
  doc: PDFKit.PDFDocument,
  customer: OrderPdfCustomer | null,
) {
  const lines = customer
    ? buildCustomerDetailLines(customer)
    : [{ text: "Sem cliente vinculado", primary: true as const }];
  drawInfoCard(doc, "Cliente", lines);
}

function drawHeaderLogo(
  doc: PDFKit.PDFDocument,
  logo: OrderPdfLogo | null | undefined,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
): number {
  if (!logo) return 0;
  try {
    doc.image(logo.buffer, x, y, {
      fit: [boxW, boxH],
      align: "center",
      valign: "center",
    });
    return boxW + 10;
  } catch {
    return 0;
  }
}

function orgDisplayName(order: OrderPdfInput): string {
  return order.organization?.name?.trim() || order.organizationName || "—";
}

function formatQty(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatWeight(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} kg`;
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`;
}

function paymentTableLabel(
  paymentCondition: OrderPdfInput["paymentCondition"],
): string {
  if (!paymentCondition) return "—";
  return paymentCondition.days > 0 ? "A prazo" : "À vista";
}

function drawLabeledGridBox(
  doc: PDFKit.PDFDocument,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    sideLabel: string;
    rows: Array<[string, string, string?, string?]>;
  },
) {
  const sideW = 26;
  const bodyX = opts.x + sideW;
  const bodyW = opts.width - sideW;
  const rowH = opts.height / Math.max(opts.rows.length, 1);

  doc
    .roundedRect(opts.x, opts.y, opts.width, opts.height, 6)
    .strokeColor(COLORS.border)
    .lineWidth(0.8)
    .stroke();
  doc
    .moveTo(bodyX, opts.y)
    .lineTo(bodyX, opts.y + opts.height)
    .stroke();
  doc.save();
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.text)
    .rotate(-90, { origin: [opts.x + sideW / 2, opts.y + opts.height / 2] })
    .text(
      opts.sideLabel,
      opts.x + sideW / 2 - opts.height / 2,
      opts.y + opts.height / 2 - 6,
      {
        width: opts.height,
        align: "center",
        lineBreak: false,
      },
    );
  doc.restore();

  opts.rows.forEach((row, index) => {
    const rowY = opts.y + index * rowH;
    if (index > 0) {
      doc
        .moveTo(bodyX, rowY)
        .lineTo(opts.x + opts.width, rowY)
        .strokeColor("#eef2f7")
        .lineWidth(0.4)
        .stroke();
    }

    const leftX = bodyX + 8;
    const rightX = bodyX + bodyW / 2 + 8;
    const textY = rowY + 8;
    const leftW = bodyW / 2 - 14;
    const rightW = bodyW / 2 - 14;

    doc
      .fillColor(COLORS.text)
      .font("Helvetica")
      .fontSize(8.5)
      .text(`${row[0]} ${row[1]}`, leftX, textY, {
        width: leftW,
        lineBreak: false,
        ellipsis: true,
      });

    if (row[2] && row[3]) {
      doc.text(`${row[2]} ${row[3]}`, rightX, textY, {
        width: rightW,
        align: "right",
        lineBreak: false,
        ellipsis: true,
      });
    }
  });
}

export async function buildOrderPdf(order: OrderPdfInput): Promise<Buffer> {
  return withPdfDoc((doc) => {
    drawOrderPdfContents(doc, order);
  });
}

export function drawOrderPdfContents(
  doc: PDFKit.PDFDocument,
  order: OrderPdfInput,
) {
  const code = orderCode(order);
  const total = decToNum(order.totalAmount);
  const comboDiscount = decToNum(order.comboDiscountTotal ?? 0);
  const itemsSubtotal = order.items.reduce(
    (sum, it) => sum + decToNum(it.unitPrice) * it.quantity,
    0,
  );
  const totalQty = order.items.reduce((sum, it) => sum + it.quantity, 0);
  const grossTotal = order.items.reduce((sum, it) => {
    const basePrice = it.product?.basePrice ? decToNum(it.product.basePrice) : decToNum(it.unitPrice);
    return sum + basePrice * it.quantity;
  }, 0);
  const grossWeight = order.items.reduce((sum, it) => {
    const itemWeight = it.product?.grossWeightKg
      ? decToNum(it.product.grossWeightKg) * it.quantity
      : 0;
    return sum + itemWeight;
  }, 0);
  const netWeight = order.items.reduce((sum, it) => {
    const itemWeight = it.product?.netWeightKg
      ? decToNum(it.product.netWeightKg) * it.quantity
      : 0;
    return sum + itemWeight;
  }, 0);
  const generatedAt = new Date().toLocaleString("pt-BR");
  const codeLabel = code.startsWith("#") ? code : `#${code}`;
  const orgName = orgDisplayName(order);
  const org = order.organization ?? { name: orgName };
  const payLabel = order.paymentCondition?.label?.trim() || null;
  const showDiscount = comboDiscount > 0;
  const showSubtotal = showDiscount || Math.abs(itemsSubtotal - total) > 0.009;
  const totalDiscount = Math.max(0, grossTotal - total);

  const hasExtraOrg =
    Boolean(org.cnpj) ||
    Boolean(org.stateRegistration) ||
    Boolean(org.address) ||
    Boolean(org.complement);

  const headerH = hasExtraOrg ? 78 : 62;
  const headerY = 24;
  doc
    .roundedRect(PAGE.left, headerY, PAGE.width, headerH, 5)
    .fillAndStroke("#f8fafc", COLORS.border);
  doc.rect(PAGE.left, headerY, 4, headerH).fill(BRAND);

  const logoBox = { w: 48, h: 40 };
  const logoX = PAGE.left + 14;
  const logoY = headerY + 11;
  const textOffset = drawHeaderLogo(
    doc,
    order.logo,
    logoX,
    logoY,
    logoBox.w,
    logoBox.h,
  );
  const textX = logoX + (textOffset || 0);
  const textW = PAGE.width - (textX - PAGE.left) - 130;

  doc
    .fillColor(COLORS.muted)
    .fontSize(8)
    .font("Helvetica-Bold")
    .text("EMITENTE", textX, headerY + 8, {
      width: Math.max(80, textW),
      lineBreak: false,
      characterSpacing: 0.4,
    });
  doc
    .fillColor(COLORS.text)
    .fontSize(13)
    .font("Helvetica-Bold")
    .text(orgName, textX, headerY + 20, {
      width: Math.max(80, textW),
      lineBreak: false,
      ellipsis: true,
    });

  let detailY = headerY + 38;
  doc.fillColor(COLORS.muted).fontSize(8).font("Helvetica");
  const detailParts: string[] = [];
  if (org.cnpj) detailParts.push(`CNPJ ${org.cnpj}`);
  if (org.stateRegistration) detailParts.push(`I.E. ${org.stateRegistration}`);
  if (detailParts.length) {
    doc.text(detailParts.join("  ·  "), textX, detailY, {
      width: Math.max(80, textW),
      lineBreak: false,
      ellipsis: true,
    });
    detailY += 12;
  }
  if (org.address) {
    const addr =
      org.complement && !org.address.includes(org.complement)
        ? `${org.address} · ${org.complement}`
        : org.address;
    doc.text(addr, textX, detailY, {
      width: Math.max(80, textW),
      lineBreak: false,
      ellipsis: true,
    });
  }

  doc
    .fillColor(COLORS.muted)
    .fontSize(8)
    .font("Helvetica")
    .text("Pedido Nº", PAGE.right - 120, headerY + 12, {
      width: 106,
      align: "right",
      lineBreak: false,
    });
  doc
    .fillColor(COLORS.text)
    .fontSize(18)
    .font("Helvetica-Bold")
    .text(codeLabel, PAGE.right - 120, headerY + 26, {
      width: 106,
      align: "right",
      lineBreak: false,
    });
  doc
    .fillColor(COLORS.muted)
    .fontSize(8)
    .font("Helvetica")
    .text(shortDateTime(order.createdAt), PAGE.right - 120, headerY + 48, {
      width: 106,
      align: "right",
      lineBreak: false,
    });

  doc.y = headerY + headerH + 14;

  const metaY = doc.y;
  const colGap = 12;
  const colCount = payLabel ? 2 : 1;
  const colW = (PAGE.width - colGap * (colCount - 1)) / colCount;

  const sellerName = sellerLabelOrDirect(order.seller?.user.name);
  const sellerEmail = order.seller?.user.email?.trim();
  const sellerValue = sellerEmail
    ? `${sellerName}  ·  ${sellerEmail}`
    : sellerName;
  drawMetaPair(doc, "Vendedor", sellerValue, PAGE.left, metaY, colW);

  if (payLabel) {
    drawMetaPair(
      doc,
      "Condição de pagamento",
      payLabel,
      PAGE.left + colW + colGap,
      metaY,
      colW,
    );
  }
  doc.y = metaY + 34;

  doc
    .strokeColor(COLORS.border)
    .lineWidth(0.6)
    .moveTo(PAGE.left, doc.y)
    .lineTo(PAGE.right, doc.y)
    .stroke();
  doc.moveDown(0.7);

  drawCustomerBlock(doc, order.customer);

  drawSectionLabel(doc, "Itens do pedido", PAGE.left, doc.y);
  doc.y += 14;
  drawItemsTableHeader(doc);

  if (order.items.length === 0) {
    ensureSpace(doc, 36);
    const emptyY = doc.y;
    drawBand(doc, emptyY, 32, "#f8fafc");
    doc
      .fillColor(COLORS.muted)
      .fontSize(9)
      .font("Helvetica")
      .text("Nenhum item neste pedido.", PAGE.left + 8, emptyY + 10, {
        width: PAGE.width - 16,
        align: "center",
        lineBreak: false,
      });
    doc.y = emptyY + 36;
    doc.fillColor(COLORS.text);
  } else {
    order.items.forEach((item, i) => drawItemRow(doc, item, i));
  }

  const notesText = order.notes?.trim() || "";
  const notesH = notesText
    ? Math.max(18, doc.heightOfString(notesText, { width: PAGE.width - 20 }))
    : 0;
  ensureSpace(doc, 94 + (notesText ? notesH + 24 : 0));
  doc.moveDown(0.6);
  const boxesY = doc.y;
  const boxGap = 8;
  const boxW = (PAGE.width - boxGap) / 2;
  const boxH = 78;

  drawLabeledGridBox(doc, {
    x: PAGE.left,
    y: boxesY,
    width: boxW,
    height: boxH,
    sideLabel: "Condições",
    rows: [
      ["Tabela:", paymentTableLabel(order.paymentCondition), "Desc. 1:", "0,00 %"],
      ["Plano:", payLabel || "—", "Desc. 2:", "0,00 %"],
      ["Entrega:", "—", "Desc. 3:", "0,00 %"],
    ],
  });

  drawLabeledGridBox(doc, {
    x: PAGE.left + boxW + boxGap,
    y: boxesY,
    width: boxW,
    height: boxH,
    sideLabel: "Totais",
    rows: [
      [
        "Total itens:",
        String(order.items.length),
        "Total bruto:",
        money(grossTotal),
      ],
      [
        "Peso bruto:",
        grossWeight > 0 ? formatWeight(grossWeight) : "0,000 kg",
        "Total desc:",
        money(totalDiscount),
      ],
      [
        "Peso líq.:",
        netWeight > 0 ? formatWeight(netWeight) : "0,000 kg",
        "Total líq.:",
        money(total),
      ],
    ],
  });

  doc.y = boxesY + boxH + 10;
  doc.font("Helvetica").fillColor(COLORS.text);

  if (notesText) {
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Observações:", PAGE.left, doc.y, {
        width: 80,
        lineBreak: false,
      });
    doc
      .font("Helvetica")
      .text(notesText, PAGE.left + 84, doc.y - 1, {
        width: PAGE.width - 84,
      });
    doc.moveDown(0.3);
  } else if (showSubtotal || totalQty > 0) {
    doc
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(
        `Quantidade total: ${formatQty(totalQty)}${payLabel ? `  ·  ${payLabel}` : ""}`,
        PAGE.left,
        doc.y,
        { width: PAGE.width },
      );
    doc.fillColor(COLORS.text);
  }

  drawPageFooter(doc, `Gerado em ${generatedAt}`, orgName);
}
