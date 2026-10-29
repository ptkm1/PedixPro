import { BRAZIL_UFS, type IbgeMunicipio, type IbgeUf } from "@pedidos/shared";
import { brasilApiHeaders } from "../brasilapi/headers.js";

type BrasilApiUf = { id?: number; sigla?: string; nome?: string };
type BrasilApiMunicipio = {
  id?: number;
  nome?: string;
  codigo_ibge?: string;
};

const FETCH_MS = 8_000;
const CACHE_MS = 24 * 60 * 60 * 1000;

let ufsCache: { at: number; data: IbgeUf[] } | null = null;
const municipiosCache = new Map<string, { at: number; data: IbgeMunicipio[] }>();

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: brasilApiHeaders(),
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

function mapUfs(json: unknown): IbgeUf[] {
  if (!Array.isArray(json)) return [];
  return (json as BrasilApiUf[])
    .filter((u) => typeof u.sigla === "string" && typeof u.nome === "string")
    .map((u) => ({
      id: Number(u.id ?? 0),
      sigla: u.sigla!.toUpperCase(),
      nome: u.nome!,
    }))
    .filter((u) => /^[A-Z]{2}$/.test(u.sigla))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
}

function mapMunicipios(json: unknown): IbgeMunicipio[] {
  if (!Array.isArray(json)) return [];
  return (json as BrasilApiMunicipio[])
    .filter((m) => typeof m.nome === "string")
    .map((m) => {
      const rawId = m.id ?? m.codigo_ibge;
      const id =
        typeof rawId === "number"
          ? rawId
          : typeof rawId === "string"
            ? Number(rawId)
            : NaN;
      return { id, nome: m.nome! };
    })
    .filter((m) => Number.isFinite(m.id) && m.id > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
}

export async function fetchIbgeUfs(): Promise<IbgeUf[]> {
  if (ufsCache && Date.now() - ufsCache.at < CACHE_MS) {
    return ufsCache.data;
  }
  const sources = [
    "https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome",
    "https://brasilapi.com.br/api/ibge/uf/v1",
  ];
  for (const url of sources) {
    try {
      const data = mapUfs(await fetchJson(url));
      if (data.length >= 27) {
        ufsCache = { at: Date.now(), data };
        return data;
      }
    } catch {
      /* tenta a próxima fonte */
    }
  }
  return BRAZIL_UFS;
}

export async function fetchIbgeMunicipios(
  uf: string,
): Promise<IbgeMunicipio[]> {
  const sigla = uf.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(sigla)) {
    throw new Error("UF inválida.");
  }
  const hit = municipiosCache.get(sigla);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.data;
  }
  const sources = [
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sigla}/municipios`,
    `https://brasilapi.com.br/api/ibge/municipios/v1/${sigla}`,
  ];
  for (const url of sources) {
    try {
      const data = mapMunicipios(await fetchJson(url));
      if (data.length > 0) {
        municipiosCache.set(sigla, { at: Date.now(), data });
        return data;
      }
    } catch {
      /* tenta a próxima fonte */
    }
  }
  return [];
}
