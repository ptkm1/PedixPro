import { cepDigitsOnly } from "./address.js";
import { cnpjDigitsOnly, isValidCnpj } from "./cnpj.js";
import { cpfDigitsOnly, isValidCpf } from "./cpf.js";

export type CustomerDocumentType = "CNPJ" | "CPF";

export type CustomerFormValues = {
  documentType: CustomerDocumentType;
  cnpj: string;
  cpf: string;
  name: string;
  legalName: string;
  tradeName: string;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  addressNote: string;
  state: string;
  city: string;
  cityIbgeCode: string;
  stateRegistration: string;
  phone: string;
  email: string;
  buyerName: string;
  notes: string;
};

export type CustomerApprovalStatus = "APPROVED" | "PENDING" | "REJECTED";

export type CustomerStatus = "ACTIVE" | "INACTIVE";

export type CustomerRecord = CustomerFormValues & {
  id: string;
  /** Código interno numérico sequencial por organização. */
  code?: number | null;
  sellerId?: string | null;
  creditLimit?: unknown;
  creditBlocked?: boolean;
  latitude?: unknown;
  longitude?: unknown;
  approvalStatus?: CustomerApprovalStatus;
  approvalNote?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  /** Situação comercial (ativo / inativo). */
  status?: CustomerStatus;
  defaultPriceTableId?: string | null;
};

/** Código do cliente; "—" se ainda não atribuído. */
export function formatCustomerCode(customer: {
  id: string;
  code?: number | null;
}): string {
  if (customer.code != null) return String(customer.code);
  return "—";
}

export function emptyCustomerForm(
  documentType: CustomerDocumentType = "CNPJ",
): CustomerFormValues {
  return {
    documentType,
    cnpj: "",
    cpf: "",
    name: "",
    legalName: "",
    tradeName: "",
    cep: "",
    street: "",
    number: "",
    neighborhood: "",
    addressNote: "",
    state: "",
    city: "",
    cityIbgeCode: "",
    stateRegistration: "",
    phone: "",
    email: "",
    buyerName: "",
    notes: "",
  };
}

export function customerToForm(
  c: Partial<CustomerRecord> & { name: string },
): CustomerFormValues {
  return {
    documentType: (c.documentType as CustomerDocumentType) ?? "CNPJ",
    cnpj: c.cnpj ?? "",
    cpf: c.cpf ?? "",
    name: c.name ?? "",
    legalName: c.legalName ?? "",
    tradeName: c.tradeName ?? "",
    cep: c.cep ?? "",
    street: c.street ?? "",
    number: c.number ?? "",
    neighborhood: c.neighborhood ?? "",
    addressNote: c.addressNote ?? "",
    state: c.state ?? "",
    city: c.city ?? "",
    cityIbgeCode: c.cityIbgeCode ?? "",
    stateRegistration: c.stateRegistration ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    buyerName: c.buyerName ?? "",
    notes: c.notes ?? "",
  };
}

export function formToCustomerPayload(
  values: CustomerFormValues,
  extras?: {
    sellerId?: string | null;
    creditLimit?: number | null;
    creditBlocked?: boolean;
    status?: CustomerStatus;
    latitude?: number | null;
    longitude?: number | null;
    defaultPriceTableId?: string | null;
  },
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    documentType: values.documentType,
    name:
      values.documentType === "CPF"
        ? values.name.trim()
        : values.tradeName.trim() ||
          values.legalName.trim() ||
          values.name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    cnpj: values.documentType === "CNPJ" ? values.cnpj : null,
    cpf: values.documentType === "CPF" ? values.cpf : null,
    legalName:
      values.documentType === "CNPJ" ? values.legalName.trim() : null,
    tradeName:
      values.documentType === "CNPJ" ? values.tradeName.trim() : null,
    cep: values.cep.trim(),
    street: values.street.trim(),
    number: values.number.trim(),
    neighborhood: values.neighborhood.trim(),
    addressNote: values.addressNote.trim(),
    state: values.state.trim().toUpperCase(),
    city: values.city.trim(),
    cityIbgeCode: values.cityIbgeCode.trim(),
    stateRegistration: values.stateRegistration.trim(),
    buyerName: values.buyerName.trim(),
    notes: values.notes.trim(),
  };
  if (extras?.sellerId !== undefined) base.sellerId = extras.sellerId;
  if (extras?.creditLimit !== undefined) base.creditLimit = extras.creditLimit;
  if (extras?.creditBlocked !== undefined)
    base.creditBlocked = extras.creditBlocked;
  if (extras?.status !== undefined) base.status = extras.status;
  if (extras?.latitude !== undefined) base.latitude = extras.latitude;
  if (extras?.longitude !== undefined) base.longitude = extras.longitude;
  if (extras?.defaultPriceTableId !== undefined) {
    base.defaultPriceTableId = extras.defaultPriceTableId;
  }
  return base;
}

export type CustomerFormErrors = Partial<
  Record<keyof CustomerFormValues, string>
>;

/** Valor gravado quando o utilizador marca que não sabe a IE. */
export const STATE_REGISTRATION_UNAVAILABLE = "indisponível";

/** Valor gravado quando o utilizador marca "Não possui" (complemento, observação). */
export const FIELD_NOT_APPLICABLE = "não possui";

/** Valor gravado quando o endereço não tem número. */
export const STREET_NUMBER_SN = "S/N";

export function isStateRegistrationUnavailable(value: string): boolean {
  return value.trim().toLowerCase() === STATE_REGISTRATION_UNAVAILABLE;
}

export function isFieldNotApplicable(value: string): boolean {
  const t = value.trim().toLowerCase();
  return t === FIELD_NOT_APPLICABLE || t === "nao possui";
}

export function isStreetNumberSn(value: string): boolean {
  return value.trim().toUpperCase() === STREET_NUMBER_SN;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireTrimmed(
  value: string,
  message: string,
): string | undefined {
  if (!value.trim()) return message;
  return undefined;
}

function validateDocument(values: CustomerFormValues): CustomerFormErrors {
  const errors: CustomerFormErrors = {};

  if (values.documentType === "CNPJ") {
    const cnpj = cnpjDigitsOnly(values.cnpj);
    if (!cnpj) errors.cnpj = "CNPJ é obrigatório.";
    else if (cnpj.length !== 14) errors.cnpj = "CNPJ deve ter 14 dígitos.";
    else if (!isValidCnpj(cnpj))
      errors.cnpj = "CNPJ inválido (verifique os dígitos).";

    const legal = requireTrimmed(
      values.legalName,
      "Razão social é obrigatória.",
    );
    if (legal) errors.legalName = legal;

    const trade = requireTrimmed(
      values.tradeName,
      "Nome fantasia é obrigatório.",
    );
    if (trade) errors.tradeName = trade;
  } else {
    const cpf = cpfDigitsOnly(values.cpf);
    if (!cpf) errors.cpf = "CPF é obrigatório.";
    else if (cpf.length !== 11) errors.cpf = "CPF deve ter 11 dígitos.";
    else if (!isValidCpf(cpf))
      errors.cpf = "CPF inválido (verifique os dígitos).";

    const name = requireTrimmed(values.name, "Nome completo é obrigatório.");
    if (name) errors.name = name;
  }

  return errors;
}

function validateAddress(values: CustomerFormValues): CustomerFormErrors {
  const errors: CustomerFormErrors = {};

  const cep = cepDigitsOnly(values.cep);
  if (!cep) errors.cep = "CEP é obrigatório.";
  else if (cep.length !== 8) errors.cep = "CEP deve ter 8 dígitos.";

  const street = requireTrimmed(values.street, "Endereço é obrigatório.");
  if (street) errors.street = street;

  if (!values.number.trim()) {
    errors.number = "Informe o número ou marque Sem número (S/N).";
  }

  const neighborhood = requireTrimmed(
    values.neighborhood,
    "Bairro é obrigatório.",
  );
  if (neighborhood) errors.neighborhood = neighborhood;

  if (!values.addressNote.trim()) {
    errors.addressNote =
      "Informe o complemento ou marque que não possui.";
  }

  const state = requireTrimmed(values.state, "UF é obrigatória.");
  if (state) errors.state = state;
  else if (!/^[A-Za-z]{2}$/.test(values.state.trim())) {
    errors.state = "UF inválida.";
  }

  const city = requireTrimmed(values.city, "Cidade é obrigatória.");
  if (city) errors.city = city;

  const ibge = requireTrimmed(
    values.cityIbgeCode,
    "Código IBGE do município é obrigatório (escolha a cidade).",
  );
  if (ibge) errors.cityIbgeCode = ibge;

  if (!values.stateRegistration.trim()) {
    errors.stateRegistration =
      "Informe a inscrição estadual ou marque que não sabe.";
  }

  return errors;
}

function validateContact(values: CustomerFormValues): CustomerFormErrors {
  const errors: CustomerFormErrors = {};

  const phone = requireTrimmed(values.phone, "Telefone é obrigatório.");
  if (phone) errors.phone = phone;

  const emailRaw = values.email.trim();
  if (!emailRaw) errors.email = "E-mail é obrigatório.";
  else if (!EMAIL_RE.test(emailRaw)) {
    errors.email = "Informe um e-mail válido.";
  }

  const buyer = requireTrimmed(values.buyerName, "Comprador é obrigatório.");
  if (buyer) errors.buyerName = buyer;

  if (!values.notes.trim()) {
    errors.notes = "Informe a observação ou marque que não possui.";
  }

  return errors;
}

/** Validação client-side: todos os campos do cadastro são obrigatórios. */
export function validateCustomerForm(
  values: CustomerFormValues,
): CustomerFormErrors {
  return {
    ...validateDocument(values),
    ...validateAddress(values),
    ...validateContact(values),
  };
}

const STEP0_KEYS = [
  "cnpj",
  "cpf",
  "legalName",
  "tradeName",
  "name",
] as const;

const STEP1_KEYS = [
  "cep",
  "street",
  "number",
  "neighborhood",
  "addressNote",
  "state",
  "city",
  "cityIbgeCode",
  "stateRegistration",
] as const;

const STEP2_KEYS = ["phone", "email", "buyerName", "notes"] as const;

function pickErrors(
  all: CustomerFormErrors,
  keys: readonly (keyof CustomerFormValues)[],
): CustomerFormErrors {
  const out: CustomerFormErrors = {};
  for (const key of keys) {
    if (all[key]) out[key] = all[key];
  }
  return out;
}

/** Erros relevantes para cada passo do wizard mobile. */
export function validateCustomerFormStep(
  step: number,
  values: CustomerFormValues,
): CustomerFormErrors {
  const all = validateCustomerForm(values);

  if (step === 0) {
    if (values.documentType === "CNPJ") {
      return pickErrors(all, ["cnpj", "legalName", "tradeName"]);
    }
    return pickErrors(all, ["cpf", "name"]);
  }

  if (step === 1) return pickErrors(all, STEP1_KEYS);
  if (step === 2) return pickErrors(all, STEP2_KEYS);
  return {};
}

/** Primeiro passo do wizard que contém erro (para navegação). */
export function customerFormErrorStep(errors: CustomerFormErrors): number {
  if (STEP0_KEYS.some((k) => errors[k])) return 0;
  if (STEP1_KEYS.some((k) => errors[k])) return 1;
  if (STEP2_KEYS.some((k) => errors[k])) return 2;
  return 0;
}

export function isCustomerFormValid(values: CustomerFormValues): boolean {
  return Object.keys(validateCustomerForm(values)).length === 0;
}
