import { describe, expect, it } from "vitest";
import { validateNfeBeforeTransmission } from "./nfe-prevalidate.js";

describe("validateNfeBeforeTransmission", () => {
  it("bloqueia indIEDest 9 com indFinal 0 (696)", () => {
    const xml = `<infNFe><ide><indFinal>0</indFinal><tpAmb>1</tpAmb><tpEmis>1</tpEmis><dhEmi>2026-10-29T22:00:00-03:00</dhEmi></ide><dest><indIEDest>9</indIEDest></dest><NCM>19053100</NCM></infNFe>`;
    const r = validateNfeBeforeTransmission({
      infNFeXml: xml,
      uf: "SP",
      homologation: false,
      tpEmis: "1",
      accessKey: "0".repeat(44),
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === "CSTAT_696")).toBe(true);
  });

  it("exige autXML na Bahia (486)", () => {
    const xml = `<infNFe><ide><indFinal>1</indFinal><tpAmb>1</tpAmb><tpEmis>1</tpEmis><dhEmi>2026-10-29T22:00:00-03:00</dhEmi></ide><dest><indIEDest>9</indIEDest></dest><NCM>19053100</NCM></infNFe>`;
    const r = validateNfeBeforeTransmission({
      infNFeXml: xml,
      uf: "BA",
      homologation: false,
      tpEmis: "1",
      accessKey: "0".repeat(44),
    });
    expect(r.errors.some((e) => e.code === "CSTAT_486")).toBe(true);
  });
});
