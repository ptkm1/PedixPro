import { formatStockAuditDetails } from "@pedidos/shared";

export type AuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userMatricula: string | null;
  metadata: unknown;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    matricula: string | null;
  } | null;
};

export type AuditLogsResponse = {
  items: AuditLogRow[];
  total: number;
  take: number;
  skip: number;
};

export const ACTION_LABELS: Record<string, string> = {
  CREATE: "Criação",
  UPDATE: "Atualização",
  DELETE: "Exclusão",
  STATUS_CHANGE: "Mudança de status",
  STOCK_ENTRY: "Movimentação de estoque",
  STOCK_SALE: "Baixa por venda",
  STOCK_SALE_REVERSAL: "Estorno de venda",
  NFE_EMIT: "Emissão NF-e",
  NFE_TRANSMIT: "Transmissão NF-e",
  NFE_CANCEL: "Cancelamento NF-e",
  NFE_CCE: "Carta de correção (CC-e)",
  NFE_INUTILIZACAO: "Inutilização de numeração NF-e",
  NFE_CONSULTA: "Consulta situação NF-e",
  NFE_EMAIL: "Envio NF-e por e-mail",
  NFE_IMPORT: "Importação NF-e",
  NFE_CONFIRM_IMPORT: "Confirmação de importação",
  FISCAL_SETTINGS: "Config. fiscal",
  FISCAL_CERTIFICATE: "Certificado digital",
  FISCAL_LOGO: "Logo DANFE",
  PERMISSIONS_UPDATE: "Permissões",
  // legado (antes da padronização)
  "product.create": "Criação",
  "product.delete": "Exclusão",
  "user.create": "Criação",
  "stock.sale": "Baixa por venda",
  "stock.sale_reversal": "Estorno de venda",
  PERMISSIONS_MATRIX_UPDATE: "Permissões",
};

export const ENTITY_LABELS: Record<string, string> = {
  Product: "Produto",
  Customer: "Cliente",
  Order: "Pedido",
  User: "Usuário",
  Supplier: "Fornecedor",
  SalesTeam: "Equipe",
  PriceTable: "Tabela de preço",
  ProductPromotion: "Promoção",
  FiscalInvoice: "NF-e",
  FiscalConfig: "Config. fiscal",
  OrganizationRolePermission: "Permissões",
};

/** Opções de filtro de ação (valores canônicos atuais). */
export const AUDIT_ACTION_FILTER_OPTIONS = [
  { value: "CREATE", label: ACTION_LABELS.CREATE },
  { value: "UPDATE", label: ACTION_LABELS.UPDATE },
  { value: "DELETE", label: ACTION_LABELS.DELETE },
  { value: "STATUS_CHANGE", label: ACTION_LABELS.STATUS_CHANGE },
  { value: "STOCK_ENTRY", label: ACTION_LABELS.STOCK_ENTRY },
  { value: "STOCK_SALE", label: ACTION_LABELS.STOCK_SALE },
  { value: "STOCK_SALE_REVERSAL", label: ACTION_LABELS.STOCK_SALE_REVERSAL },
  { value: "NFE_EMIT", label: ACTION_LABELS.NFE_EMIT },
  { value: "NFE_TRANSMIT", label: ACTION_LABELS.NFE_TRANSMIT },
  { value: "NFE_CANCEL", label: ACTION_LABELS.NFE_CANCEL },
  { value: "NFE_CCE", label: ACTION_LABELS.NFE_CCE },
  { value: "NFE_INUTILIZACAO", label: ACTION_LABELS.NFE_INUTILIZACAO },
  { value: "NFE_CONSULTA", label: ACTION_LABELS.NFE_CONSULTA },
  { value: "NFE_EMAIL", label: ACTION_LABELS.NFE_EMAIL },
  { value: "NFE_IMPORT", label: ACTION_LABELS.NFE_IMPORT },
  { value: "NFE_CONFIRM_IMPORT", label: ACTION_LABELS.NFE_CONFIRM_IMPORT },
  { value: "FISCAL_SETTINGS", label: ACTION_LABELS.FISCAL_SETTINGS },
  { value: "FISCAL_CERTIFICATE", label: ACTION_LABELS.FISCAL_CERTIFICATE },
  { value: "FISCAL_LOGO", label: ACTION_LABELS.FISCAL_LOGO },
  { value: "PERMISSIONS_UPDATE", label: ACTION_LABELS.PERMISSIONS_UPDATE },
] as const;

export const AUDIT_ENTITY_FILTER_OPTIONS = Object.entries(ENTITY_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (action.startsWith("stock.")) return "Movimentação de estoque";
  return action;
}

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

export function formatAuditDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STOCK_META_KEYS = new Set([
  "movementType",
  "qtyDelta",
  "qty",
  "lotCode",
  "unitLabel",
  "unit",
  "reason",
  "movementId",
  "lotId",
  "expiresAt",
  "balanceAfter",
]);

/** Parseia metadata legado serializado como "chave: valor - chave: valor". */
function parseLooseKeyValueMetadata(
  raw: string,
): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* segue para key:value */
    }
  }
  if (!trimmed.includes(":")) return null;

  const obj: Record<string, unknown> = {};
  const chunks = trimmed.split(/\s+[·\-–—]\s+/);
  const numericKeys = new Set(["qtyDelta", "qty", "balanceAfter", "count"]);
  for (const chunk of chunks) {
    const colon = chunk.indexOf(":");
    if (colon <= 0) continue;
    const key = chunk.slice(0, colon).trim();
    if (!/^\w+$/.test(key)) continue;
    let value: unknown = chunk.slice(colon + 1).trim();
    if (value === "null") value = null;
    else if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (
      numericKeys.has(key) &&
      typeof value === "string" &&
      /^-?\d+(\.\d+)?$/.test(value)
    ) {
      value = Number(value);
    }
    obj[key] = value;
  }
  return Object.keys(obj).length > 0 ? obj : null;
}

function coerceMetadataObject(
  metadata: unknown,
): Record<string, unknown> | null {
  if (metadata == null) return null;
  if (typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  if (typeof metadata === "string") {
    return parseLooseKeyValueMetadata(metadata);
  }
  return null;
}

export function summarizeMetadata(metadata: unknown): string {
  if (metadata == null) return "—";

  const obj = coerceMetadataObject(metadata);
  if (!obj) {
    return typeof metadata === "string" ? metadata || "—" : String(metadata);
  }

  const stockDetails = formatStockAuditDetails(obj);
  if (stockDetails) return stockDetails;

  const parts: string[] = [];
  const pick = [
    "name",
    "fromStatus",
    "toStatus",
    "status",
    "fields",
    "justification",
    "accessKey",
    "number",
    "op",
    "email",
    "role",
    "batch",
    "count",
  ] as const;
  for (const key of pick) {
    const v = obj[key];
    if (v == null) continue;
    if (STOCK_META_KEYS.has(key)) continue;
    if (key === "fields" && Array.isArray(v)) {
      parts.push(`campos: ${v.join(", ")}`);
      continue;
    }
    if (key === "fromStatus" || key === "toStatus") continue;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      parts.push(`${key}: ${v}`);
    }
  }
  if (obj.fromStatus != null || obj.toStatus != null) {
    parts.unshift(
      `${String(obj.fromStatus ?? "?")} → ${String(obj.toStatus ?? "?")}`,
    );
  }
  if (parts.length === 0) {
    try {
      const raw = JSON.stringify(obj);
      return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
    } catch {
      return "—";
    }
  }
  return parts.join(" · ");
}

/** Canal inferido: app vendedor vs painel (ou sistema sem usuário). */
export function auditSourceLabel(metadata: unknown, hasUser: boolean): string {
  if (
    metadata &&
    typeof metadata === "object" &&
    (metadata as Record<string, unknown>).source === "seller"
  ) {
    return "App";
  }
  if (!hasUser) return "Sistema";
  return "Painel";
}

/** Deep link para a entidade auditada, quando existir rota útil. */
export function auditEntityHref(
  entityType: string,
  entityId: string | null,
): string | null {
  if (!entityId) {
    if (entityType === "FiscalConfig") return "/faturamento";
    if (entityType === "OrganizationRolePermission")
      return "/configuracoes?abrir=permissoes";
    return null;
  }
  switch (entityType) {
    case "Order":
      return `/pedidos/${entityId}`;
    case "Product":
      return `/produtos/${entityId}/editar`;
    case "Customer":
      return `/clientes`;
    case "Supplier":
      return `/fornecedores`;
    case "User":
      return `/usuarios`;
    case "SalesTeam":
      return `/equipes`;
    case "PriceTable":
      return entityId ? `/tabelas-preco/${entityId}` : `/tabelas-preco`;
    case "FiscalInvoice":
      return `/faturamento`;
    case "FiscalConfig":
      return `/faturamento`;
    case "OrganizationRolePermission":
      return `/configuracoes?abrir=permissoes`;
    default:
      return null;
  }
}
