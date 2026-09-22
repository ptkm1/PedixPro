import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  clearMunicipioResolverCaches,
  findByCidadeUf,
  resolveMunicipioIbge,
  validateIbgeCode,
} from "./municipio-resolver.js";
import { normalizeMunicipioName, parseCepFlexible } from "@pedidos/shared";

vi.mock("./brasilapi.js", () => ({
  fetchIbgeMunicipios: vi.fn(async (uf: string) => {
    const u = uf.toUpperCase();
    if (u === "BA") {
      return [
        { id: 2927408, nome: "Salvador" },
        { id: 2919204, nome: "Lauro de Freitas" },
        { id: 2905701, nome: "Camaçari" },
        { id: 2928604, nome: "São Félix" },
      ];
    }
    if (u === "SP") {
      return [{ id: 3550308, nome: "São Paulo" }];
    }
    if (u === "RJ") {
      return [{ id: 3304557, nome: "Rio de Janeiro" }];
    }
    return [];
  }),
  fetchIbgeUfs: vi.fn(async () => []),
}));

vi.mock("../cep/brasilapi.js", () => ({
  fetchCep: vi.fn(async (cep: string) => {
    if (cep === "40000000") {
      return {
        cep,
        state: "BA",
        city: "Salvador",
        neighborhood: "Centro",
        street: "Rua Teste",
        cityIbgeCode: null,
      };
    }
    if (cep === "00000000") {
      throw new Error("CEP não encontrado.");
    }
    return {
      cep,
      state: "SP",
      city: "São Paulo",
      neighborhood: null,
      street: null,
      cityIbgeCode: null,
    };
  }),
}));

vi.mock("../cnpj/index.js", () => ({
  fetchCnpj: vi.fn(async () => {
    throw new Error("CNPJ mock não usado nestes casos");
  }),
}));

vi.mock("../../db.js", () => ({
  prisma: {
    customer: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("normalizeMunicipioName", () => {
  it("equaliza acentos, case e espaços", () => {
    expect(normalizeMunicipioName("São Félix")).toBe(
      normalizeMunicipioName("SAO FELIX"),
    );
    expect(normalizeMunicipioName("São  Félix")).toBe(
      normalizeMunicipioName("sao felix"),
    );
  });
});

describe("resolveMunicipioIbge", () => {
  beforeEach(() => {
    clearMunicipioResolverCaches();
  });

  it("Salvador/BA → 2927408", async () => {
    const r = await resolveMunicipioIbge(
      { cidade: "Salvador", uf: "BA" },
      { allowExternal: false },
    );
    expect(r.codigoIbge).toBe("2927408");
    expect(r.source).toBe("CIDADE_UF");
  });

  it("São Paulo/SP → 3550308", async () => {
    const r = await resolveMunicipioIbge(
      { cidade: "sao paulo", uf: "sp" },
      { allowExternal: false },
    );
    expect(r.codigoIbge).toBe("3550308");
  });

  it("Rio de Janeiro/RJ → 3304557", async () => {
    const r = await resolveMunicipioIbge(
      { cidade: "RIO DE JANEIRO", uf: "RJ" },
      { allowExternal: false },
    );
    expect(r.codigoIbge).toBe("3304557");
  });

  it("mantém codigo_ibge correto do CSV", async () => {
    const r = await resolveMunicipioIbge(
      { codigoIbge: "2927408", cidade: "Salvador", uf: "BA" },
      { allowExternal: false },
    );
    expect(r.codigoIbge).toBe("2927408");
    expect(r.source).toBe("CSV");
    expect(r.corrected).toBe(false);
  });

  it("corrige codigo_ibge incompatível com cidade/UF", async () => {
    const r = await resolveMunicipioIbge(
      { codigoIbge: "3550308", cidade: "Salvador", uf: "BA" },
      { allowExternal: false },
    );
    expect(r.codigoIbge).toBe("2927408");
    expect(r.corrected).toBe(true);
    expect(r.warnings.some((w) => w.includes("não corresponde"))).toBe(true);
  });

  it("resolve sem codigo_ibge só com cidade+UF", async () => {
    const r = await resolveMunicipioIbge(
      { cidade: "Camaçari", uf: "BA" },
      { allowExternal: false },
    );
    expect(r.codigoIbge).toBe("2905701");
  });

  it("cidade com acento via nome sem acento", async () => {
    const r = await findByCidadeUf("Sao Felix", "BA");
    expect(r?.codigoIbge).toBe("2928604");
  });

  it("cidade inexistente", async () => {
    const r = await resolveMunicipioIbge(
      { cidade: "Cidade Que Nao Existe", uf: "BA" },
      { allowExternal: false },
    );
    expect(r.codigoIbge).toBeNull();
  });

  it("UF inexistente", async () => {
    const r = await resolveMunicipioIbge(
      { cidade: "Salvador", uf: "XX" },
      { allowExternal: false },
    );
    expect(r.codigoIbge).toBeNull();
  });

  it("preenche cidade+IBGE via CEP quando cidade vazia", async () => {
    const r = await resolveMunicipioIbge(
      { cep: "40000-000" },
      { allowExternal: true },
    );
    expect(r.codigoIbge).toBe("2927408");
    expect(r.cidade).toBe("Salvador");
    expect(r.uf).toBe("BA");
    expect(r.source).toBe("CEP");
  });

  it("CEP em notação científica do Excel", async () => {
    const r = await resolveMunicipioIbge(
      { cep: "4,37E+07", cidade: "", uf: "BA" },
      { allowExternal: true },
    );
    // 4,37E+07 → 43700000; mock de CEP só trata 40000000 — aqui só valida parse
    // (resolveFromCep com CEP parseado diferente do mock retorna SP fallback do mock)
    expect(parseCepFlexible("4,37E+07")).toBe("43700000");
    expect(parseCepFlexible("4,37E+08")).toBe("43700000");
    expect(parseCepFlexible("41310-260")).toBe("41310260");
  });

  it("CEP inválido não quebra se cidade+UF ok", async () => {
    const r = await resolveMunicipioIbge(
      { cep: "00000000", cidade: "Salvador", uf: "BA" },
      { allowExternal: true },
    );
    expect(r.codigoIbge).toBe("2927408");
    expect(r.source).toBe("CIDADE_UF");
  });
});

describe("validateIbgeCode", () => {
  beforeEach(() => {
    clearMunicipioResolverCaches();
  });

  it("rejeita código que não é da UF/cidade", async () => {
    const v = await validateIbgeCode("3550308", "Salvador", "BA");
    expect(v.valid).toBe(false);
    expect(v.expectedForCityUf).toBe("2927408");
  });

  it("aceita 7 dígitos corretos", async () => {
    const v = await validateIbgeCode("2927408", "Salvador", "BA");
    expect(v.valid).toBe(true);
  });
});
