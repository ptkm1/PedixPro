import { escapeXml, formatNfeDateTime, onlyDigits } from "./nfe-access-key.js";
import { compactNfeXml } from "./nfe-signer.js";
import { sefazOrgaoForEvent } from "./nfe-svc.js";
import { UF_IBGE } from "./sefaz-endpoints.js";

export function buildCancelamentoEvento(input: {
  accessKey: string;
  cnpj: string;
  uf: string;
  homologation: boolean;
  protocol: string;
  justification: string;
  seqEvento?: number;
  tpEmis?: string | null;
}) {
  const chNFe = onlyDigits(input.accessKey);
  const cnpj = onlyDigits(input.cnpj).padStart(14, "0").slice(0, 14);
  const cOrgao = sefazOrgaoForEvent(input.uf, input.tpEmis);
  const tpAmb = input.homologation ? "2" : "1";
  const nSeq = String(input.seqEvento ?? 1).padStart(2, "0");
  const tpEvento = "110111";
  const id = `ID${tpEvento}${chNFe}${nSeq}`;
  const dhEvento = formatNfeDateTime(new Date());
  const xJust = escapeXml(input.justification.trim());

  const infEvento = `<infEvento Id="${id}"><cOrgao>${cOrgao}</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${chNFe}</chNFe><dhEvento>${dhEvento}</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>${input.seqEvento ?? 1}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${escapeXml(input.protocol)}</nProt><xJust>${xJust}</xJust></detEvento></infEvento>`;

  return { infEvento, idLote: "1" };
}

/** Carta de Correção Eletrônica — tpEvento 110110. */
export function buildCartaCorrecaoEvento(input: {
  accessKey: string;
  cnpj: string;
  uf: string;
  homologation: boolean;
  correctionText: string;
  seqEvento?: number;
  tpEmis?: string | null;
}) {
  const text = input.correctionText.trim();
  if (text.length < 15 || text.length > 1000) {
    throw new Error("Texto da CC-e deve ter entre 15 e 1000 caracteres");
  }
  const chNFe = onlyDigits(input.accessKey);
  const cnpj = onlyDigits(input.cnpj).padStart(14, "0").slice(0, 14);
  const cOrgao = sefazOrgaoForEvent(input.uf, input.tpEmis);
  const tpAmb = input.homologation ? "2" : "1";
  const nSeq = input.seqEvento ?? 1;
  const tpEvento = "110110";
  const id = `ID${tpEvento}${chNFe}${String(nSeq).padStart(2, "0")}`;
  const dhEvento = formatNfeDateTime(new Date());
  const xCorrecao = escapeXml(text);

  const infEvento =
    `<infEvento Id="${id}">` +
    `<cOrgao>${cOrgao}</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpj}</CNPJ>` +
    `<chNFe>${chNFe}</chNFe><dhEvento>${dhEvento}</dhEvento>` +
    `<tpEvento>${tpEvento}</tpEvento><nSeqEvento>${nSeq}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00"><descEvento>Carta de Correcao</descEvento>` +
    `<xCorrecao>${xCorrecao}</xCorrecao>` +
    `<xCondUso>A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro ocorrido na emissao de documento fiscal, desde que o erro nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; II - a correcao de dados cadastrais que implique mudanca do remetente ou do destinatario; III - a data de emissao ou de saida.</xCondUso>` +
    `</detEvento></infEvento>`;

  return { infEvento, idLote: "1", nSeqEvento: nSeq };
}

/** Inutilização de numeração NF-e (infInut). */
export function buildInutilizacao(input: {
  cnpj: string;
  uf: string;
  homologation: boolean;
  year: number;
  series: number;
  numberStart: number;
  numberEnd: number;
  justification: string;
}) {
  const just = input.justification.trim();
  if (just.length < 15) {
    throw new Error("Justificativa deve ter no mínimo 15 caracteres");
  }
  const cnpj = onlyDigits(input.cnpj).padStart(14, "0").slice(0, 14);
  const cUF = UF_IBGE[input.uf.toUpperCase()] ?? "35";
  const tpAmb = input.homologation ? "2" : "1";
  const ano = String(input.year % 100).padStart(2, "0");
  const serie = String(input.series);
  const nNFIni = String(input.numberStart);
  const nNFFin = String(input.numberEnd);
  const id = `ID${cUF}${ano}${cnpj}${serie.padStart(3, "0")}${nNFIni.padStart(9, "0")}${nNFFin.padStart(9, "0")}`;

  const infInut =
    `<infInut Id="${id}">` +
    `<tpAmb>${tpAmb}</tpAmb><xServ>INUTILIZAR</xServ>` +
    `<cUF>${cUF}</cUF><ano>${ano}</ano><CNPJ>${cnpj}</CNPJ>` +
    `<mod>55</mod><serie>${serie}</serie>` +
    `<nNFIni>${nNFIni}</nNFIni><nNFFin>${nNFFin}</nNFFin>` +
    `<xJust>${escapeXml(just)}</xJust>` +
    `</infInut>`;

  return { infInut, id };
}

export function wrapInutNFe(signedInutXml: string): string {
  return compactNfeXml(
    `<?xml version="1.0" encoding="UTF-8"?>${signedInutXml}`,
  );
}

const MANIFEST_EVENTS: Record<
  "CIENCIA" | "CONFIRMACAO" | "DESCONHECIMENTO" | "NAO_REALIZADA",
  { tpEvento: string; descEvento: string; needsJust?: boolean }
> = {
  CIENCIA: { tpEvento: "210210", descEvento: "Ciencia da Operacao" },
  CONFIRMACAO: { tpEvento: "210200", descEvento: "Confirmacao da Operacao" },
  DESCONHECIMENTO: {
    tpEvento: "210220",
    descEvento: "Desconhecimento da Operacao",
  },
  NAO_REALIZADA: {
    tpEvento: "210240",
    descEvento: "Operacao nao Realizada",
    needsJust: true,
  },
};

export function buildManifestacaoEvento(input: {
  accessKey: string;
  cnpj: string;
  homologation: boolean;
  type: keyof typeof MANIFEST_EVENTS;
  justification?: string;
  seqEvento?: number;
}) {
  const meta = MANIFEST_EVENTS[input.type];
  if (
    meta.needsJust &&
    (!input.justification || input.justification.trim().length < 15)
  ) {
    throw new Error(
      "Justificativa obrigatória (mín. 15 caracteres) para Operação não realizada",
    );
  }
  const chNFe = onlyDigits(input.accessKey);
  const cnpj = onlyDigits(input.cnpj).padStart(14, "0").slice(0, 14);
  const tpAmb = input.homologation ? "2" : "1";
  const nSeq = String(input.seqEvento ?? 1).padStart(2, "0");
  const id = `ID${meta.tpEvento}${chNFe}${nSeq}`;
  const dhEvento = formatNfeDateTime(new Date());
  const justXml =
    meta.needsJust && input.justification
      ? `<xJust>${escapeXml(input.justification.trim())}</xJust>`
      : "";

  const infEvento =
    `<infEvento Id="${id}">` +
    `<cOrgao>91</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpj}</CNPJ>` +
    `<chNFe>${chNFe}</chNFe><dhEvento>${dhEvento}</dhEvento>` +
    `<tpEvento>${meta.tpEvento}</tpEvento><nSeqEvento>${input.seqEvento ?? 1}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00"><descEvento>${meta.descEvento}</descEvento>${justXml}</detEvento>` +
    `</infEvento>`;

  return { infEvento, tpEvento: meta.tpEvento };
}

export function wrapEnvEvento(signedEventoXml: string, idLote = "1"): string {
  return compactNfeXml(
    `<?xml version="1.0" encoding="UTF-8"?><envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${idLote}</idLote>${signedEventoXml}</envEvento>`,
  );
}
