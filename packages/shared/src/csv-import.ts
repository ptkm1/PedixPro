/**
 * Colunas e templates CSV para importação de produtos e clientes.
 * Headers em snake_case; o parser normaliza (trim, lowercase, BOM).
 */

export const PRODUCT_CSV_HEADERS = [
  "nome",
  "grupo",
  "fornecedor",
  "preco",
  "sku",
  "codigo_barras",
  "estoque",
  "descricao",
  "tabela_preco",
  "ncm",
  "unidade_compra",
  "preco_custo",
  "bloqueia_sem_estoque",
] as const;

export type ProductCsvHeader = (typeof PRODUCT_CSV_HEADERS)[number];

export const PRODUCT_CSV_REQUIRED: ProductCsvHeader[] = [
  "nome",
  "grupo",
  "fornecedor",
  "preco",
];

export const CUSTOMER_CSV_HEADERS = [
  "tipo_documento",
  "documento",
  "nome",
  "razao_social",
  "nome_fantasia",
  "email",
  "telefone",
  "cep",
  "logradouro",
  "numero",
  "bairro",
  "cidade",
  "uf",
  "codigo_ibge",
  "complemento",
  "inscricao_estadual",
  "comprador",
  "observacoes",
  "vendedor_email",
  "limite_credito",
] as const;

export type CustomerCsvHeader = (typeof CUSTOMER_CSV_HEADERS)[number];

/** Linha de exemplo no template (produtos). */
export const PRODUCT_CSV_SAMPLE_ROW: Record<ProductCsvHeader, string> = {
  nome: "Produto exemplo",
  grupo: "1",
  fornecedor: "FORN01",
  preco: "19.90",
  sku: "SKU-001",
  codigo_barras: "7891000100103",
  estoque: "10",
  descricao: "Descrição opcional",
  tabela_preco: "",
  ncm: "22021000",
  unidade_compra: "UN",
  preco_custo: "12.00",
  bloqueia_sem_estoque: "nao",
};

/** Linha de exemplo no template (clientes CNPJ). */
export const CUSTOMER_CSV_SAMPLE_ROW: Record<CustomerCsvHeader, string> = {
  tipo_documento: "CNPJ",
  documento: "00.000.000/0001-91",
  nome: "",
  razao_social: "Empresa Exemplo LTDA",
  nome_fantasia: "Exemplo",
  email: "contato@exemplo.com.br",
  telefone: "11999999999",
  cep: "01310-100",
  logradouro: "Av. Paulista",
  numero: "1000",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "SP",
  codigo_ibge: "3550308",
  complemento: "",
  inscricao_estadual: "",
  comprador: "João",
  observacoes: "",
  vendedor_email: "",
  limite_credito: "",
};

function escapeCsvCell(value: string): string {
  if (/[",;\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsvTemplate(
  headers: readonly string[],
  sample: Record<string, string>,
): string {
  const headerLine = headers.join(";");
  const sampleLine = headers
    .map((h) => escapeCsvCell(sample[h] ?? ""))
    .join(";");
  return `\uFEFF${headerLine}\n${sampleLine}\n`;
}

export function productCsvTemplate(): string {
  return buildCsvTemplate(PRODUCT_CSV_HEADERS, PRODUCT_CSV_SAMPLE_ROW);
}

export function customerCsvTemplate(): string {
  return buildCsvTemplate(CUSTOMER_CSV_HEADERS, CUSTOMER_CSV_SAMPLE_ROW);
}

export const PRICE_TABLE_CSV_HEADERS = [
  "codigo",
  "nome",
  "preco_base",
  "preco_tabela",
  "preco_minimo",
] as const;

export type PriceTableCsvHeader = (typeof PRICE_TABLE_CSV_HEADERS)[number];

export const PRICE_TABLE_CSV_SAMPLE_ROW: Record<PriceTableCsvHeader, string> = {
  codigo: "SKU-001",
  nome: "Produto exemplo",
  preco_base: "10.00",
  preco_tabela: "9.00",
  preco_minimo: "8.50",
};

export function priceTableCsvTemplate(): string {
  return buildCsvTemplate(PRICE_TABLE_CSV_HEADERS, PRICE_TABLE_CSV_SAMPLE_ROW);
}

export const CSV_IMPORT_MAX_ROWS = 2000;
export const CSV_IMPORT_MAX_CHARS = 1_500_000;
