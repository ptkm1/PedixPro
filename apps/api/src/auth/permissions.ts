import type { Role } from "@prisma/client";

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
  "commissions",
  "price_tables",
  "permissions",
  "audit",
  "broadcast",
  "expedition",
];

export const EDITABLE_ROLES: Role[] = ["MANAGER", "SELLER", "SUPERVISOR"];

/** Coluna ADMIN é imutável no painel (evita lockout de permissions/users). */
export const LOCKED_ROLES: Role[] = ["ADMIN"];

/**
 * Defaults estáticos: seed + fallback.
 * Smoke tests (`canWrite`/`buildPermissionsMatrix`) usam esta matriz.
 * Em runtime org-scoped, preferir `role-permissions.ts` (DB).
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

/** Nível default (sem override de org). Usado por smoke e seed. */
export function getPermission(
  role: Role,
  resource: PermissionResource,
): PermissionLevel {
  return ROLE_PERMISSIONS[resource]?.[role] ?? "none";
}

export function canRead(role: Role, resource: PermissionResource): boolean {
  const level = getPermission(role, resource);
  return level === "read" || level === "write";
}

export function canWrite(role: Role, resource: PermissionResource): boolean {
  return getPermission(role, resource) === "write";
}

export function isPermissionLevel(value: string): value is PermissionLevel {
  return value === "none" || value === "read" || value === "write";
}

export function isPermissionResource(
  value: string,
): value is PermissionResource {
  return (PERMISSION_RESOURCES as string[]).includes(value);
}

/** Matriz default (smoke / documentação). Preferir buildEffectivePermissionsMatrix no painel. */
export function buildPermissionsMatrix() {
  const roles: Role[] = ["ADMIN", "MANAGER", "SELLER", "SUPERVISOR"];
  return {
    roles: roles.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      hasSellerProfile: role === "SELLER",
      locked: LOCKED_ROLES.includes(role),
    })),
    resources: PERMISSION_RESOURCES.map((resource) => ({
      resource,
      label: PERMISSION_RESOURCE_LABELS[resource],
      levels: Object.fromEntries(
        roles.map((role) => [role, getPermission(role, resource)]),
      ) as Record<Role, PermissionLevel>,
    })),
    editableRoles: EDITABLE_ROLES,
    lockedRoles: LOCKED_ROLES,
    notes: [
      "Gestor (MANAGER) é usuário de staff somente leitura, sem perfil Seller.",
      "A coluna Administrador é somente leitura no painel (evita lockout em Usuários/Permissões).",
      "Alterações de estoque exigem reautenticação (senha) e geram AuditLog.",
      "SUPERVISOR existe no enum mas não tem acesso efetivo neste ciclo.",
      "Escritas em /admin continuam exigindo role ADMIN; a matriz controla leitura/nav e futuros gates.",
    ],
  };
}

export function defaultPermissionRows(): Array<{
  role: Role;
  resource: PermissionResource;
  level: PermissionLevel;
}> {
  const roles: Role[] = ["ADMIN", "MANAGER", "SELLER", "SUPERVISOR"];
  const rows: Array<{
    role: Role;
    resource: PermissionResource;
    level: PermissionLevel;
  }> = [];
  for (const resource of PERMISSION_RESOURCES) {
    for (const role of roles) {
      rows.push({ role, resource, level: getPermission(role, resource) });
    }
  }
  return rows;
}
