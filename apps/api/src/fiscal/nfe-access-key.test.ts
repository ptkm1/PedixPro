import { describe, expect, it } from "vitest";
import {
  formatNfeDateTime,
  generateAccessKey,
  isValidNfeAccessKey,
  nfeMod11CheckDigit,
  rebuildAccessKeyWithTpEmis,
} from "./nfe-access-key.js";

describe("chave NF-e / módulo 11", () => {
  it("DV módulo 11 bate com a chave gerada", () => {
    const key = generateAccessKey({
      uf: "BA",
      issuedAt: new Date("2026-10-29T22:00:00-03:00"),
      cnpj: "13937075000156",
      series: 2,
      number: 15,
      tpEmis: "1",
    });
    expect(key).toHaveLength(44);
    expect(nfeMod11CheckDigit(key.slice(0, 43))).toBe(key[43]);
    expect(isValidNfeAccessKey(key)).toBe(true);
    expect(key.slice(22, 25)).toBe("002");
  });

  it("rebuild tpEmis recalcula só o DV", () => {
    const key = generateAccessKey({
      uf: "BA",
      issuedAt: new Date("2026-10-29T22:00:00-03:00"),
      cnpj: "13937075000156",
      series: 1,
      number: 1,
      tpEmis: "1",
    });
    const rebuilt = rebuildAccessKeyWithTpEmis(key, "7");
    expect(rebuilt[34]).toBe("7");
    expect(isValidNfeAccessKey(rebuilt)).toBe(true);
  });
});

describe("dhEmi (rejeição 703)", () => {
  it("não cola -03:00 na hora UTC", () => {
    const utc = new Date("2026-10-30T01:50:00.000Z");
    const dh = formatNfeDateTime(utc);
    expect(dh).toBe("2026-10-29T22:50:00-03:00");
    expect(dh.endsWith("Z")).toBe(false);
  });
});
