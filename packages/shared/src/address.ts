/** Resposta normalizada de GET `/integrations/cep/:8digits`. */
export type CepAddressData = {
  cep: string;
  state: string;
  city: string;
  neighborhood: string | null;
  street: string | null;
  cityIbgeCode: string | null;
};

export type IbgeUf = {
  id: number;
  sigla: string;
  nome: string;
};

export type IbgeMunicipio = {
  id: number;
  nome: string;
};

/** 27 UFs (IBGE). Fallback quando BrasilAPI/IBGE estão fora. */
export const BRAZIL_UFS: IbgeUf[] = [
  { id: 12, sigla: "AC", nome: "Acre" },
  { id: 27, sigla: "AL", nome: "Alagoas" },
  { id: 16, sigla: "AP", nome: "Amapá" },
  { id: 13, sigla: "AM", nome: "Amazonas" },
  { id: 29, sigla: "BA", nome: "Bahia" },
  { id: 23, sigla: "CE", nome: "Ceará" },
  { id: 53, sigla: "DF", nome: "Distrito Federal" },
  { id: 32, sigla: "ES", nome: "Espírito Santo" },
  { id: 52, sigla: "GO", nome: "Goiás" },
  { id: 21, sigla: "MA", nome: "Maranhão" },
  { id: 51, sigla: "MT", nome: "Mato Grosso" },
  { id: 50, sigla: "MS", nome: "Mato Grosso do Sul" },
  { id: 31, sigla: "MG", nome: "Minas Gerais" },
  { id: 15, sigla: "PA", nome: "Pará" },
  { id: 25, sigla: "PB", nome: "Paraíba" },
  { id: 41, sigla: "PR", nome: "Paraná" },
  { id: 26, sigla: "PE", nome: "Pernambuco" },
  { id: 22, sigla: "PI", nome: "Piauí" },
  { id: 33, sigla: "RJ", nome: "Rio de Janeiro" },
  { id: 24, sigla: "RN", nome: "Rio Grande do Norte" },
  { id: 43, sigla: "RS", nome: "Rio Grande do Sul" },
  { id: 11, sigla: "RO", nome: "Rondônia" },
  { id: 14, sigla: "RR", nome: "Roraima" },
  { id: 42, sigla: "SC", nome: "Santa Catarina" },
  { id: 35, sigla: "SP", nome: "São Paulo" },
  { id: 28, sigla: "SE", nome: "Sergipe" },
  { id: 17, sigla: "TO", nome: "Tocantins" },
];

export function cepDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8);
}

/**
 * CEP a partir de texto de CSV/Excel, inclusive notação científica
 * (ex.: 4,37E+08 → 43700000) e zeros à esquerda perdidos.
 */
export function parseCepFlexible(raw: string): string {
  const t = raw.trim().replace(/\s/g, "");
  if (!t) return "";

  const sci = t.match(/^(\d+)[,.](\d*)[eE]([+-]?\d+)$/i);
  if (sci || /^[\d.,]+[eE][+-]?\d+$/i.test(t)) {
    const normalized = t.replace(",", ".");
    const n = Number(normalized);
    if (Number.isFinite(n) && n > 0) {
      let digits = String(Math.round(n));
      // Excel às vezes infla com zero extra (4,37E+08 → 437000000).
      while (digits.length > 8 && digits.endsWith("0")) {
        digits = digits.slice(0, -1);
      }
      if (digits.length < 8) digits = digits.padStart(8, "0");
      if (digits.length === 8) return digits;
    }
  }

  let digits = t.replace(/\D/g, "");
  if (digits.length > 0 && digits.length < 8 && /^\d+$/.test(digits)) {
    digits = digits.padStart(8, "0");
  }
  return digits.slice(0, 8);
}

export function formatCepMask(digitsMax8: string): string {
  const d = cepDigitsOnly(digitsMax8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5, 8)}`;
}

export function isCepComplete(digitsOrRaw: string): boolean {
  const d = parseCepFlexible(digitsOrRaw);
  return d.length === 8;
}

export type CustomerAddressFields = {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
};

/** Endereço em uma linha para nota / rota. */
export function formatStructuredAddress(
  data: CustomerAddressFields,
): string | null {
  const parts: string[] = [];
  const street = [data.street?.trim(), data.number?.trim()]
    .filter(Boolean)
    .join(", ");
  if (street) parts.push(street);
  if (data.neighborhood?.trim()) parts.push(data.neighborhood.trim());
  const city = [data.city?.trim(), data.state?.trim()]
    .filter(Boolean)
    .join("/");
  if (city) parts.push(city);
  if (data.cep?.trim()) {
    const cep = cepDigitsOnly(data.cep);
    parts.push(cep.length === 8 ? formatCepMask(cep) : data.cep.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
