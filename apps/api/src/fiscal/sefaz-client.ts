import { onlyDigits } from "./nfe-access-key.js";
import {
  buildSoapEnvelope,
  extractSoapBody,
  parseSefazAuthorizationResponse,
  parseSefazEventResponse,
} from "./nfe-signer.js";
import {
  getAutorizacaoUrl,
  getConsultaProtocoloUrl,
  getInutilizacaoUrl,
  getRecepcaoEventoUrl,
  getStatusServicoUrl,
  UF_IBGE,
} from "./sefaz-endpoints.js";
import { describeSefazTransportError, postSefazSoap } from "./sefaz-tls.js";

const AUTORIZACAO_NS =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";
const EVENTO_NS = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4";
const CONSULTA_NS =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4";
const INUTILIZACAO_NS =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4";
const STATUS_NS = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4";

const AUTORIZACAO_ACTION = `${AUTORIZACAO_NS}/nfeAutorizacaoLote`;
const EVENTO_ACTION = `${EVENTO_NS}/nfeRecepcaoEvento`;
const CONSULTA_ACTION = `${CONSULTA_NS}/nfeConsultaNF`;
const INUTILIZACAO_ACTION = `${INUTILIZACAO_NS}/nfeInutilizacaoNF`;
const STATUS_ACTION = `${STATUS_NS}/nfeStatusServicoNF`;

export type SefazAuthResult = {
  ok: boolean;
  /** Lote aceito (cStat 103) — aguarda poll de protocolo. */
  pending?: boolean;
  rawResponse: string;
  parsed: ReturnType<typeof parseSefazAuthorizationResponse>;
  error?: string;
  endpoint?: string;
};

export async function authorizeNfe(input: {
  uf: string;
  homologation: boolean;
  enviNFeXml: string;
  pfx: Buffer;
  password: string;
  tpEmis?: string | null;
}): Promise<SefazAuthResult> {
  const endpoint = getAutorizacaoUrl(
    input.uf,
    input.homologation,
    input.tpEmis,
  );
  const url = new URL(endpoint);
  const soap = buildSoapEnvelope(input.enviNFeXml, AUTORIZACAO_NS);

  try {
    const rawResponse = await postSefazSoap(
      url,
      soap,
      input.pfx,
      input.password,
      AUTORIZACAO_ACTION,
    );
    const body = extractSoapBody(rawResponse);
    const parsed = parseSefazAuthorizationResponse(body);
    if (parsed.pending) {
      return {
        ok: false,
        pending: true,
        rawResponse: body,
        parsed,
        endpoint,
      };
    }
    return {
      ok: parsed.success,
      rawResponse: body,
      parsed,
      endpoint,
      error: parsed.success
        ? undefined
        : `${parsed.cStat ?? "?"}: ${parsed.xMotivo ?? "Rejeição SEFAZ"}`,
    };
  } catch (e) {
    return {
      ok: false,
      rawResponse: "",
      parsed: { success: false },
      endpoint,
      error: describeSefazTransportError(e),
    };
  }
}

export async function consultNfeStatusServico(input: {
  uf: string;
  homologation: boolean;
  pfx: Buffer;
  password: string;
  tpEmis?: string | null;
}): Promise<SefazAuthResult> {
  const endpoint = getStatusServicoUrl(
    input.uf,
    input.homologation,
    input.tpEmis,
  );
  const cUF = UF_IBGE[input.uf.toUpperCase()] ?? "35";
  const tpAmb = input.homologation ? "2" : "1";
  const consStat =
    `<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ>` +
    `</consStatServ>`;
  const soap = buildSoapEnvelope(consStat, STATUS_NS);

  try {
    const rawResponse = await postSefazSoap(
      new URL(endpoint),
      soap,
      input.pfx,
      input.password,
      STATUS_ACTION,
    );
    const body = extractSoapBody(rawResponse);
    const parsed = parseSefazAuthorizationResponse(body);
    const operating = parsed.cStat === "107";
    return {
      ok: operating,
      rawResponse: body,
      parsed,
      endpoint,
      error: operating
        ? undefined
        : `${parsed.cStat ?? "?"}: ${parsed.xMotivo ?? "Status SEFAZ"}`,
    };
  } catch (e) {
    return {
      ok: false,
      rawResponse: "",
      parsed: { success: false },
      endpoint,
      error: describeSefazTransportError(e),
    };
  }
}

export type SefazEventResult = {
  ok: boolean;
  rawResponse: string;
  parsed: ReturnType<typeof parseSefazEventResponse>;
  error?: string;
};

export async function sendNfeEvento(input: {
  uf: string;
  homologation: boolean;
  envEventoXml: string;
  pfx: Buffer;
  password: string;
  tpEmis?: string | null;
}): Promise<SefazEventResult> {
  const url = new URL(
    getRecepcaoEventoUrl(input.uf, input.homologation, input.tpEmis),
  );
  const soap = buildSoapEnvelope(input.envEventoXml, EVENTO_NS);

  try {
    const rawResponse = await postSefazSoap(
      url,
      soap,
      input.pfx,
      input.password,
      EVENTO_ACTION,
    );
    const body = extractSoapBody(rawResponse);
    const parsed = parseSefazEventResponse(body);
    return {
      ok: parsed.success,
      rawResponse: body,
      parsed,
      error: parsed.success
        ? undefined
        : `${parsed.cStat ?? "?"}: ${parsed.xMotivo ?? "Evento rejeitado"}`,
    };
  } catch (e) {
    return {
      ok: false,
      rawResponse: "",
      parsed: { success: false },
      error: describeSefazTransportError(e),
    };
  }
}

export async function consultNfeProtocolo(input: {
  uf: string;
  homologation: boolean;
  accessKey: string;
  pfx: Buffer;
  password: string;
  tpEmis?: string | null;
}): Promise<SefazEventResult> {
  const chNFe = onlyDigits(input.accessKey);
  const tpAmb = input.homologation ? "2" : "1";
  const consSit =
    `<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chNFe}</chNFe>` +
    `</consSitNFe>`;
  const url = new URL(
    getConsultaProtocoloUrl(input.uf, input.homologation, input.tpEmis),
  );
  const soap = buildSoapEnvelope(consSit, CONSULTA_NS);

  try {
    const rawResponse = await postSefazSoap(
      url,
      soap,
      input.pfx,
      input.password,
      CONSULTA_ACTION,
    );
    const body = extractSoapBody(rawResponse);
    const parsed = parseSefazEventResponse(body);
    const cStat = parsed.cStat;
    const ok =
      cStat === "100" ||
      cStat === "101" ||
      cStat === "110" ||
      cStat === "150" ||
      cStat === "151" ||
      parsed.success;
    return {
      ok,
      rawResponse: body,
      parsed: { ...parsed, success: ok },
      error: ok
        ? undefined
        : `${cStat ?? "?"}: ${parsed.xMotivo ?? "Consulta sem sucesso"}`,
    };
  } catch (e) {
    return {
      ok: false,
      rawResponse: "",
      parsed: { success: false },
      error: describeSefazTransportError(e),
    };
  }
}

export async function sendNfeInutilizacao(input: {
  uf: string;
  homologation: boolean;
  inutNFeXml: string;
  pfx: Buffer;
  password: string;
}): Promise<SefazEventResult> {
  const url = new URL(getInutilizacaoUrl(input.uf, input.homologation));
  const soap = buildSoapEnvelope(input.inutNFeXml, INUTILIZACAO_NS);

  try {
    const rawResponse = await postSefazSoap(
      url,
      soap,
      input.pfx,
      input.password,
      INUTILIZACAO_ACTION,
    );
    const body = extractSoapBody(rawResponse);
    const parsed = parseSefazEventResponse(body);
    const ok = parsed.cStat === "102" || parsed.success;
    return {
      ok,
      rawResponse: body,
      parsed: { ...parsed, success: ok },
      error: ok
        ? undefined
        : `${parsed.cStat ?? "?"}: ${parsed.xMotivo ?? "Inutilização rejeitada"}`,
    };
  } catch (e) {
    return {
      ok: false,
      rawResponse: "",
      parsed: { success: false },
      error: describeSefazTransportError(e),
    };
  }
}
