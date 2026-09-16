import type { Establishment, FiscalTaxRegime, Product } from "@prisma/client";
import {
  customerFiscalDocument,
  type CustomerFiscalFields,
} from "./customer-fiscal.js";

/** Campos fiscais do emitente (Establishment). */
export type OrganizationFiscalConfig = Pick<
  Establishment,
  | "cnpj"
  | "uf"
  | "certificatePfxEncrypted"
  | "certificateExpiresAt"
  | "taxRegime"
  | "stateRegistration"
  | "city"
  | "street"
  | "addressNumber"
  | "nfeEnvironment"
  | "nfeSeries"
  | "nfeLastNumber"
  | "contingencyEnabled"
>;

export type FiscalReadinessIssue = { code: string; message: string };

export function validateOrganizationFiscalConfig(
  config: OrganizationFiscalConfig | null,
): FiscalReadinessIssue[] {
  return [
    ...validateOrganizationFiscalConfigForEmit(config),
    ...validateOrganizationFiscalCertificate(config),
  ];
}

/** Dados mínimos para gerar rascunho da NF-e (sem certificado). */
export function validateOrganizationFiscalConfigForEmit(
  config: OrganizationFiscalConfig | null,
): FiscalReadinessIssue[] {
  const issues: FiscalReadinessIssue[] = [];
  if (!config) {
    issues.push({
      code: "NO_CONFIG",
      message: "Configuração fiscal do estabelecimento não cadastrada",
    });
    return issues;
  }
  if (!config.cnpj?.trim())
    issues.push({ code: "NO_CNPJ", message: "CNPJ do emitente obrigatório" });
  if (!config.uf?.trim())
    issues.push({ code: "NO_UF", message: "UF do emitente obrigatória" });
  return issues;
}

export function validateOrganizationFiscalCertificate(
  config: OrganizationFiscalConfig | null,
): FiscalReadinessIssue[] {
  const issues: FiscalReadinessIssue[] = [];
  if (!config) return issues;
  if (!config.certificatePfxEncrypted) {
    issues.push({ code: "NO_CERT", message: "Certificado A1 não enviado" });
  }
  if (
    config.certificateExpiresAt &&
    config.certificateExpiresAt.getTime() < Date.now()
  ) {
    issues.push({ code: "CERT_EXPIRED", message: "Certificado A1 vencido" });
  }
  return issues;
}

export function validateCustomerFiscal(
  customer: CustomerFiscalFields,
): FiscalReadinessIssue[] {
  const issues: FiscalReadinessIssue[] = [];
  if (!customerFiscalDocument(customer)) {
    issues.push({ code: "NO_DOC", message: "Cliente sem CNPJ/CPF" });
  }
  if (
    !customer.street?.trim() ||
    !customer.city?.trim() ||
    !customer.state?.trim()
  ) {
    issues.push({
      code: "NO_ADDRESS",
      message: "Cliente sem endereço fiscal completo",
    });
  }
  const ibge = (customer.cityIbgeCode ?? "").replace(/\D/g, "");
  if (!ibge || ibge.length !== 7) {
    issues.push({
      code: "NO_IBGE",
      message:
        "Não foi possível identificar o código IBGE do município deste cliente. Verifique CEP, cidade e UF no cadastro.",
    });
  }
  return issues;
}

export function validateProductFiscal(
  product: Product,
): FiscalReadinessIssue[] {
  const missing: string[] = [];
  const hasNcm =
    Boolean(product.ncmId) ||
    Boolean(product.ncm && product.ncm.replace(/\D/g, "").length === 8);
  if (!hasNcm) missing.push("NCM");
  if (product.fiscalOrigin == null && product.nfeOrigin == null) {
    missing.push("origem");
  }
  if (!product.fiscalUnit?.trim() && !product.purchaseUnit?.trim()) {
    missing.push("unidade fiscal");
  }
  if (!missing.length) return [];
  return [
    {
      code: "PRODUCT_FISCAL",
      message: `Produto "${product.name}" incompleto: falta ${missing.join(", ")}`,
    },
  ];
}

export function defaultCsosnOrCst(regime: FiscalTaxRegime): {
  cst?: string;
  csosn?: string;
} {
  if (regime === "SIMPLES_NACIONAL") return { csosn: "102" };
  return { cst: "00" };
}

export function computeItemTaxes(input: {
  quantity: number;
  unitPrice: number;
  icmsRate?: number;
  pisRate?: number;
  cofinsRate?: number;
  /** Alíquota IPI (%) do produto. */
  ipiRate?: number;
  /** Alíquota FCP (%) do NCM, quando aplicável. */
  fcpRate?: number;
  /** CST PIS do produto (fallback conforme regime/alíquota). */
  cstPis?: string | null;
  regime: FiscalTaxRegime;
}) {
  const total = input.quantity * input.unitPrice;
  const icmsRate = input.icmsRate ?? 0;
  const pisRate = input.pisRate ?? 0.65;
  const cofinsRate = input.cofinsRate ?? 3;
  const ipiRate = input.ipiRate ?? 0;
  const fcpRate = input.fcpRate ?? 0;
  const icms = total * (icmsRate / 100);
  const pis = total * (pisRate / 100);
  const cofins = total * (cofinsRate / 100);
  const ipi = total * (ipiRate / 100);
  const fcp = total * (fcpRate / 100);
  const codes = defaultCsosnOrCst(input.regime);
  const cstPis =
    input.cstPis?.trim() || (pisRate <= 0 && cofinsRate <= 0 ? "07" : "01");
  return {
    base: total,
    icms,
    pis,
    cofins,
    ipi,
    fcp,
    icmsRate,
    pisRate,
    cofinsRate,
    ipiRate,
    fcpRate,
    cstPis,
    // ST / DIFAL: stub — permanecem 0 nesta onda.
    vBCST: 0,
    vST: 0,
    ...codes,
  };
}
