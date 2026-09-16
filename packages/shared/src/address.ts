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
