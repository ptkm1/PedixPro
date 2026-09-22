/** Normalização e tipos para resolução de município IBGE. */

export type MunicipioIbgeSource =
  | "CSV"
  | "CEP"
  | "CNPJ"
  | "CNPJ_CEP"
  | "CIDADE_UF"
  | "MANUAL"
  | "EXISTING";

export type MunicipioIbgeConfidence = "HIGH" | "MEDIUM" | "LOW";

export type MunicipioIbgeResolution = {
  codigoIbge: string | null;
  cidade: string | null;
  uf: string | null;
  source: MunicipioIbgeSource | null;
  confidence: MunicipioIbgeConfidence | null;
  /** Avisos para UI/auditoria (não bloqueiam por si só). */
  warnings: string[];
  /** Código CSV/informado foi descartado ou corrigido. */
  corrected: boolean;
};

export type ResolveMunicipioIbgeInput = {
  codigoIbge?: string | null;
  cep?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cnpj?: string | null;
};

/** Uppercase, trim, colapsa espaços, remove acentos (só para comparação). */
export function normalizeMunicipioName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function normalizeUf(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
}

export function ibgeDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Aceita 7 dígitos (município). */
export function isValidIbgeMunicipioCode(raw: string): boolean {
  const d = ibgeDigitsOnly(raw);
  return d.length === 7;
}
