/**
 * XML NF-e provisório a partir de pedido confirmado.
 * TODO futuro: autorização SEFAZ / certificado digital.
 */
import { prisma } from "../../db.js";
import {
  nfeCest,
  nfeCProd,
  nfeExtIpi,
  nfeGtin,
} from "../../fiscal/nfe-prod-fields.js";
import { decToNum } from "../../util/money.js";
import { sellerLabelOrDirect } from "../../util/order-seller-filter.js";

export class NfeXmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NfeXmlError";
  }
}

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function onlyDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function fmtMoney(n: number): string {
  return n.toFixed(2);
}

function orderCode(order: { id: string; orderNumber: number | null }): string {
  if (order.orderNumber != null) return String(order.orderNumber);
  return "—";
}

function orderFileSlug(order: {
  id: string;
  orderNumber: number | null;
}): string {
  if (order.orderNumber != null) return String(order.orderNumber);
  return order.id;
}

/** Número provisório da NF a partir do orderNumber ou hash estável do id. */
function provisionalNnf(order: {
  id: string;
  orderNumber: number | null;
}): number {
  if (order.orderNumber != null && order.orderNumber > 0) {
    return order.orderNumber;
  }
  let hash = 0;
  for (let i = 0; i < order.id.length; i++) {
    hash = (hash * 31 + order.id.charCodeAt(i)) >>> 0;
  }
  return hash % 999_999_999 || 1;
}

export async function buildNfeXml(
  organizationId: string,
  orderId: string,
): Promise<{ xml: string; filename: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    include: {
      organization: true,
      customer: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              barcode: true,
              ncm: true,
              ncmException: true,
              nfeOrigin: true,
              fiscalGtin: true,
              fiscalCest: true,
              fiscalUnit: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!order) throw new NfeXmlError("Pedido não encontrado.");
  if (order.status !== "CONFIRMED") {
    throw new NfeXmlError("Somente pedidos confirmados geram XML NF-e.");
  }

  const org = order.organization;
  const customer = order.customer;
  const emitName = org.displayName?.trim() || org.name;
  const emitCnpj = onlyDigits(org.cnpj) || "00000000000000";
  const emitIe = org.stateRegistration?.trim() || "ISENTO";

  const destName =
    customer?.legalName?.trim() ||
    customer?.tradeName?.trim() ||
    customer?.name ||
    "CONSUMIDOR";
  const destDoc =
    onlyDigits(customer?.cnpj) || onlyDigits(customer?.cpf) || "00000000000";
  const destIe = customer?.stateRegistration?.trim() || "ISENTO";

  const nNF = provisionalNnf(order);
  const dhEmi = order.createdAt.toISOString().replace(/\.\d{3}Z$/, "-03:00");
  const code = orderCode(order);
  const fileSlug = orderFileSlug(order);

  let vProd = 0;
  const detXml = order.items
    .map((it, idx) => {
      const qCom = it.quantity;
      const vUnCom = decToNum(it.unitPrice);
      const vItem = qCom * vUnCom;
      vProd += vItem;
      const ncm = (it.product.ncm ?? "00000000")
        .replace(/\D/g, "")
        .padEnd(8, "0")
        .slice(0, 8);
      const orig = it.product.nfeOrigin ?? 0;
      const cProd = nfeCProd({
        sku: it.product.sku,
        barcode: it.product.barcode,
        productId: it.productId,
        lineNumber: idx + 1,
      });
      const gtin = nfeGtin(it.product.fiscalGtin ?? it.product.barcode);
      const cest = nfeCest(it.product.fiscalCest);
      const extIpi = nfeExtIpi(it.product.ncmException);
      const unit = it.product.fiscalUnit?.trim() || "UN";
      const cestXml = cest ? `\n        <CEST>${cest}</CEST>` : "";
      const extIpiXml = extIpi
        ? `\n        <EXTIPI>${esc(extIpi)}</EXTIPI>`
        : "";
      return `    <det nItem="${idx + 1}">
      <prod>
        <cProd>${esc(cProd)}</cProd>
        <cEAN>${esc(gtin)}</cEAN>
        <xProd>${esc(it.productName || it.product.name)}</xProd>
        <NCM>${esc(ncm)}</NCM>${cestXml}${extIpiXml}
        <CFOP>5102</CFOP>
        <uCom>${esc(unit)}</uCom>
        <qCom>${qCom}.0000</qCom>
        <vUnCom>${fmtMoney(vUnCom)}</vUnCom>
        <vProd>${fmtMoney(vItem)}</vProd>
        <cEANTrib>${esc(gtin)}</cEANTrib>
        <uTrib>${esc(unit)}</uTrib>
        <qTrib>${qCom}.0000</qTrib>
        <vUnTrib>${fmtMoney(vUnCom)}</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        <ICMS>
          <ICMS00>
            <orig>${orig}</orig>
            <CST>00</CST>
            <modBC>3</modBC>
            <vBC>0.00</vBC>
            <pICMS>0.00</pICMS>
            <vICMS>0.00</vICMS>
          </ICMS00>
        </ICMS>
      </imposto>
    </det>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- TODO futuro: autorização SEFAZ / certificado digital — XML provisório gerado a partir do pedido ${esc(code)} -->
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe${esc(emitCnpj)}${String(nNF).padStart(9, "0")}" versao="4.00">
    <ide>
      <cUF>35</cUF>
      <cNF>${String(nNF).padStart(8, "0").slice(0, 8)}</cNF>
      <natOp>VENDA</natOp>
      <mod>55</mod>
      <serie>1</serie>
      <nNF>${nNF}</nNF>
      <dhEmi>${esc(dhEmi)}</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>3550308</cMunFG>
      <tpImp>1</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>0</cDV>
      <tpAmb>2</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>1</indFinal>
      <indPres>1</indPres>
      <procEmi>0</procEmi>
      <verProc>PedixPro-1.0</verProc>
    </ide>
    <emit>
      <CNPJ>${esc(emitCnpj)}</CNPJ>
      <xNome>${esc(emitName)}</xNome>
      <IE>${esc(emitIe)}</IE>
      <CRT>1</CRT>
    </emit>
    <dest>
      ${destDoc.length === 14 ? `<CNPJ>${esc(destDoc)}</CNPJ>` : `<CPF>${esc(destDoc.padStart(11, "0").slice(0, 11))}</CPF>`}
      <xNome>${esc(destName)}</xNome>
      <IE>${esc(destIe)}</IE>
      <indIEDest>9</indIEDest>
      ${
        customer?.street
          ? `<enderDest>
        <xLgr>${esc(customer.street)}</xLgr>
        <nro>${esc(customer.number || "S/N")}</nro>
        <xBairro>${esc(customer.neighborhood || "CENTRO")}</xBairro>
        <cMun>${esc(customer.cityIbgeCode || "3550308")}</cMun>
        <xMun>${esc(customer.city || "SAO PAULO")}</xMun>
        <UF>${esc(customer.state || "SP")}</UF>
        <CEP>${esc(onlyDigits(customer.cep) || "00000000")}</CEP>
      </enderDest>`
          : ""
      }
    </dest>
${detXml}
    <total>
      <ICMSTot>
        <vBC>0.00</vBC>
        <vICMS>0.00</vICMS>
        <vICMSDeson>0.00</vICMSDeson>
        <vFCP>0.00</vFCP>
        <vBCST>0.00</vBCST>
        <vST>0.00</vST>
        <vFCPST>0.00</vFCPST>
        <vFCPSTRet>0.00</vFCPSTRet>
        <vProd>${fmtMoney(vProd)}</vProd>
        <vFrete>0.00</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>0.00</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>0.00</vPIS>
        <vCOFINS>0.00</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>${fmtMoney(decToNum(order.totalAmount))}</vNF>
      </ICMSTot>
    </total>
  </infNFe>
</NFe>
`;

  return { xml, filename: `nfe-${fileSlug}.xml` };
}

export async function listFiscalOrders(
  organizationId: string,
  filters: { from?: string; to?: string } = {},
) {
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (filters.from) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(filters.from);
    if (m) {
      createdAt.gte = new Date(
        Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0),
      );
    }
  }
  if (filters.to) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(filters.to);
    if (m) {
      createdAt.lte = new Date(
        Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999),
      );
    }
  }

  const rows = await prisma.order.findMany({
    where: {
      organizationId,
      status: "CONFIRMED",
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      createdAt: true,
      customer: { select: { id: true, name: true, tradeName: true } },
      seller: { include: { user: { select: { name: true } } } },
      _count: { select: { items: true } },
    },
  });

  return rows.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    code: orderCode(o),
    totalAmount: Number(o.totalAmount),
    createdAt: o.createdAt.toISOString(),
    customerName: o.customer?.tradeName || o.customer?.name || "—",
    sellerName: sellerLabelOrDirect(o.seller?.user.name),
    itemCount: o._count.items,
  }));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP store (sem compressão) — suficiente para XML texto. */
function zipStore(files: { name: string; content: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.content, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDir, end]);
}

export async function buildNfeXmlZip(
  organizationId: string,
  filters: { from?: string; to?: string } = {},
): Promise<{ zip: Buffer; filename: string; count: number }> {
  const orders = await listFiscalOrders(organizationId, filters);
  if (orders.length === 0) {
    throw new NfeXmlError("Nenhum pedido confirmado no período.");
  }

  const usedNames = new Set<string>();
  const files: { name: string; content: string }[] = [];

  for (const order of orders) {
    try {
      const { xml, filename } = await buildNfeXml(organizationId, order.id);
      let name = filename;
      if (usedNames.has(name)) {
        name = `nfe-${orderFileSlug(order)}-${order.id.slice(0, 6)}.xml`;
      }
      usedNames.add(name);
      files.push({ name, content: xml });
    } catch (e) {
      if (e instanceof NfeXmlError) continue;
      throw e;
    }
  }

  if (files.length === 0) {
    throw new NfeXmlError(
      "Não foi possível gerar XML para os pedidos do período.",
    );
  }

  const fromPart = filters.from?.replace(/-/g, "") || "inicio";
  const toPart = filters.to?.replace(/-/g, "") || "fim";
  return {
    zip: zipStore(files),
    filename: `nfe-xml-${fromPart}-${toPart}.zip`,
    count: files.length,
  };
}
