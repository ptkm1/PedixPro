/**
 * Resolução centralizada de código IBGE de município.
 * Cache em processo por UF / CEP / CNPJ / cidade+UF — adequado a importação em massa.
 * Lista de municípios: BrasilAPI (1 fetch por UF, reutilizado).
 */
import {
  cepDigitsOnly,
  cnpjDigitsOnly,
  ibgeDigitsOnly,
  isValidCnpj,
  isValidIbgeMunicipioCode,
  normalizeMunicipioName,
  normalizeUf,
  type IbgeMunicipio,
  type MunicipioIbgeResolution,
  type ResolveMunicipioIbgeInput,
} from "@pedidos/shared";
import { fetchCep } from "../cep/brasilapi.js";
import { fetchCnpj } from "../cnpj/index.js";
import { prisma } from "../../db.js";
import { fetchIbgeMunicipios } from "./brasilapi.js";

const municipiosByUf = new Map<string, IbgeMunicipio[]>();
const resolveByCidadeUf = new Map<string, string | null>();
const resolveByCep = new Map<string, MunicipioIbgeResolution>();
const resolveByCnpj = new Map<string, MunicipioIbgeResolution>();

/** Limite de consultas externas concorrentes (CEP/CNPJ) na importação. */
let externalInFlight = 0;
const EXTERNAL_MAX = 4;
const externalWaiters: Array<() => void> = [];

async function withExternalSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (externalInFlight >= EXTERNAL_MAX) {
    await new Promise<void>((resolve) => externalWaiters.push(resolve));
  }
  externalInFlight += 1;
  try {
    return await fn();
  } finally {
    externalInFlight -= 1;
    const next = externalWaiters.shift();
    if (next) next();
  }
}

export function clearMunicipioResolverCaches(): void {
  municipiosByUf.clear();
  resolveByCidadeUf.clear();
  resolveByCep.clear();
  resolveByCnpj.clear();
}

export async function loadMunicipiosForUf(uf: string): Promise<IbgeMunicipio[]> {
  const state = normalizeUf(uf);
  if (!/^[A-Z]{2}$/.test(state)) return [];
  const hit = municipiosByUf.get(state);
  if (hit) return hit;
  try {
    const list = await fetchIbgeMunicipios(state);
    municipiosByUf.set(state, list);
    return list;
  } catch {
    return [];
  }
}

function cidadeUfCacheKey(cidade: string, uf: string): string {
  return `${normalizeUf(uf)}:${normalizeMunicipioName(cidade)}`;
}

/** Match estrito por nome normalizado + UF (sem aproximação frouxa). */
export async function findByCidadeUf(
  cidade: string,
  uf: string,
): Promise<{ codigoIbge: string; nome: string; uf: string } | null> {
  const state = normalizeUf(uf);
  const key = cidadeUfCacheKey(cidade, state);
  if (resolveByCidadeUf.has(key)) {
    const code = resolveByCidadeUf.get(key)!;
    if (!code) return null;
    return { codigoIbge: code, nome: cidade.trim(), uf: state };
  }
  const list = await loadMunicipiosForUf(state);
  if (!list.length) {
    resolveByCidadeUf.set(key, null);
    return null;
  }
  const norm = normalizeMunicipioName(cidade);
  const exact = list.find((m) => normalizeMunicipioName(m.nome) === norm);
  if (!exact) {
    resolveByCidadeUf.set(key, null);
    return null;
  }
  const code = String(exact.id);
  resolveByCidadeUf.set(key, code);
  return { codigoIbge: code, nome: exact.nome, uf: state };
}

export async function validateIbgeCode(
  codigoIbge: string,
  cidade?: string | null,
  uf?: string | null,
): Promise<{
  valid: boolean;
  codigoIbge: string | null;
  expectedForCityUf: string | null;
  reason?: string;
}> {
  const digits = ibgeDigitsOnly(codigoIbge);
  if (!isValidIbgeMunicipioCode(digits)) {
    return {
      valid: false,
      codigoIbge: null,
      expectedForCityUf: null,
      reason: "Código IBGE deve ter 7 dígitos.",
    };
  }
  const state = uf ? normalizeUf(uf) : "";
  if (cidade?.trim() && /^[A-Z]{2}$/.test(state)) {
    const match = await findByCidadeUf(cidade, state);
    if (match && match.codigoIbge !== digits) {
      return {
        valid: false,
        codigoIbge: digits,
        expectedForCityUf: match.codigoIbge,
        reason: `Código IBGE ${digits} não corresponde a ${cidade.trim()}/${state}.`,
      };
    }
    if (!match) {
      // Sem município na base para cruzar — aceita formato se UF bate no código (2 primeiros digitos ≠ cUF exato, mas checamos lista)
      const list = await loadMunicipiosForUf(state);
      const inUf = list.some((m) => String(m.id) === digits);
      if (list.length && !inUf) {
        return {
          valid: false,
          codigoIbge: digits,
          expectedForCityUf: null,
          reason: `Código IBGE ${digits} não pertence à UF ${state}.`,
        };
      }
    }
  }
  return { valid: true, codigoIbge: digits, expectedForCityUf: null };
}

async function resolveFromCep(
  cepRaw: string,
): Promise<MunicipioIbgeResolution | null> {
  const cep = cepDigitsOnly(cepRaw);
  if (cep.length !== 8) return null;
  const cached = resolveByCep.get(cep);
  if (cached) return cached;

  try {
    const data = await withExternalSlot(() => fetchCep(cep));
    let codigo: string | null =
      data.cityIbgeCode && isValidIbgeMunicipioCode(data.cityIbgeCode)
        ? ibgeDigitsOnly(data.cityIbgeCode)
        : null;
    let cidade = data.city?.trim() || null;
    let uf = data.state ? normalizeUf(data.state) : null;
    if (!codigo && cidade && uf) {
      const hit = await findByCidadeUf(cidade, uf);
      if (hit) {
        codigo = hit.codigoIbge;
        cidade = hit.nome;
      }
    }
    const result: MunicipioIbgeResolution = {
      codigoIbge: codigo,
      cidade,
      uf,
      source: codigo ? "CEP" : null,
      confidence: codigo ? "HIGH" : null,
      warnings: codigo ? [] : ["CEP consultado sem município IBGE resolvido."],
      corrected: false,
    };
    resolveByCep.set(cep, result);
    return result;
  } catch {
    const fail: MunicipioIbgeResolution = {
      codigoIbge: null,
      cidade: null,
      uf: null,
      source: null,
      confidence: null,
      warnings: ["Falha ao consultar CEP para IBGE."],
      corrected: false,
    };
    resolveByCep.set(cep, fail);
    return fail;
  }
}

async function resolveFromCnpj(
  cnpjRaw: string,
  csvCidade?: string | null,
  csvUf?: string | null,
): Promise<MunicipioIbgeResolution | null> {
  const cnpj = cnpjDigitsOnly(cnpjRaw);
  if (cnpj.length !== 14 || !isValidCnpj(cnpj)) return null;
  const cacheKey = cnpj;
  const cached = resolveByCnpj.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await withExternalSlot(() => fetchCnpj(cnpj));
    const warnings: string[] = [];
    const cnpjCity = data.municipio?.trim() || null;
    const cnpjUf = data.uf ? normalizeUf(data.uf) : null;
    const csvCity = csvCidade?.trim() || null;
    const csvState = csvUf ? normalizeUf(csvUf) : "";

    if (
      csvCity &&
      cnpjCity &&
      csvState &&
      cnpjUf &&
      (normalizeMunicipioName(csvCity) !== normalizeMunicipioName(cnpjCity) ||
        csvState !== cnpjUf)
    ) {
      warnings.push(
        `Divergência cadastral encontrada. CSV: ${csvCity}/${csvState} · Consulta CNPJ: ${cnpjCity}/${cnpjUf}.`,
      );
      // Não usa IBGE do CNPJ quando diverge do CSV — evita endereço errado.
      const result: MunicipioIbgeResolution = {
        codigoIbge: null,
        cidade: cnpjCity,
        uf: cnpjUf,
        source: null,
        confidence: null,
        warnings,
        corrected: false,
      };
      resolveByCnpj.set(cacheKey, result);
      return result;
    }

    let codigo: string | null =
      data.cityIbgeCode && isValidIbgeMunicipioCode(data.cityIbgeCode)
        ? ibgeDigitsOnly(data.cityIbgeCode)
        : null;

    if (codigo && cnpjCity && cnpjUf) {
      const v = await validateIbgeCode(codigo, cnpjCity, cnpjUf);
      if (!v.valid && v.expectedForCityUf) {
        warnings.push(
          `IBGE do CNPJ (${codigo}) corrigido para ${v.expectedForCityUf}.`,
        );
        codigo = v.expectedForCityUf;
      } else if (!v.valid) {
        codigo = null;
      }
    }

    if (!codigo && data.cep) {
      const viaCep = await resolveFromCep(data.cep);
      if (viaCep?.codigoIbge) {
        const result: MunicipioIbgeResolution = {
          codigoIbge: viaCep.codigoIbge,
          cidade: viaCep.cidade ?? cnpjCity,
          uf: viaCep.uf ?? cnpjUf,
          source: "CNPJ_CEP",
          confidence: "HIGH",
          warnings,
          corrected: false,
        };
        resolveByCnpj.set(cacheKey, result);
        return result;
      }
    }

    if (!codigo && cnpjCity && cnpjUf) {
      const hit = await findByCidadeUf(cnpjCity, cnpjUf);
      if (hit) codigo = hit.codigoIbge;
    }

    const result: MunicipioIbgeResolution = {
      codigoIbge: codigo,
      cidade: cnpjCity,
      uf: cnpjUf,
      source: codigo ? "CNPJ" : null,
      confidence: codigo ? "MEDIUM" : null,
      warnings,
      corrected: false,
    };
    resolveByCnpj.set(cacheKey, result);
    return result;
  } catch {
    const fail: MunicipioIbgeResolution = {
      codigoIbge: null,
      cidade: null,
      uf: null,
      source: null,
      confidence: null,
      warnings: ["Falha ao consultar CNPJ para IBGE."],
      corrected: false,
    };
    resolveByCnpj.set(cacheKey, fail);
    return fail;
  }
}

export type ResolveMunicipioOptions = {
  /** Se false, não chama CEP/CNPJ externos (só CSV + cidade/UF em cache). */
  allowExternal?: boolean;
};

/**
 * Ordem: CSV IBGE (validado) → CEP → CNPJ → cidade+UF.
 * Não altera endereço do cliente — só resolve código IBGE (+ avisos).
 */
export async function resolveMunicipioIbge(
  input: ResolveMunicipioIbgeInput,
  opts: ResolveMunicipioOptions = {},
): Promise<MunicipioIbgeResolution> {
  const allowExternal = opts.allowExternal !== false;
  const warnings: string[] = [];
  let cidade = input.cidade?.trim() || null;
  let uf = input.uf ? normalizeUf(input.uf) : null;
  if (uf && uf.length !== 2) uf = null;

  const csvCodeRaw = input.codigoIbge?.trim() || "";
  if (csvCodeRaw) {
    const v = await validateIbgeCode(csvCodeRaw, cidade, uf);
    if (v.valid && v.codigoIbge) {
      return {
        codigoIbge: v.codigoIbge,
        cidade,
        uf,
        source: "CSV",
        confidence: "HIGH",
        warnings,
        corrected: false,
      };
    }
    if (v.expectedForCityUf) {
      warnings.push(
        `Código IBGE informado no CSV não corresponde ao município ${cidade}/${uf}. Corrigido automaticamente para ${v.expectedForCityUf}.`,
      );
      return {
        codigoIbge: v.expectedForCityUf,
        cidade,
        uf,
        source: "CIDADE_UF",
        confidence: "HIGH",
        warnings,
        corrected: true,
      };
    }
    if (v.reason) warnings.push(v.reason);
  }

  // CEP: útil sobretudo quando falta cidade/UF; também como fonte de IBGE.
  if (allowExternal && input.cep) {
    const viaCep = await resolveFromCep(input.cep);
    if (viaCep) {
      warnings.push(...viaCep.warnings);
      if (
        cidade &&
        uf &&
        viaCep.cidade &&
        viaCep.uf &&
        (normalizeMunicipioName(cidade) !==
          normalizeMunicipioName(viaCep.cidade) ||
          uf !== viaCep.uf)
      ) {
        warnings.push(
          `Divergência cadastral encontrada. CSV: ${cidade}/${uf} · Consulta CEP: ${viaCep.cidade}/${viaCep.uf}.`,
        );
        // Mantém cidade/UF do CSV; tenta IBGE local abaixo.
      } else {
        if (!cidade && viaCep.cidade) cidade = viaCep.cidade;
        if (!uf && viaCep.uf) uf = viaCep.uf;
        if (viaCep.codigoIbge) {
          return {
            codigoIbge: viaCep.codigoIbge,
            cidade: cidade ?? viaCep.cidade,
            uf: uf ?? viaCep.uf,
            source: "CEP",
            confidence: "HIGH",
            warnings,
            corrected: Boolean(csvCodeRaw),
          };
        }
      }
    }
  }

  if (allowExternal && input.cnpj) {
    const viaCnpj = await resolveFromCnpj(input.cnpj, cidade, uf);
    if (viaCnpj) {
      warnings.push(...viaCnpj.warnings);
      const diverged = viaCnpj.warnings.some((w) =>
        w.includes("Divergência cadastral"),
      );
      if (viaCnpj.codigoIbge && !diverged) {
        return {
          codigoIbge: viaCnpj.codigoIbge,
          cidade: cidade ?? viaCnpj.cidade,
          uf: uf ?? viaCnpj.uf,
          source: viaCnpj.source ?? "CNPJ",
          confidence: viaCnpj.confidence ?? "MEDIUM",
          warnings,
          corrected: Boolean(csvCodeRaw),
        };
      }
    }
  }

  if (cidade && uf) {
    const hit = await findByCidadeUf(cidade, uf);
    if (hit) {
      return {
        codigoIbge: hit.codigoIbge,
        cidade: hit.nome,
        uf: hit.uf,
        source: "CIDADE_UF",
        confidence: "HIGH",
        warnings,
        corrected: Boolean(csvCodeRaw),
      };
    }
    warnings.push(`Município não localizado: ${cidade}/${uf}.`);
  }

  return {
    codigoIbge: null,
    cidade,
    uf,
    source: null,
    confidence: null,
    warnings: warnings.length
      ? warnings
      : ["Não foi possível identificar o código IBGE do município."],
    corrected: false,
  };
}

/** Re-resolve e persiste cityIbgeCode no cliente (tenant-safe). */
export async function ensureCustomerCityIbge(params: {
  organizationId: string;
  customerId: string;
}): Promise<{
  ok: boolean;
  cityIbgeCode: string | null;
  resolution: MunicipioIbgeResolution | null;
  error?: string;
}> {
  const customer = await prisma.customer.findFirst({
    where: {
      id: params.customerId,
      organizationId: params.organizationId,
    },
    select: {
      id: true,
      cityIbgeCode: true,
      city: true,
      state: true,
      cep: true,
      cnpj: true,
    },
  });
  if (!customer) {
    return {
      ok: false,
      cityIbgeCode: null,
      resolution: null,
      error: "Cliente não encontrado.",
    };
  }

  const existing = customer.cityIbgeCode?.replace(/\D/g, "") ?? "";
  if (isValidIbgeMunicipioCode(existing) && customer.city && customer.state) {
    const v = await validateIbgeCode(
      existing,
      customer.city,
      customer.state,
    );
    if (v.valid) {
      return {
        ok: true,
        cityIbgeCode: existing,
        resolution: {
          codigoIbge: existing,
          cidade: customer.city,
          uf: customer.state,
          source: "EXISTING",
          confidence: "HIGH",
          warnings: [],
          corrected: false,
        },
      };
    }
  }

  const resolution = await resolveMunicipioIbge({
    codigoIbge: existing || null,
    cep: customer.cep,
    cidade: customer.city,
    uf: customer.state,
    cnpj: customer.cnpj,
  });

  if (!resolution.codigoIbge) {
    console.warn(
      JSON.stringify({
        event: "IBGE_RESOLUTION_FAILED",
        clienteId: customer.id,
        cidade: customer.city,
        uf: customer.state,
        cep: customer.cep ? cepDigitsOnly(customer.cep) : null,
        reason: resolution.warnings.join("; ") || "unresolved",
      }),
    );
    return {
      ok: false,
      cityIbgeCode: null,
      resolution,
      error:
        "Não foi possível identificar o código IBGE do município deste cliente. Verifique CEP, cidade e UF no cadastro.",
    };
  }

  if (resolution.codigoIbge !== existing) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { cityIbgeCode: resolution.codigoIbge },
    });
  }

  return { ok: true, cityIbgeCode: resolution.codigoIbge, resolution };
}

/** Enriquece resposta de CEP com cityIbgeCode via cidade+UF. */
export async function enrichCepWithIbge(data: {
  cep: string;
  state: string;
  city: string;
  neighborhood: string | null;
  street: string | null;
  cityIbgeCode: string | null;
}): Promise<typeof data> {
  if (data.cityIbgeCode && isValidIbgeMunicipioCode(data.cityIbgeCode)) {
    return data;
  }
  if (!data.city?.trim() || !data.state?.trim()) return data;
  const hit = await findByCidadeUf(data.city, data.state);
  if (!hit) return data;
  return { ...data, cityIbgeCode: hit.codigoIbge };
}
