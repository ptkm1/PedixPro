import { describe, expect, it } from "vitest";
import {
  getAutorizacaoUrl,
  getConsultaProtocoloUrl,
  getRecepcaoEventoUrl,
} from "./sefaz-endpoints.js";

describe("endpoints SVC", () => {
  it("autorização normal de SP não usa SVC", () => {
    expect(getAutorizacaoUrl("SP", true)).toContain("nfe.fazenda.sp.gov.br");
    expect(getAutorizacaoUrl("SP", false)).toContain("nfe.fazenda.sp.gov.br");
  });

  it("tpEmis 6 usa SVC-AN (sefazvirtual) no mesmo ambiente", () => {
    expect(getAutorizacaoUrl("SP", true, "6")).toContain(
      "hom.sefazvirtual.fazenda.gov.br",
    );
    expect(getAutorizacaoUrl("SP", false, "6")).toContain(
      "www.sefazvirtual.fazenda.gov.br",
    );
    expect(getRecepcaoEventoUrl("SP", false, "6")).toContain(
      "www.sefazvirtual.fazenda.gov.br",
    );
    expect(getConsultaProtocoloUrl("SP", true, "6")).toContain(
      "hom.sefazvirtual.fazenda.gov.br",
    );
  });

  it("Bahia emite no SEFAZ-BA quando tpEmis é normal", () => {
    expect(getAutorizacaoUrl("BA", false, "1")).toContain("nfe.sefaz.ba.gov.br");
    expect(getAutorizacaoUrl("BA", true, "1")).toContain("hnfe.sefaz.ba.gov.br");
    expect(getAutorizacaoUrl("BA", false, "7")).toContain("nfe.svrs.rs.gov.br");
  });

  it("tpEmis 7 usa SVC-RS no mesmo ambiente", () => {
    expect(getAutorizacaoUrl("PR", true, "7")).toContain(
      "nfe-homologacao.svrs.rs.gov.br",
    );
    expect(getAutorizacaoUrl("PR", false, "7")).toContain(
      "nfe.svrs.rs.gov.br",
    );
  });
});
