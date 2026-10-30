/** Campos de cliente usados na validação e emissão de NF-e. */
export type CustomerFiscalFields = {
  cnpj?: string | null;
  cpf?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  cityIbgeCode?: string | null;
  stateRegistration?: string | null;
  name?: string;
};

export function customerFiscalDocument(
  customer: Pick<CustomerFiscalFields, "cnpj" | "cpf">,
): string | null {
  const doc = customer.cnpj?.trim() || customer.cpf?.trim();
  return doc || null;
}

export function customerFiscalRecipientSnapshot(customer: CustomerFiscalFields) {
  const ie = customer.stateRegistration ?? null;
  return {
    name: customer.name ?? "",
    document: customerFiscalDocument(customer),
    ie,
    /** Alias lido pelo XML da NF-e (o builder usa stateRegistration). */
    stateRegistration: ie,
    street: customer.street,
    addressNumber: customer.number,
    district: customer.neighborhood,
    city: customer.city,
    state: customer.state,
    zipCode: customer.cep,
    cityIbge: customer.cityIbgeCode,
  };
}
