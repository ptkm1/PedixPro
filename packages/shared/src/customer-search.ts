/** Cliente pesquisável na criação de pedido (web/app). */
export type CustomerSearchable = {
  name: string;
  code?: number | null;
  tradeName?: string | null;
  legalName?: string | null;
  city?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** Campos de busca do app (identificação do cliente na venda). */
export type CustomerFieldSearch = {
  q?: string;
  code?: string;
  document?: string;
  legalName?: string;
  tradeName?: string;
  city?: string;
};

const FIELD_KEYS = [
  "q",
  "code",
  "document",
  "legalName",
  "tradeName",
  "city",
] as const;

export function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function customerFieldSearchIsEmpty(fields: CustomerFieldSearch): boolean {
  return FIELD_KEYS.every((key) => !fields[key]?.trim());
}

function includesFold(
  hay: string | null | undefined,
  needleFolded: string,
): boolean {
  if (!needleFolded) return true;
  return foldSearchText(hay ?? "").includes(needleFolded);
}

/** Busca unificada: nome, fantasia, razão, cidade, e-mail, telefone, código, CNPJ/CPF. */
export function matchesCustomerQuery(
  customer: CustomerSearchable,
  q: string,
): boolean {
  const raw = q.trim();
  if (!raw) return true;
  const folded = foldSearchText(raw);
  const digits = digitsOnly(raw);
  if (
    includesFold(customer.name, folded) ||
    includesFold(customer.tradeName, folded) ||
    includesFold(customer.legalName, folded) ||
    includesFold(customer.city, folded) ||
    includesFold(customer.email, folded) ||
    includesFold(customer.phone, folded)
  ) {
    return true;
  }
  if (customer.code != null && String(customer.code).includes(digits || folded)) {
    return true;
  }
  if (digits.length > 0) {
    const cnpj = (customer.cnpj ?? "").replace(/\D/g, "");
    const cpf = (customer.cpf ?? "").replace(/\D/g, "");
    if (cnpj.includes(digits) || cpf.includes(digits)) return true;
  }
  return false;
}

export function matchesCustomerFieldSearch(
  customer: CustomerSearchable,
  fields: CustomerFieldSearch,
): boolean {
  if (fields.q?.trim() && !matchesCustomerQuery(customer, fields.q)) {
    return false;
  }

  const codeQ = fields.code?.trim() ?? "";
  if (codeQ) {
    const folded = foldSearchText(codeQ);
    const numeric = digitsOnly(codeQ);
    const codeMatch =
      customer.code != null &&
      String(customer.code).includes(numeric || codeQ);
    const nameMatch =
      includesFold(customer.name, folded) ||
      includesFold(customer.tradeName, folded) ||
      includesFold(customer.legalName, folded);
    if (!codeMatch && !nameMatch) return false;
  }

  const doc = fields.document?.trim() ?? "";
  if (doc) {
    const digits = digitsOnly(doc);
    const hay = `${customer.cnpj ?? ""}${customer.cpf ?? ""}`.replace(/\D/g, "");
    if (!digits || !hay.includes(digits)) return false;
  }

  const legal = foldSearchText(fields.legalName ?? "");
  if (
    legal &&
    !includesFold(customer.legalName, legal) &&
    !includesFold(customer.name, legal)
  ) {
    return false;
  }

  const trade = foldSearchText(fields.tradeName ?? "");
  if (
    trade &&
    !includesFold(customer.tradeName, trade) &&
    !includesFold(customer.name, trade)
  ) {
    return false;
  }

  const city = foldSearchText(fields.city ?? "");
  if (city && !includesFold(customer.city, city)) return false;

  return true;
}

export function toCustomerSearchParams(
  fields: CustomerFieldSearch,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FIELD_KEYS) {
    const value = fields[key]?.trim();
    if (value) params.set(key, value);
  }
  return params;
}
