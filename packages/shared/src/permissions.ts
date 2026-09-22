type Role = "ADMIN" | "SELLER" | "SUPERVISOR" | "MANAGER";

export type PermissionLevel = "none" | "read" | "write";

export type PermissionResource =
  | "dashboard"
  | "products"
  | "stock"
  | "suppliers"
  | "fiscal"
  | "boletos"
  | "customers"
  | "orders"
  | "orders_print_80mm"
  | "sellers"
  | "teams"
  | "users"
  | "tracking"
  | "visits"
  | "reports"
  | "reports_profit_percent"
  | "reports_commissions_payable"
  | "commissions"
  | "price_tables"
  | "permissions"
  | "audit"
  | "broadcast"
  | "expedition";

export const PERMISSION_RESOURCES: PermissionResource[] = [
  "dashboard",
  "products",
  "stock",
  "suppliers",
  "fiscal",
  "boletos",
  "customers",
  "orders",
  "orders_print_80mm",
  "sellers",
  "teams",
  "users",
  "tracking",
  "visits",
  "reports",
  "reports_profit_percent",
  "reports_commissions_payable",
  "commissions",
  "price_tables",
  "permissions",
  "audit",
  "broadcast",
  "expedition",
];

export const EDITABLE_ROLES: Role[] = ["MANAGER", "SELLER", "SUPERVISOR"];
export const LOCKED_ROLES: Role[] = ["ADMIN"];

/**
 * Defaults alinhados com API (`apps/api/src/auth/permissions.ts`).
 * Em runtime, a web deve preferir `user.permissions` de `/auth/me`.
 */
export const ROLE_PERMISSIONS: Record<
  PermissionResource,
  Partial<Record<Role, PermissionLevel>>
> = {
  dashboard: {
    ADMIN: "read",
    MANAGER: "read",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  products: {
    ADMIN: "write",
    MANAGER: "none",
    SELLER: "read",
    SUPERVISOR: "none",
  },
  stock: {
    ADMIN: "write",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  suppliers: {
    ADMIN: "write",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  fiscal: {
    ADMIN: "write",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  boletos: {
    ADMIN: "write",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  customers: {
    ADMIN: "write",
    MANAGER: "none",
    SELLER: "write",
    SUPERVISOR: "none",
  },
  orders: {
    ADMIN: "write",
    MANAGER: "write",
    SELLER: "write",
    SUPERVISOR: "none",
  },
  orders_print_80mm: {
    ADMIN: "read",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  sellers: {
    ADMIN: "write",
    MANAGER: "read",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  teams: {
    ADMIN: "write",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  users: {
    ADMIN: "write",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  tracking: {
    ADMIN: "read",
    MANAGER: "read",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  visits: {
    ADMIN: "read",
    MANAGER: "read",
    SELLER: "write",
    SUPERVISOR: "none",
  },
  reports: {
    ADMIN: "read",
    MANAGER: "read",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  reports_profit_percent: {
    ADMIN: "read",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  reports_commissions_payable: {
    ADMIN: "read",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  commissions: {
    ADMIN: "write",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  price_tables: {
    ADMIN: "write",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  permissions: {
    ADMIN: "read",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  audit: {
    ADMIN: "read",
    MANAGER: "none",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  broadcast: {
    ADMIN: "write",
    MANAGER: "write",
    SELLER: "none",
    SUPERVISOR: "none",
  },
  expedition: {
    ADMIN: "write",
    MANAGER: "write",
    SELLER: "none",
    SUPERVISOR: "none",
  },
};

export const PERMISSION_RESOURCE_LABELS: Record<PermissionResource, string> = {
  dashboard: "Início",
  products: "Produtos",
  stock: "Estoque",
  suppliers: "Fornecedores",
  fiscal: "Financeiro",
  boletos: "Emissão de boletos",
  customers: "Clientes",
  orders: "Pedidos / Vendas",
  orders_print_80mm: "Imprimir pedido 80mm",
  sellers: "Vendedores",
  teams: "Equipes",
  users: "Usuários (admin/gestor)",
  tracking: "Rastreio",
  visits: "Visitas",
  reports: "Relatórios",
  reports_profit_percent: "Percentual de lucro em relatórios",
  reports_commissions_payable: "Visualizar relatório de comissões a pagar",
  commissions: "Comissões",
  price_tables: "Tabelas de preço",
  permissions: "Permissões (matriz)",
  audit: "Auditoria",
  broadcast: "Notificar vendedores",
  expedition: "Expedição",
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  SELLER: "Vendedor",
  SUPERVISOR: "Supervisor (não usado)",
};

export type PermissionsMap = Partial<
  Record<PermissionResource, PermissionLevel>
>;

export function getPermission(
  role: Role,
  resource: PermissionResource,
): PermissionLevel {
  return ROLE_PERMISSIONS[resource]?.[role] ?? "none";
}

export function levelAllowsRead(level: PermissionLevel | undefined): boolean {
  return level === "read" || level === "write";
}

export function levelAllowsWrite(level: PermissionLevel | undefined): boolean {
  return level === "write";
}

/** Preferir mapa efetivo (`/auth/me`); fallback para defaults estáticos. */
export function resolvePermission(
  role: Role,
  resource: PermissionResource,
  map?: PermissionsMap | null,
): PermissionLevel {
  if (map && map[resource] != null) return map[resource]!;
  return getPermission(role, resource);
}

export function canRead(
  role: Role,
  resource: PermissionResource,
  map?: PermissionsMap | null,
): boolean {
  return levelAllowsRead(resolvePermission(role, resource, map));
}

export function canWrite(
  role: Role,
  resource: PermissionResource,
  map?: PermissionsMap | null,
): boolean {
  return levelAllowsWrite(resolvePermission(role, resource, map));
}
