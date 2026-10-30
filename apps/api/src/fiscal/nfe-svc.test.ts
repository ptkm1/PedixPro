import { describe, expect, it } from "vitest";
import {
  generateAccessKey,
  rebuildAccessKeyWithTpEmis,
} from "./nfe-access-key.js";
import {
  isSvcTpEmis,
  sefazOrgaoForEvent,
  shouldFallbackToSvc,
  svcForUf,
} from "./nfe-svc.js";

describe("svcForUf", () => {
  it("mapeia UFs da SVC-RS (tpEmis 7)", () => {
    for (const uf of [
      "AM",
      "BA",
      "CE",
      "GO",
      "MA",
      "MS",
      "MT",
      "PA",
      "PE",
      "PI",
      "PR",
      "SE",
    ]) {
      const svc = svcForUf(uf);
      expect(svc.tpEmis, uf).toBe("7");
      expect(svc.authorizer, uf).toBe("SVCRS");
    }
  });

  it("mapeia SP, MG, RS e UFs da SVRS para SVC-AN (tpEmis 6)", () => {
    for (const uf of [
      "SP",
      "MG",
      "RS",
      "SC",
      "RJ",
      "DF",
      "ES",
      "TO",
      "AC",
    ]) {
      const svc = svcForUf(uf);
      expect(svc.tpEmis, uf).toBe("6");
      expect(svc.authorizer, uf).toBe("SVCAN");
    }
  });

  it("usa SVC-AN como padrão para UF desconhecida", () => {
    expect(svcForUf("XX").tpEmis).toBe("6");
    expect(svcForUf(null).tpEmis).toBe("6");
  });
});

describe("shouldFallbackToSvc", () => {
  it("não dispara em autorização OK ou lote 103", () => {
    expect(
      shouldFallbackToSvc({
        ok: true,
        parsed: { cStat: "100", xMotivo: "Autorizado" },
      }),
    ).toBe(false);
    expect(
      shouldFallbackToSvc({
        ok: false,
        pending: true,
        parsed: { cStat: "103", xMotivo: "Lote recebido" },
      }),
    ).toBe(false);
  });

  it("não dispara em rejeição de negócio", () => {
    expect(
      shouldFallbackToSvc({
        ok: false,
        error: "225: Falha no Schema XML",
        parsed: { cStat: "225", xMotivo: "Falha no Schema XML" },
      }),
    ).toBe(false);
    expect(
      shouldFallbackToSvc({
        ok: false,
        error: "539: Duplicidade",
        parsed: { cStat: "539", xMotivo: "Duplicidade de NF-e" },
      }),
    ).toBe(false);
  });

  it("dispara só em cStat 108/109 (timeout não transmite na SVC)", () => {
    expect(
      shouldFallbackToSvc({
        ok: false,
        error: "108: Servico Paralisado Momentaneamente",
        parsed: { cStat: "108", xMotivo: "Servico Paralisado Momentaneamente" },
      }),
    ).toBe(true);
    expect(
      shouldFallbackToSvc({
        ok: false,
        error: "109: Servico Paralisado sem Previsao",
        parsed: { cStat: "109", xMotivo: "Servico Paralisado sem Previsao" },
      }),
    ).toBe(true);
    expect(
      shouldFallbackToSvc({
        ok: false,
        error: "Timeout SEFAZ (60000ms)",
        parsed: { success: false } as { cStat?: string },
      }),
    ).toBe(false);
    expect(
      shouldFallbackToSvc({
        ok: false,
        error: "SEFAZ HTTP 503: service unavailable",
        parsed: {},
      }),
    ).toBe(false);
    expect(
      shouldFallbackToSvc({
        ok: false,
        error: "connect ECONNREFUSED 127.0.0.1:443",
        parsed: {},
      }),
    ).toBe(false);
  });

  it("não dispara em falha local de TLS", () => {
    expect(
      shouldFallbackToSvc({
        ok: false,
        error:
          "Falha de TLS com a SEFAZ: a cadeia ICP-Brasil não pôde ser validada.",
        parsed: {},
      }),
    ).toBe(false);
  });
});

describe("rebuildAccessKeyWithTpEmis", () => {
  it("troca tpEmis, preserva cNF e recalcula DV", () => {
    const key = generateAccessKey({
      uf: "SP",
      issuedAt: new Date("2026-03-15T12:00:00-03:00"),
      cnpj: "11222333000181",
      series: 1,
      number: 42,
      tpEmis: "1",
    });
    expect(key).toHaveLength(44);
    expect(key[34]).toBe("1");

    const rebuilt = rebuildAccessKeyWithTpEmis(key, "6");
    expect(rebuilt).toHaveLength(44);
    expect(rebuilt[34]).toBe("6");
    expect(rebuilt.slice(0, 34)).toBe(key.slice(0, 34));
    expect(rebuilt.slice(35, 43)).toBe(key.slice(35, 43));
    expect(rebuilt).not.toBe(key);
  });
});

describe("isSvcTpEmis / sefazOrgaoForEvent", () => {
  it("identifica tpEmis SVC e órgão do evento", () => {
    expect(isSvcTpEmis("1")).toBe(false);
    expect(isSvcTpEmis("6")).toBe(true);
    expect(isSvcTpEmis("7")).toBe(true);
    expect(sefazOrgaoForEvent("SP", "1")).toBe("35");
    expect(sefazOrgaoForEvent("SP", "6")).toBe("91");
    expect(sefazOrgaoForEvent("SP", "7")).toBe("43");
  });
});
