import { DOMParser } from "@xmldom/xmldom";
import forge from "node-forge";
import { createHash } from "node:crypto";
import { C14nCanonicalization } from "xml-crypto";

const C14N_ALG = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

/** SEFAZ cStat 587: xmlns padrão só no NFe/enviNFe, não em infNFe/infEvento. */
export function stripNfeDefaultXmlns(xml: string): string {
  return xml.replace(/\sxmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe"/g, "");
}

/** SEFAZ cStat 588: sem espaço, tab ou quebra de linha entre tags. */
export function compactNfeXml(xml: string): string {
  return xml
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/>\s+</g, "><");
}

function firstElementChild(node: {
  childNodes: ArrayLike<{ nodeType: number }>;
}): {
  nodeType: number;
} | null {
  const kids = node.childNodes;
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c && c.nodeType === 1) return c;
  }
  return null;
}

function parseXmlRoot(xmlFragment: string) {
  const doc = new DOMParser().parseFromString(xmlFragment, "text/xml");
  const root = doc.documentElement;
  if (!root) {
    throw new Error("XML inválido para canonicalização C14N");
  }
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error("Falha ao parsear XML para C14N");
  }
  return root;
}

function sha1Base64(data: string): string {
  return createHash("sha1").update(data, "utf8").digest("base64");
}

/** Canonicalização C14N 1.0 (inclusive) conforme XMLDSig / NF-e. */
function canonicalizeXml(xmlFragment: string): string {
  const root = parseXmlRoot(xmlFragment);
  const c14n = new C14nCanonicalization();
  return c14n.process(root as unknown as Node, {});
}

/**
 * C14N de infNFe/infEvento no contexto do namespace padrão da NF-e.
 * O XML enviado não leva xmlns nesses nós (cStat 587); o digest precisa do xmlns herdado.
 */
export function canonicalizeInNfeNamespace(elementXml: string): string {
  const inner = compactNfeXml(stripNfeDefaultXmlns(elementXml));
  const root = parseXmlRoot(`<NFe xmlns="${NFE_NS}">${inner}</NFe>`);
  const el = firstElementChild(root);
  if (!el) {
    throw new Error("XML inválido para canonicalização C14N");
  }
  const c14n = new C14nCanonicalization();
  return c14n.process(el as unknown as Node, {});
}

function buildSignatureBlock(
  digestValue: string,
  referenceUri: string,
  privateKeyPem: string,
  certPem: string,
): string {
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="${C14N_ALG}"/><SignatureMethod Algorithm="${RSA_SHA1}"/><Reference URI="${referenceUri}"><Transforms><Transform Algorithm="${ENVELOPED}"/><Transform Algorithm="${C14N_ALG}"/></Transforms><DigestMethod Algorithm="${SHA1}"/><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;

  // Assina o SignedInfo já canonicalizado (exigência XMLDSig).
  const signedInfoCanonical = canonicalizeXml(signedInfo);
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const md = forge.md.sha1.create();
  md.update(signedInfoCanonical, "utf8");
  const signatureValue = forge.util.encode64(privateKey.sign(md));

  const cert = forge.pki.certificateFromPem(certPem);
  const certDer = forge.asn1
    .toDer(forge.pki.certificateToAsn1(cert))
    .getBytes();
  const certB64 = forge.util.encode64(certDer).replace(/\r?\n/g, "");

  return `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo></Signature>`;
}

export function signInfNFe(
  infNFeXml: string,
  privateKeyPem: string,
  certPem: string,
): string {
  const inf = compactNfeXml(stripNfeDefaultXmlns(infNFeXml));
  const digestValue = sha1Base64(canonicalizeInNfeNamespace(inf));
  const idMatch = /Id="([^"]+)"/.exec(inf);
  const referenceUri = idMatch ? `#${idMatch[1]}` : "";
  const signatureBlock = buildSignatureBlock(
    digestValue,
    referenceUri,
    privateKeyPem,
    certPem,
  );
  return `<NFe xmlns="${NFE_NS}">${inf}${signatureBlock}</NFe>`;
}

function signXmlBlock(
  xmlBlock: string,
  privateKeyPem: string,
  certPem: string,
  wrapperTag: string,
): string {
  const inner = compactNfeXml(stripNfeDefaultXmlns(xmlBlock));
  const digestValue = sha1Base64(canonicalizeInNfeNamespace(inner));
  const idMatch = /Id="([^"]+)"/.exec(inner);
  const referenceUri = idMatch ? `#${idMatch[1]}` : "";
  const signatureBlock = buildSignatureBlock(
    digestValue,
    referenceUri,
    privateKeyPem,
    certPem,
  );
  return `<${wrapperTag} xmlns="${NFE_NS}" versao="1.00">${inner}${signatureBlock}</${wrapperTag}>`;
}

export function signInfEvento(
  infEventoXml: string,
  privateKeyPem: string,
  certPem: string,
): string {
  return signXmlBlock(infEventoXml, privateKeyPem, certPem, "evento");
}

export function signInfInut(
  infInutXml: string,
  privateKeyPem: string,
  certPem: string,
): string {
  return signXmlBlock(infInutXml, privateKeyPem, certPem, "inutNFe");
}

export function parseSefazAuthorizationResponse(xml: string): {
  success: boolean;
  /** Lote recebido — autorização assíncrona (cStat 103). */
  pending?: boolean;
  cStat?: string;
  xMotivo?: string;
  nProt?: string;
  chNFe?: string;
  nRec?: string;
} {
  const prot = /<infProt[\s\S]*?<\/infProt>/i.exec(xml)?.[0];
  const cStat = (prot ? tag(prot, "cStat") : null) ?? tag(xml, "cStat");
  const xMotivo = (prot ? tag(prot, "xMotivo") : null) ?? tag(xml, "xMotivo");
  const nProt = tag(xml, "nProt");
  const chNFe = tag(xml, "chNFe");
  const nRec = tag(xml, "nRec");
  const success = cStat === "100";
  const pending = cStat === "103";
  return {
    success,
    pending,
    cStat: cStat ?? undefined,
    xMotivo: xMotivo ?? undefined,
    nProt: nProt ?? undefined,
    chNFe: chNFe ?? undefined,
    nRec: nRec ?? undefined,
  };
}

function xmlBlock(xml: string, name: string): string | null {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>[\\s\\S]*?</(?:[\\w.-]+:)?${name}>`,
    "i",
  );
  return re.exec(xml)?.[0] ?? null;
}

function allTags(xml: string, name: string): string[] {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${name}>`,
    "gi",
  );
  return [...xml.matchAll(re)].map((m) => m[1].trim());
}

/**
 * Resultado do evento (cancelamento / CC-e) fica em `retEvento/infEvento`.
 * O cStat 128 do lote só significa “lote processado”, não é rejeição.
 */
export function parseSefazEventResponse(xml: string): {
  success: boolean;
  cStat?: string;
  xMotivo?: string;
  nProt?: string;
  chNFe?: string;
} {
  const retEvento = xmlBlock(xml, "retEvento");
  const infEvento = retEvento ? xmlBlock(retEvento, "infEvento") : null;
  const scope = infEvento ?? retEvento;
  let cStat = scope ? tag(scope, "cStat") : null;
  let xMotivo = scope ? tag(scope, "xMotivo") : null;
  if (!cStat || cStat === "128") {
    const stats = allTags(xml, "cStat");
    const motivos = allTags(xml, "xMotivo");
    const i = stats.findIndex((s) => s !== "128");
    if (i >= 0) {
      cStat = stats[i];
      xMotivo = motivos[i] ?? xMotivo;
    }
  }
  const nProt = (scope ? tag(scope, "nProt") : null) ?? tag(xml, "nProt");
  const chNFe = (scope ? tag(scope, "chNFe") : null) ?? tag(xml, "chNFe");
  const success =
    cStat === "135" ||
    cStat === "155" ||
    cStat === "101" ||
    cStat === "218" ||
    cStat === "573";
  return {
    success,
    cStat: cStat ?? undefined,
    xMotivo: xMotivo ?? undefined,
    nProt: nProt ?? undefined,
    chNFe: chNFe ?? undefined,
  };
}

/** Situação da NF-e: cStat de `retConsSitNFe`, sem infProt/retEvento aninhados. */
export function parseSefazConsultaSitResponse(xml: string): {
  success: boolean;
  cStat?: string;
  xMotivo?: string;
  nProt?: string;
  chNFe?: string;
} {
  const ret = xmlBlock(xml, "retConsSitNFe") ?? xml;
  const head = ret
    .replace(
      /<(?:[\w.-]+:)?protNFe[\s\S]*?<\/(?:[\w.-]+:)?protNFe>/gi,
      "",
    )
    .replace(
      /<(?:[\w.-]+:)?procEventoNFe[\s\S]*?<\/(?:[\w.-]+:)?procEventoNFe>/gi,
      "",
    );
  const cStat = tag(head, "cStat");
  const xMotivo = tag(head, "xMotivo");
  const nProt = tag(xml, "nProt");
  const chNFe = tag(xml, "chNFe");
  const success =
    cStat === "100" ||
    cStat === "101" ||
    cStat === "110" ||
    cStat === "150" ||
    cStat === "151";
  return {
    success,
    cStat: cStat ?? undefined,
    xMotivo: xMotivo ?? undefined,
    nProt: nProt ?? undefined,
    chNFe: chNFe ?? undefined,
  };
}

function tag(xml: string, name: string): string | null {
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${name}>`,
    "i",
  );
  return re.exec(xml)?.[1]?.trim() ?? null;
}

export function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^\uFEFF?\s*<\?xml\b[^?]*\?>\s*/i, "").trim();
}

/**
 * Envelope SOAP 1.2 da NF-e. O payload entra como XML (xs:any), não como texto
 * escapado — o ASMX da SEFAZ rejeita `&lt;enviNFe` e `<?xml?>` dentro do Body.
 */
export function buildSoapEnvelope(
  bodyInnerXml: string,
  wsdlNs: string,
): string {
  const inner = stripXmlDeclaration(bodyInnerXml);
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="${wsdlNs}">${inner}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

export function extractSoapBody(xml: string): string {
  const match = /<nfeResultMsg[^>]*>([\s\S]*?)<\/nfeResultMsg>/i.exec(xml);
  if (!match?.[1]) return xml;
  return match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}
