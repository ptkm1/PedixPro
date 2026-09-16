import {
    cepDigitsOnly,
    cnpjDigitsOnly,
    cpfDigitsOnly,
    FIELD_NOT_APPLICABLE,
    isValidCnpj,
    isValidCpf,
    STATE_REGISTRATION_UNAVAILABLE,
    STREET_NUMBER_SN,
    type CsvColumnMap,
} from "@pedidos/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import {
    AUDIT_ACTION,
    AUDIT_ENTITY,
    writeAuditLog,
} from "../audit-log.js";
import { nextCustomerCode } from "../customer-code.js";
import {
    toCustomerPrismaData,
    type CustomerBodyInput,
} from "../customer-validation.js";
import { fetchIbgeMunicipios } from "../ibge/brasilapi.js";
import { cell, parseBrNumber, parseCsvText, remapCsvCells } from "./csv-parse.js";
import {
    summarizeImportRows,
    type ImportFieldError,
    type ImportPreviewResult,
    type ImportRowResult,
} from "./import-types.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLACEHOLDER_PHONE = "0000000000";

type PreparedCustomer = {
  documentType: "CNPJ" | "CPF";
  name: string;
  email: string;
  phone: string;
  cnpj: string | null;
  cpf: string | null;
  legalName: string | null;
  tradeName: string | null;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  addressNote: string;
  state: string;
  city: string;
  cityIbgeCode: string;
  stateRegistration: string;
  buyerName: string;
  notes: string;
  sellerId: string | null;
  creditLimit: number | null;
};

type OrgLookups = {
  sellersByEmail: Map<string, string>;
  sellersByName: Map<string, string>;
  existingCnpjs: Set<string>;
  existingCpfs: Set<string>;
};

type IbgeCache = Map<string, Array<{ id: number; nome: string }>>;

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

async function loadOrgLookups(organizationId: string): Promise<OrgLookups> {
  const [sellers, customers] = await Promise.all([
    prisma.seller.findMany({
      where: { organizationId, active: true },
      select: { id: true, user: { select: { email: true, name: true } } },
    }),
    prisma.customer.findMany({
      where: { organizationId },
      select: { cnpj: true, cpf: true },
    }),
  ]);
  const sellersByEmail = new Map<string, string>();
  const sellersByName = new Map<string, string>();
  for (const s of sellers) {
    sellersByEmail.set(s.user.email.trim().toLowerCase(), s.id);
    sellersByName.set(normKey(s.user.name), s.id);
  }
  return {
    sellersByEmail,
    sellersByName,
    existingCnpjs: new Set(
      customers.map((c) => c.cnpj).filter((x): x is string => Boolean(x)),
    ),
    existingCpfs: new Set(
      customers.map((c) => c.cpf).filter((x): x is string => Boolean(x)),
    ),
  };
}

function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function placeholderEmail(docDigits: string): string {
  const d = docDigits.replace(/\D/g, "") || "x";
  return `sem-email.${d}@import.local`;
}

async function resolveIbgeCode(
  city: string,
  uf: string,
  cache: IbgeCache,
): Promise<string | null> {
  const state = uf.trim().toUpperCase();
  if (!city.trim() || !/^[A-Z]{2}$/.test(state)) return null;
  let list = cache.get(state);
  if (!list) {
    try {
      list = await fetchIbgeMunicipios(state);
      cache.set(state, list);
    } catch {
      return null;
    }
  }
  const key = normKey(city);
  const exact = list.find((m) => normKey(m.nome) === key);
  if (exact) return String(exact.id);
  const loose = list.find(
    (m) =>
      normKey(m.nome).includes(key) || key.includes(normKey(m.nome)),
  );
  return loose ? String(loose.id) : null;
}

async function validateCustomerRow(
  cells: Record<string, string>,
  lookups: OrgLookups,
  docsInFile: Map<string, number>,
  line: number,
  ibgeCache: IbgeCache,
  fieldDefaults?: Record<string, string>,
): Promise<{ errors: ImportFieldError[]; prepared: PreparedCustomer | null }> {
  const errors: ImportFieldError[] = [];
  const def = (field: string, current: string) => {
    const cur = current.trim();
    if (cur) return cur;
    return (fieldDefaults?.[field] ?? "").trim();
  };

  let tipoRaw = cell(cells, "tipo_documento").toUpperCase();
  const documento = cell(cells, "documento");
  let nome = cell(cells, "nome");
  let razao = cell(cells, "razao_social");
  let fantasia = cell(cells, "nome_fantasia");
  let email = def("email", cell(cells, "email"));
  let telefone = def("telefone", cell(cells, "telefone"));
  const cep = def("cep", cell(cells, "cep", "zip", "zipcode", "codigo_postal"));
  const logradouro = def(
    "logradouro",
    cell(cells, "logradouro", "endereco", "rua", "street", "address"),
  );
  const numeroRaw = def(
    "numero",
    cell(cells, "numero", "num", "nro", "nr", "number"),
  );
  // Export de ERP costuma omitir número; S/N é o padrão do cadastro Pedix.
  const numero = numeroRaw || STREET_NUMBER_SN;
  const bairro = def(
    "bairro",
    cell(cells, "bairro", "distrito", "neighborhood"),
  );
  // Fallbacks de alias: CSV com município preenchido e "cidade" vazia (ou remap).
  const cidade = def(
    "cidade",
    cell(cells, "cidade", "municipio", "city", "localidade"),
  );
  const uf = def("uf", cell(cells, "uf", "estado", "state", "sigla_uf"));
  let ibge = def(
    "codigo_ibge",
    cell(cells, "codigo_ibge", "ibge", "cod_ibge", "codigoibge", "id_ibge"),
  );
  const complemento = def("complemento", cell(cells, "complemento"));
  const ie = def("inscricao_estadual", cell(cells, "inscricao_estadual"));
  const comprador = def("comprador", cell(cells, "comprador"));
  const observacoes = def("observacoes", cell(cells, "observacoes"));
  const vendedorRef = cell(cells, "vendedor_email", "vendedor");
  const limiteRaw = cell(cells, "limite_credito");

  const docDigits = documento.replace(/\D/g, "");
  if (tipoRaw !== "CNPJ" && tipoRaw !== "CPF") {
    if (docDigits.length === 11) tipoRaw = "CPF";
    else if (docDigits.length === 14) tipoRaw = "CNPJ";
  }

  if (tipoRaw !== "CNPJ" && tipoRaw !== "CPF") {
    errors.push({
      field: "tipo_documento",
      message: "Informe CNPJ ou CPF (ou um documento com 11/14 dígitos).",
    });
  }
  const documentType = tipoRaw === "CPF" ? "CPF" : "CNPJ";

  if (!fantasia && razao) fantasia = razao;
  if (!nome) nome = fantasia || razao;

  let cnpj: string | null = null;
  let cpf: string | null = null;
  if (documentType === "CNPJ" && (tipoRaw === "CNPJ" || docDigits.length === 14)) {
    cnpj = cnpjDigitsOnly(documento);
    if (!cnpj) errors.push({ field: "documento", message: "CNPJ é obrigatório." });
    else if (cnpj.length !== 14)
      errors.push({ field: "documento", message: "CNPJ deve ter 14 dígitos." });
    else if (!isValidCnpj(cnpj))
      errors.push({
        field: "documento",
        message: "CNPJ inválido (verifique os dígitos).",
      });
    if (!razao)
      errors.push({ field: "razao_social", message: "Razão social obrigatória." });
    if (!fantasia)
      errors.push({
        field: "nome_fantasia",
        message: "Nome fantasia obrigatório.",
      });
  } else if (tipoRaw === "CPF") {
    cpf = cpfDigitsOnly(documento);
    if (!cpf) errors.push({ field: "documento", message: "CPF é obrigatório." });
    else if (cpf.length !== 11)
      errors.push({ field: "documento", message: "CPF deve ter 11 dígitos." });
    else if (!isValidCpf(cpf))
      errors.push({
        field: "documento",
        message: "CPF inválido (verifique os dígitos).",
      });
    if (!nome)
      errors.push({ field: "nome", message: "Nome completo é obrigatório." });
  }

  const docKey = cnpj ? `CNPJ:${cnpj}` : cpf ? `CPF:${cpf}` : null;
  if (docKey) {
    if (
      (cnpj && lookups.existingCnpjs.has(cnpj)) ||
      (cpf && lookups.existingCpfs.has(cpf))
    ) {
      errors.push({
        field: "documento",
        message: "CNPJ/CPF já cadastrado nesta organização.",
      });
    }
    const prev = docsInFile.get(docKey);
    if (prev != null && prev !== line) {
      errors.push({
        field: "documento",
        message: `Duplicado no arquivo (linha ${prev}).`,
      });
    } else {
      docsInFile.set(docKey, line);
    }
  }

  if (!email) {
    email = placeholderEmail(docDigits);
  } else if (!EMAIL_RE.test(email)) {
    const fromDefault = (fieldDefaults?.email ?? "").trim();
    if (fromDefault && EMAIL_RE.test(fromDefault)) {
      email = fromDefault;
    } else {
      errors.push({ field: "email", message: "E-mail inválido." });
    }
  }

  let phone = phoneDigits(telefone);
  // Vazio ou inválido: default em massa, senão placeholder (não bloqueia import).
  if (!phone || phone.length < 10 || phone.length > 11) {
    const fromDefault = phoneDigits(fieldDefaults?.telefone ?? "");
    if (fromDefault.length >= 10 && fromDefault.length <= 11) {
      phone = fromDefault;
    } else {
      phone = PLACEHOLDER_PHONE;
    }
  }

  const cepD = cepDigitsOnly(cep);
  if (!cepD) errors.push({ field: "cep", message: "CEP é obrigatório." });
  else if (cepD.length !== 8)
    errors.push({ field: "cep", message: "CEP deve ter 8 dígitos." });

  if (!logradouro)
    errors.push({ field: "logradouro", message: "Logradouro é obrigatório." });
  if (!numero)
    errors.push({
      field: "numero",
      message: "Informe o número ou S/N.",
    });
  if (!bairro) errors.push({ field: "bairro", message: "Bairro é obrigatório." });
  if (!cidade) errors.push({ field: "cidade", message: "Cidade é obrigatória." });

  const state = uf.trim().toUpperCase();
  if (!state) errors.push({ field: "uf", message: "UF é obrigatória." });
  else if (!/^[A-Z]{2}$/.test(state))
    errors.push({ field: "uf", message: "UF inválida (2 letras)." });

  let ibgeD = ibge.replace(/\D/g, "");
  if (!ibgeD && cidade && state) {
    const resolved = await resolveIbgeCode(cidade, state, ibgeCache);
    if (resolved) ibgeD = resolved;
  }
  if (!ibgeD)
    errors.push({
      field: "codigo_ibge",
      message: "Código IBGE obrigatório (informe ou use cidade+UF resolvíveis).",
    });
  else if (ibgeD.length !== 7)
    errors.push({
      field: "codigo_ibge",
      message: "Código IBGE deve ter 7 dígitos.",
    });

  let sellerId: string | null = null;
  if (vendedorRef) {
    const byEmail = lookups.sellersByEmail.get(vendedorRef.trim().toLowerCase());
    const byName = lookups.sellersByName.get(normKey(vendedorRef));
    sellerId = byEmail ?? byName ?? null;
    // Se não achar, segue sem vendedor (comum em exports de terceiros).
  }

  // Limite é opcional: vazio, 0, placeholder ou valor não numérico → sem limite.
  // Exports de ERP costumam preencher 0 / 0,00 / "-" e isso não deve invalidar a linha.
  let creditLimit: number | null = null;
  if (limiteRaw) {
    const n = parseBrNumber(limiteRaw);
    if (n != null && n > 0) {
      creditLimit = n;
    }
  }

  if (errors.length) return { errors, prepared: null };

  const numberValue =
    numero.trim().toUpperCase() === STREET_NUMBER_SN ||
    numero.trim().toUpperCase() === "SN"
      ? STREET_NUMBER_SN
      : numero.trim();

  return {
    errors: [],
    prepared: {
      documentType,
      name: documentType === "CNPJ" ? fantasia || razao : nome,
      email: email.trim().toLowerCase(),
      phone,
      cnpj,
      cpf,
      legalName: documentType === "CNPJ" ? razao : null,
      tradeName: documentType === "CNPJ" ? fantasia : null,
      cep: cepD,
      street: logradouro,
      number: numberValue,
      neighborhood: bairro,
      addressNote: complemento.trim() || FIELD_NOT_APPLICABLE,
      state,
      city: cidade,
      cityIbgeCode: ibgeD,
      stateRegistration: ie.trim() || STATE_REGISTRATION_UNAVAILABLE,
      buyerName: comprador.trim() || FIELD_NOT_APPLICABLE,
      notes: observacoes.trim() || FIELD_NOT_APPLICABLE,
      sellerId,
      creditLimit,
    },
  };
}

async function runCustomerRows(
  organizationId: string,
  csvText: string,
  columnMap: CsvColumnMap | undefined,
  fieldDefaults?: Record<string, string>,
): Promise<{
  rows: ImportRowResult[];
  preparedList: Array<{ line: number; data: PreparedCustomer }>;
  lookups: OrgLookups;
}> {
  const parsed = parseCsvText(csvText);
  const lookups = await loadOrgLookups(organizationId);
  const docsInFile = new Map<string, number>();
  const ibgeCache: IbgeCache = new Map();
  const rows: ImportRowResult[] = [];
  const preparedList: Array<{ line: number; data: PreparedCustomer }> = [];

  for (const row of parsed.rows) {
    const cells = remapCsvCells(row.cells, columnMap);
    const { errors, prepared } = await validateCustomerRow(
      cells,
      lookups,
      docsInFile,
      row.line,
      ibgeCache,
      fieldDefaults,
    );
    if (errors.length || !prepared) {
      rows.push({
        line: row.line,
        status: "error",
        errors,
        preview: {
          documento: cell(cells, "documento"),
          nome: cell(cells, "nome", "nome_fantasia", "razao_social"),
        },
      });
      continue;
    }
    rows.push({
      line: row.line,
      status: "ok",
      errors: [],
      preview: {
        tipo_documento: prepared.documentType,
        documento: prepared.cnpj ?? prepared.cpf ?? "",
        nome: prepared.name,
        email: prepared.email,
      },
    });
    preparedList.push({ line: row.line, data: prepared });
  }

  return { rows, preparedList, lookups };
}

export async function previewCustomerImport(
  organizationId: string,
  csvText: string,
  columnMap?: CsvColumnMap,
  fieldDefaults?: Record<string, string>,
): Promise<ImportPreviewResult> {
  const { rows } = await runCustomerRows(
    organizationId,
    csvText,
    columnMap,
    fieldDefaults,
  );
  return summarizeImportRows(rows);
}

export async function commitCustomerImport(params: {
  organizationId: string;
  actorUserId: string;
  actorMatricula: string | null;
  csvText: string;
  columnMap?: CsvColumnMap;
  fieldDefaults?: Record<string, string>;
}): Promise<ImportPreviewResult> {
  const { rows, preparedList, lookups } = await runCustomerRows(
    params.organizationId,
    params.csvText,
    params.columnMap,
    params.fieldDefaults,
  );

  let createdCount = 0;
  for (const item of preparedList) {
    const d = item.data;
    try {
      const created = await prisma.$transaction(async (tx) => {
        const code = await nextCustomerCode(tx, params.organizationId);
        const body: CustomerBodyInput = {
          name: d.name,
          email: d.email,
          phone: d.phone,
          documentType: d.documentType,
          cnpj: d.cnpj,
          cpf: d.cpf,
          legalName: d.legalName,
          tradeName: d.tradeName,
          cep: d.cep,
          street: d.street,
          number: d.number,
          neighborhood: d.neighborhood,
          addressNote: d.addressNote,
          state: d.state,
          city: d.city,
          cityIbgeCode: d.cityIbgeCode,
          stateRegistration: d.stateRegistration,
          buyerName: d.buyerName,
          notes: d.notes,
          creditLimit: d.creditLimit,
          sellerId: d.sellerId,
        };
        return tx.customer.create({
          data: {
            organizationId: params.organizationId,
            code,
            ...toCustomerPrismaData(body, { includeCredit: true }),
          } as Prisma.CustomerUncheckedCreateInput,
        });
      });
      await writeAuditLog({
        organizationId: params.organizationId,
        userId: params.actorUserId,
        userMatricula: params.actorMatricula,
        action: AUDIT_ACTION.CREATE,
        entityType: AUDIT_ENTITY.Customer,
        entityId: created.id,
        metadata: { name: created.name, code: created.code, source: "csv_import" },
      });
      if (d.cnpj) lookups.existingCnpjs.add(d.cnpj);
      if (d.cpf) lookups.existingCpfs.add(d.cpf);
      createdCount += 1;
    } catch (e) {
      const msg =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
          ? "CNPJ ou CPF já cadastrado nesta organização."
          : e instanceof Error
            ? e.message
            : "Falha ao criar cliente.";
      const row = rows.find((r) => r.line === item.line);
      if (row) {
        row.status = "error";
        row.errors = [{ field: "_", message: msg }];
      }
    }
  }

  return summarizeImportRows(rows, createdCount);
}
