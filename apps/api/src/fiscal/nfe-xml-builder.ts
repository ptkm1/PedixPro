import type {
  FiscalInvoice,
  FiscalInvoiceItem,
  Establishment,
} from "@prisma/client";
import { taxRegimeToCrt } from "./certificate-store.js";
import {
  escapeXml,
  formatNfeDecimal,
  generateAccessKey,
  onlyDigits,
} from "./nfe-access-key.js";
import { nfeCest, nfeCProd, nfeExtIpi, nfeGtin } from "./nfe-prod-fields.js";
import { compactNfeXml } from "./nfe-signer.js";
import { isSvcTpEmis, normalizeSvcJustification } from "./nfe-svc.js";
import { UF_IBGE } from "./sefaz-endpoints.js";

/** Limite do schema NF-e para `ide/natOp`. */
export const NFE_NAT_OP_MAX = 60;

export function normalizeNfeNature(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "VENDA DE MERCADORIA";
  return t.slice(0, NFE_NAT_OP_MAX);
}

type Recipient = {
  name: string;
  document?: string | null;
  stateRegistration?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  cityIbge?: string | null;
};

/** CSOSN do Simples que no XML levam só orig + CSOSN (grupo ICMSSNxxx). */
const CSOSN_ORIG_ONLY = new Set(["102", "103", "300", "400", "500"]);

const PIS_NT = new Set(["04", "05", "06", "07", "08", "09"]);
const PIS_ALIQ = new Set(["01", "02"]);

function nfeFilled(raw: string | null | undefined, fallback: string): string {
  const t = (raw ?? "").trim();
  return t || fallback;
}

function nfeIbge(raw: string | null | undefined, fallback: string): string {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 7 ? d : fallback;
}

function nfeCfop(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length >= 4) return d.slice(0, 4);
  return "5102";
}

function nfeUnit(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().slice(0, 6);
  return t || "UN";
}

function nfeCsosn(raw: unknown): string {
  const d = String(raw ?? "102").replace(/\D/g, "").padStart(3, "0").slice(-3);
  if (CSOSN_ORIG_ONLY.has(d) || d === "101") return d;
  return "102";
}

function nfeCstIcms(raw: unknown): string {
  const d = String(raw ?? "00").replace(/\D/g, "").padStart(2, "0").slice(-2);
  return d || "00";
}

function resolveFiscalOrigin(
  tax: Record<string, unknown>,
  lineNumber: number,
): number {
  const raw = tax.orig ?? tax.fiscalOrigin ?? tax.nfeOrigin;
  const orig = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(orig) || orig < 0 || orig > 8) {
    throw new Error(
      `Item ${lineNumber}: origem fiscal inválida (informe 0–8 no produto).`,
    );
  }
  return orig;
}

function buildIcmsXml(
  taxRegime: Establishment["taxRegime"],
  tax: Record<string, unknown>,
  lineNumber: number,
): string {
  const orig = resolveFiscalOrigin(tax, lineNumber);

  if (taxRegime === "SIMPLES_NACIONAL") {
    const csosn = nfeCsosn(tax.csosn);
    if (csosn === "101") {
      const pCred = formatNfeDecimal(Number(tax.pCredSN ?? tax.icmsRate ?? 0));
      const vCred = formatNfeDecimal(Number(tax.vCredICMSSN ?? tax.icms ?? 0));
      return `<ICMS>
          <ICMSSN101>
            <orig>${orig}</orig>
            <CSOSN>101</CSOSN>
            <pCredSN>${pCred}</pCredSN>
            <vCredICMSSN>${vCred}</vCredICMSSN>
          </ICMSSN101>
        </ICMS>`;
    }
    const tag = `ICMSSN${csosn}`;
    return `<ICMS>
          <${tag}>
            <orig>${orig}</orig>
            <CSOSN>${csosn}</CSOSN>
          </${tag}>
        </ICMS>`;
  }

  const cst = nfeCstIcms(tax.cst);
  if (cst === "40" || cst === "41" || cst === "50") {
    return `<ICMS>
          <ICMS40>
            <orig>${orig}</orig>
            <CST>${cst}</CST>
          </ICMS40>
        </ICMS>`;
  }
  if (cst === "60") {
    return `<ICMS>
          <ICMS60>
            <orig>${orig}</orig>
            <CST>60</CST>
          </ICMS60>
        </ICMS>`;
  }
  const vBC = formatNfeDecimal(Number(tax.base ?? 0));
  const pICMS = formatNfeDecimal(Number(tax.icmsRate ?? 0));
  const vICMS = formatNfeDecimal(Number(tax.icms ?? 0));
  return `<ICMS>
          <ICMS00>
            <orig>${orig}</orig>
            <CST>00</CST>
            <modBC>3</modBC>
            <vBC>${vBC}</vBC>
            <pICMS>${pICMS}</pICMS>
            <vICMS>${vICMS}</vICMS>
          </ICMS00>
        </ICMS>`;
}

function taxNum(tax: Record<string, unknown>, key: string): number {
  const v = tax[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildPisCofinsXml(tax: Record<string, unknown>): string {
  const cst = String(tax.cstPis ?? "07").replace(/\D/g, "").padStart(2, "0").slice(-2) || "07";
  if (PIS_NT.has(cst)) {
    return `<PIS><PISNT><CST>${cst}</CST></PISNT></PIS>
        <COFINS><COFINSNT><CST>${cst}</CST></COFINSNT></COFINS>`;
  }
  const vBC = formatNfeDecimal(taxNum(tax, "base"));
  const pPIS = formatNfeDecimal(taxNum(tax, "pisRate"));
  const vPIS = formatNfeDecimal(taxNum(tax, "pis"));
  const pCOFINS = formatNfeDecimal(taxNum(tax, "cofinsRate"));
  const vCOFINS = formatNfeDecimal(taxNum(tax, "cofins"));
  if (PIS_ALIQ.has(cst)) {
    return `<PIS>
          <PISAliq>
            <CST>${cst}</CST>
            <vBC>${vBC}</vBC>
            <pPIS>${pPIS}</pPIS>
            <vPIS>${vPIS}</vPIS>
          </PISAliq>
        </PIS>
        <COFINS>
          <COFINSAliq>
            <CST>${cst}</CST>
            <vBC>${vBC}</vBC>
            <pCOFINS>${pCOFINS}</pCOFINS>
            <vCOFINS>${vCOFINS}</vCOFINS>
          </COFINSAliq>
        </COFINS>`;
  }
  return `<PIS>
          <PISOutr>
            <CST>${cst}</CST>
            <vBC>${vBC}</vBC>
            <pPIS>${pPIS}</pPIS>
            <vPIS>${vPIS}</vPIS>
          </PISOutr>
        </PIS>
        <COFINS>
          <COFINSOutr>
            <CST>${cst}</CST>
            <vBC>${vBC}</vBC>
            <pCOFINS>${pCOFINS}</pCOFINS>
            <vCOFINS>${vCOFINS}</vCOFINS>
          </COFINSOutr>
        </COFINS>`;
}

function buildIpiXml(tax: Record<string, unknown>): string {
  const ipi = taxNum(tax, "ipi");
  const ipiRate = taxNum(tax, "ipiRate");
  if (ipi <= 0 && ipiRate <= 0) return "";
  const vBC = formatNfeDecimal(taxNum(tax, "base"));
  return `<IPI>
          <cEnq>999</cEnq>
          <IPITrib>
            <CST>99</CST>
            <vBC>${vBC}</vBC>
            <pIPI>${formatNfeDecimal(ipiRate)}</pIPI>
            <vIPI>${formatNfeDecimal(ipi)}</vIPI>
          </IPITrib>
        </IPI>`;
}

function buildTranspXml(invoice: FiscalInvoice): string {
  const modFrete = String(invoice.modFrete ?? "9").slice(0, 1) || "9";
  const qVol = invoice.volumeQty != null ? Number(invoice.volumeQty) : null;
  const pesoB =
    invoice.grossWeightKg != null ? Number(invoice.grossWeightKg) : null;
  const pesoL =
    invoice.netWeightKg != null ? Number(invoice.netWeightKg) : null;
  const hasVol =
    (qVol != null && qVol > 0) ||
    (pesoB != null && pesoB > 0) ||
    (pesoL != null && pesoL > 0);
  if (!hasVol) return `<transp><modFrete>${modFrete}</modFrete></transp>`;
  return (
    `<transp><modFrete>${modFrete}</modFrete>` +
    `<vol>` +
    `<qVol>${formatNfeDecimal(qVol ?? 0, 0)}</qVol>` +
    `<pesoL>${formatNfeDecimal(pesoL ?? 0, 3)}</pesoL>` +
    `<pesoB>${formatNfeDecimal(pesoB ?? 0, 3)}</pesoB>` +
    `</vol></transp>`
  );
}

function sumTaxSnapshots(items: FiscalInvoiceItem[]) {
  let vBC = 0;
  let vICMS = 0;
  let vFCP = 0;
  let vIPI = 0;
  let vPIS = 0;
  let vCOFINS = 0;
  let vProd = 0;
  for (const item of items) {
    vProd += Number(item.totalPrice);
    const tax = (item.taxSnapshot as Record<string, unknown> | null) ?? {};
    vBC += taxNum(tax, "base");
    vICMS += taxNum(tax, "icms");
    vFCP += taxNum(tax, "fcp");
    vIPI += taxNum(tax, "ipi");
    vPIS += taxNum(tax, "pis");
    vCOFINS += taxNum(tax, "cofins");
  }
  return { vBC, vICMS, vFCP, vIPI, vPIS, vCOFINS, vProd };
}

export function buildSignedNfePackage(input: {
  config: Establishment;
  invoice: FiscalInvoice & { items: FiscalInvoiceItem[] };
  recipient: Recipient;
  emitterName: string;
  accessKey?: string;
  payment?: NfePaymentInfo;
  /** Texto de `ide/natOp` (natureza da operação / CFOP). */
  nature?: string | null;
  /** Reutilizar dhEmi/chave ao reenviar em SVC. */
  issuedAt?: Date;
}) {
  if ((input.invoice.documentModel ?? 55) !== 55) {
    throw new Error(
      "Emissão NFC-e (modelo 65) ainda não implementada — use documentModel 55.",
    );
  }
  const issuedAt = input.issuedAt ?? new Date();
  const tpEmis = String(input.invoice.tpEmis ?? "1").slice(0, 1) || "1";
  const accessKey =
    input.accessKey ??
    generateAccessKey({
      uf: input.config.uf ?? "SP",
      issuedAt,
      cnpj: input.config.cnpj ?? "",
      series: input.invoice.series ?? input.config.nfeSeries,
      number: input.invoice.number ?? 1,
      tpEmis,
    });

  const infNFe = buildInfNFe({
    config: input.config,
    invoice: input.invoice,
    recipient: input.recipient,
    emitterName: input.emitterName,
    accessKey,
    issuedAt,
    payment: input.payment,
    nature: input.nature,
  });

  return { accessKey, infNFeXml: infNFe, issuedAt };
}

function buildInfNFe(input: {
  config: Establishment;
  invoice: FiscalInvoice & { items: FiscalInvoiceItem[] };
  recipient: Recipient;
  emitterName: string;
  accessKey: string;
  issuedAt: Date;
  payment?: NfePaymentInfo;
  nature?: string | null;
}) {
  const { config, invoice, recipient, accessKey, issuedAt, emitterName } =
    input;
  const uf = nfeFilled(config.uf, "SP").toUpperCase().slice(0, 2);
  const cUF = UF_IBGE[uf] ?? "35";
  const emitIbge = nfeIbge(config.cityIbge, "");
  if (!emitIbge) {
    throw new Error(
      "Código IBGE do município do emitente não preenchido (7 dígitos).",
    );
  }
  const dhEmi = issuedAt.toISOString().replace(/\.\d{3}Z$/, "-03:00");
  const dhCont = (
    config.nfeContingencySince ?? issuedAt
  )
    .toISOString()
    .replace(/\.\d{3}Z$/, "-03:00");
  const tpAmb = config.nfeEnvironment === "PRODUCTION" ? "1" : "2";
  const homolog = tpAmb === "2";
  const crt = taxRegimeToCrt(config.taxRegime);
  const destDoc = onlyDigits(recipient.document ?? "");
  const isCnpj = destDoc.length === 14;
  const destName = homolog
    ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
    : nfeFilled(recipient.name, "DESTINATARIO");
  const destUf = nfeFilled(recipient.state, uf).toUpperCase().slice(0, 2);
  const destIbge = nfeIbge(recipient.cityIbge, emitIbge);
  const idDest = destUf === uf ? "1" : "2";
  const tpEmis = String(invoice.tpEmis ?? "1").slice(0, 1) || "1";
  const freight = Number(invoice.freightAmount ?? 0);
  const totals = sumTaxSnapshots(invoice.items);
  const vNF = totals.vProd + freight + totals.vIPI;
  const natOp = normalizeNfeNature(input.nature);
  const emitIeRaw = nfeFilled(config.stateRegistration, "ISENTO");
  const emitIe =
    emitIeRaw.toUpperCase() === "ISENTO"
      ? "ISENTO"
      : emitIeRaw.replace(/\D/g, "") || "ISENTO";
  const destIeRaw = (recipient.stateRegistration ?? "").trim();

  const det = invoice.items
    .map((item) => {
      const tax = (item.taxSnapshot as Record<string, unknown> | null) ?? {};
      const vProd = Number(item.totalPrice);
      const ipiXml = buildIpiXml(tax);
      const gtin = nfeGtin(tax.gtin != null ? String(tax.gtin) : null);
      const cest = nfeCest(tax.cest != null ? String(tax.cest) : null);
      const extIpi = nfeExtIpi(
        tax.ncmException != null ? String(tax.ncmException) : null,
      );
      const cProd = nfeCProd({
        sku: tax.cProd != null ? String(tax.cProd) : null,
        productId: item.productId,
        lineNumber: item.lineNumber,
      });
      const ncm = (item.ncm ?? "").replace(/\D/g, "").padStart(8, "0").slice(-8);
      if (!ncm || ncm === "00000000") {
        throw new Error(
          `Item ${item.lineNumber}: NCM inválido ou vazio (informe 8 dígitos no produto).`,
        );
      }
      const unit = nfeUnit(item.unit);
      const cestXml = cest ? `\n        <CEST>${cest}</CEST>` : "";
      const extIpiXml = extIpi
        ? `\n        <EXTIPI>${escapeXml(extIpi)}</EXTIPI>`
        : "";
      return `
    <det nItem="${item.lineNumber}">
      <prod>
        <cProd>${escapeXml(cProd)}</cProd>
        <cEAN>${escapeXml(gtin)}</cEAN>
        <xProd>${escapeXml(nfeFilled(item.description, `ITEM ${item.lineNumber}`).slice(0, 120))}</xProd>
        <NCM>${ncm}</NCM>${cestXml}${extIpiXml}
        <CFOP>${nfeCfop(item.cfop)}</CFOP>
        <uCom>${escapeXml(unit)}</uCom>
        <qCom>${formatNfeDecimal(Number(item.quantity), 4)}</qCom>
        <vUnCom>${formatNfeDecimal(Number(item.unitPrice))}</vUnCom>
        <vProd>${formatNfeDecimal(vProd)}</vProd>
        <cEANTrib>${escapeXml(gtin)}</cEANTrib>
        <uTrib>${escapeXml(unit)}</uTrib>
        <qTrib>${formatNfeDecimal(Number(item.quantity), 4)}</qTrib>
        <vUnTrib>${formatNfeDecimal(Number(item.unitPrice))}</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        ${buildIcmsXml(config.taxRegime, tax, item.lineNumber)}
        ${ipiXml}
        ${buildPisCofinsXml(tax)}
      </imposto>
    </det>`;
    })
    .join("");

  return `<infNFe Id="NFe${accessKey}" versao="4.00">
  <ide>
    <cUF>${cUF}</cUF>
    <cNF>${accessKey.slice(35, 43)}</cNF>
    <natOp>${escapeXml(natOp)}</natOp>
    <mod>55</mod>
    <serie>${invoice.series ?? config.nfeSeries}</serie>
    <nNF>${invoice.number}</nNF>
    <dhEmi>${dhEmi}</dhEmi>
    <tpNF>1</tpNF>
    <idDest>${idDest}</idDest>
    <cMunFG>${emitIbge}</cMunFG>
    <tpImp>1</tpImp>
    <tpEmis>${tpEmis}</tpEmis>
    <cDV>${accessKey.slice(-1)}</cDV>
    <tpAmb>${tpAmb}</tpAmb>
    <finNFe>1</finNFe>
    <indFinal>0</indFinal>
    <indPres>1</indPres>
    <indIntermed>0</indIntermed>
    <procEmi>0</procEmi>
    <verProc>PEDIDOS-1.0</verProc>${
      isSvcTpEmis(tpEmis)
        ? `
    <dhCont>${dhCont}</dhCont>
    <xJust>${escapeXml(normalizeSvcJustification(invoice.contingencyJustification))}</xJust>`
        : ""
    }
  </ide>
  <emit>
    <CNPJ>${onlyDigits(config.cnpj ?? "", 14)}</CNPJ>
    <xNome>${escapeXml(emitterName)}</xNome>
    <xFant>${escapeXml(emitterName)}</xFant>
    <enderEmit>
      <xLgr>${escapeXml(nfeFilled(config.street, "NAO INFORMADO"))}</xLgr>
      <nro>${escapeXml(nfeFilled(config.addressNumber, "S/N"))}</nro>
      <xBairro>${escapeXml(nfeFilled(config.district, "CENTRO"))}</xBairro>
      <cMun>${emitIbge}</cMun>
      <xMun>${escapeXml(nfeFilled(config.city, "MUNICIPIO"))}</xMun>
      <UF>${uf}</UF>
      <CEP>${onlyDigits(nfeFilled(config.zipCode, "00000000"), 8)}</CEP>
      <cPais>1058</cPais>
      <xPais>BRASIL</xPais>
    </enderEmit>
    <IE>${escapeXml(emitIe)}</IE>
    <CRT>${crt}</CRT>
  </emit>
  <dest>
    <${isCnpj ? "CNPJ" : "CPF"}>${onlyDigits(destDoc, isCnpj ? 14 : 11)}</${isCnpj ? "CNPJ" : "CPF"}>
    <xNome>${escapeXml(destName)}</xNome>
    <enderDest>
      <xLgr>${escapeXml(nfeFilled(recipient.street, "NAO INFORMADO"))}</xLgr>
      <nro>${escapeXml(nfeFilled(recipient.addressNumber, "S/N"))}</nro>
      <xBairro>${escapeXml(nfeFilled(recipient.district, "CENTRO"))}</xBairro>
      <cMun>${destIbge}</cMun>
      <xMun>${escapeXml(nfeFilled(recipient.city, "MUNICIPIO"))}</xMun>
      <UF>${destUf}</UF>
      <CEP>${onlyDigits(nfeFilled(recipient.zipCode, "00000000"), 8)}</CEP>
      <cPais>1058</cPais>
      <xPais>BRASIL</xPais>
    </enderDest>
    ${
      destIeRaw && destIeRaw.toUpperCase() !== "ISENTO"
        ? `<indIEDest>1</indIEDest>
    <IE>${escapeXml(destIeRaw.replace(/\D/g, "") || destIeRaw)}</IE>`
        : `<indIEDest>9</indIEDest>`
    }
  </dest>${det}
  <total>
    <ICMSTot>
      <vBC>${formatNfeDecimal(totals.vBC)}</vBC>
      <vICMS>${formatNfeDecimal(totals.vICMS)}</vICMS>
      <vICMSDeson>0.00</vICMSDeson>
      <vFCP>${formatNfeDecimal(totals.vFCP)}</vFCP>
      <vBCST>0.00</vBCST>
      <vST>0.00</vST>
      <vFCPST>0.00</vFCPST>
      <vFCPSTRet>0.00</vFCPSTRet>
      <vProd>${formatNfeDecimal(totals.vProd)}</vProd>
      <vFrete>${formatNfeDecimal(freight)}</vFrete>
      <vSeg>0.00</vSeg>
      <vDesc>0.00</vDesc>
      <vII>0.00</vII>
      <vIPI>${formatNfeDecimal(totals.vIPI)}</vIPI>
      <vIPIDevol>0.00</vIPIDevol>
      <vPIS>${formatNfeDecimal(totals.vPIS)}</vPIS>
      <vCOFINS>${formatNfeDecimal(totals.vCOFINS)}</vCOFINS>
      <vOutro>0.00</vOutro>
      <vNF>${formatNfeDecimal(vNF)}</vNF>
    </ICMSTot>
  </total>
  ${buildTranspXml(invoice)}
  ${buildPagXml(vNF, input.payment)}
</infNFe>`;
}

export type NfePaymentInfo = {
  /** Prazo em dias (0 = à vista). Derivado de PaymentCondition.days do pedido. */
  days: number;
  /** Código tPag NF-e (opcional; default: 01 à vista / 15 boleto a prazo). */
  tPag?: string;
};

function buildPagXml(total: number, payment?: NfePaymentInfo): string {
  const days = payment?.days ?? 0;
  // tPag: 01=Dinheiro; 15=Boleto Bancário; 99=Outros
  const tPag = payment?.tPag ?? (days > 0 ? "15" : "01");
  return `<pag><detPag><tPag>${tPag}</tPag><vPag>${formatNfeDecimal(total)}</vPag></detPag></pag>`;
}

export function wrapEnviNFe(signedNFeXml: string, idLote = "1"): string {
  return compactNfeXml(
    `<?xml version="1.0" encoding="UTF-8"?><enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${idLote}</idLote><indSinc>1</indSinc>${signedNFeXml}</enviNFe>`,
  );
}
