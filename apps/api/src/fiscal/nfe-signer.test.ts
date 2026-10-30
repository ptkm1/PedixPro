import { describe, expect, it } from "vitest";
import {
  buildSoapEnvelope,
  canonicalizeInNfeNamespace,
  compactNfeXml,
  parseSefazConsultaSitResponse,
  parseSefazEventResponse,
  stripNfeDefaultXmlns,
  stripXmlDeclaration,
} from "./nfe-signer.js";

const NS = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";

describe("buildSoapEnvelope", () => {
  it("coloca o enviNFe como XML filho, sem escape e sem declaração", () => {
    const inner =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>1</idLote></enviNFe>`;
    const soap = buildSoapEnvelope(inner, NS);
    expect(soap).toContain("<nfeDadosMsg");
    expect(soap).toContain("<enviNFe xmlns=");
    expect(soap).not.toContain("&lt;enviNFe");
    expect(soap).not.toMatch(/nfeDadosMsg[^>]*>\s*<\?xml/);
    expect(stripXmlDeclaration(inner)).toMatch(/^<enviNFe/);
  });
});

describe("canonicalizeInNfeNamespace", () => {
  it("inclui o xmlns padrão no C14N sem gravá-lo em infNFe", () => {
    const inf = `<infNFe Id="NFe1" versao="4.00"><ide/></infNFe>`;
    const canonical = canonicalizeInNfeNamespace(inf);
    expect(canonical.startsWith("<infNFe xmlns=")).toBe(true);
    expect(canonical).toContain('xmlns="http://www.portalfiscal.inf.br/nfe"');
    expect(stripNfeDefaultXmlns(inf)).not.toContain("xmlns=");
  });
});

describe("parseSefazEventResponse", () => {
  it("lê o cStat do retEvento, não o 128 do lote", () => {
    const xml = `<retEnvEvento>
  <cStat>128</cStat>
  <xMotivo>Lote de Evento Processado</xMotivo>
  <retEvento>
    <infEvento>
      <cStat>135</cStat>
      <xMotivo>Evento registrado e vinculado a NF-e</xMotivo>
      <nProt>123</nProt>
      <chNFe>29261011222333000181550010000000011000000010</chNFe>
    </infEvento>
  </retEvento>
</retEnvEvento>`;
    const parsed = parseSefazEventResponse(xml);
    expect(parsed.cStat).toBe("135");
    expect(parsed.success).toBe(true);
    expect(parsed.nProt).toBe("123");
  });

  it("trata duplicidade 573 como evento já registrado", () => {
    const xml = `<retEnvEvento>
  <cStat>128</cStat>
  <xMotivo>Lote de Evento Processado</xMotivo>
  <retEvento>
    <infEvento>
      <cStat>573</cStat>
      <xMotivo>Duplicidade de Evento</xMotivo>
    </infEvento>
  </retEvento>
</retEnvEvento>`;
    expect(parseSefazEventResponse(xml).success).toBe(true);
  });

  it("lê cStat prefixado (nfe:cStat) depois do 128", () => {
    const xml = `<nfe:retEnvEvento xmlns:nfe="http://www.portalfiscal.inf.br/nfe">
  <nfe:cStat>128</nfe:cStat>
  <nfe:xMotivo>Lote de Evento Processado</nfe:xMotivo>
  <nfe:retEvento>
    <nfe:infEvento>
      <nfe:cStat>501</nfe:cStat>
      <nfe:xMotivo>Prazo de Cancelamento Superior ao Previsto na Legislacao</nfe:xMotivo>
    </nfe:infEvento>
  </nfe:retEvento>
</nfe:retEnvEvento>`;
    const parsed = parseSefazEventResponse(xml);
    expect(parsed.cStat).toBe("501");
    expect(parsed.success).toBe(false);
  });
});

describe("parseSefazConsultaSitResponse", () => {
  it("usa o cStat da consulta, não o 135 de evento aninhado", () => {
    const xml = `<retConsSitNFe>
  <cStat>100</cStat>
  <xMotivo>Autorizado o uso da NF-e</xMotivo>
  <protNFe><infProt><cStat>100</cStat><nProt>141250000000000</nProt></infProt></protNFe>
  <procEventoNFe>
    <retEvento>
      <infEvento>
        <cStat>135</cStat>
        <xMotivo>Evento registrado e vinculado a NF-e</xMotivo>
      </infEvento>
    </retEvento>
  </procEventoNFe>
</retConsSitNFe>`;
    const parsed = parseSefazConsultaSitResponse(xml);
    expect(parsed.cStat).toBe("100");
    expect(parsed.success).toBe(true);
  });

  it("reconhece NF-e cancelada (101)", () => {
    const xml = `<retConsSitNFe>
  <cStat>101</cStat>
  <xMotivo>Cancelamento de NF-e homologado</xMotivo>
</retConsSitNFe>`;
    const parsed = parseSefazConsultaSitResponse(xml);
    expect(parsed.cStat).toBe("101");
    expect(parsed.success).toBe(true);
  });
});

describe("compactNfeXml", () => {
  it("remove quebras e espaços entre tags (cStat 588)", () => {
    const pretty = `<infNFe Id="NFe1" versao="4.00">
  <ide>
    <cUF>35</cUF>
  </ide>
</infNFe>`;
    expect(compactNfeXml(pretty)).toBe(
      `<infNFe Id="NFe1" versao="4.00"><ide><cUF>35</cUF></ide></infNFe>`,
    );
    expect(compactNfeXml(pretty)).not.toMatch(/>\s+</);
  });
});
