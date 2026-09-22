import type { Role } from "@prisma/client";
import {
  defaultPermissionRows,
  EDITABLE_ROLES,
  getPermission,
  isPermissionLevel,
  isPermissionResource,
  LOCKED_ROLES,
  PERMISSION_RESOURCE_LABELS,
  PERMISSION_RESOURCES,
  ROLE_LABELS,
  type PermissionLevel,
  type PermissionResource,
} from "../auth/permissions.js";
import { prisma } from "../db.js";
import {
  getProfilePermissionsMap,
  isCustomProfileKey,
} from "./org-profiles.js";

type LevelMap = Record<Role, Record<PermissionResource, PermissionLevel>>;

const ALL_ROLES: Role[] = ["ADMIN", "MANAGER", "SELLER", "SUPERVISOR"];
const DEFAULT_ENABLED_ROLES: Role[] = ["ADMIN", "MANAGER", "SELLER"];

const cache = new Map<string, { at: number; map: LevelMap }>();
const CACHE_TTL_MS = 30_000;

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ALL_ROLES as string[]).includes(value);
}

/** Lê e normaliza `Organization.enabledRoles` (sempre inclui ADMIN). */
export function parseEnabledRoles(raw: unknown): Role[] {
  let list: unknown[] | null = null;
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = null;
    }
  }
  if (list == null) return [...DEFAULT_ENABLED_ROLES];
  const roles = list.filter(isRole);
  return Array.from(new Set<Role>(["ADMIN", ...roles]));
}

export async function getOrgEnabledRoles(
  organizationId: string,
): Promise<Role[]> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { enabledRoles: true },
  });
  return parseEnabledRoles(org?.enabledRoles);
}

export async function setOrgEnabledRoles(
  organizationId: string,
  roles: string[],
): Promise<Role[]> {
  const next = parseEnabledRoles(roles);
  await prisma.organization.update({
    where: { id: organizationId },
    data: { enabledRoles: next as unknown as object },
  });
  return next;
}

function emptyLevelMap(): LevelMap {
  const map = {} as LevelMap;
  for (const role of ALL_ROLES) {
    map[role] = {} as Record<PermissionResource, PermissionLevel>;
    for (const resource of PERMISSION_RESOURCES) {
      map[role][resource] = getPermission(role, resource);
    }
  }
  return map;
}

function invalidateCache(organizationId: string) {
  cache.delete(organizationId);
}

/** Garante linhas default para a org (idempotente). */
export async function ensureOrgRolePermissions(
  organizationId: string,
): Promise<void> {
  const rows = defaultPermissionRows();
  const created = await prisma.organizationRolePermission.createMany({
    data: rows.map((r) => ({
      organizationId,
      role: r.role,
      resource: r.resource,
      level: r.level,
    })),
    skipDuplicates: true,
  });
  if (created.count > 0) invalidateCache(organizationId);
}

async function loadLevelMap(organizationId: string): Promise<LevelMap> {
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.map;

  await ensureOrgRolePermissions(organizationId);

  const rows = await prisma.organizationRolePermission.findMany({
    where: { organizationId },
    select: { role: true, resource: true, level: true },
  });

  const map = emptyLevelMap();
  for (const row of rows) {
    if (!isPermissionResource(row.resource)) continue;
    if (!isPermissionLevel(row.level)) continue;
    map[row.role][row.resource] = row.level;
  }

  // Proteção: ADMIN nunca perde users (write) nem permissions (pelo menos read).
  map.ADMIN.users = "write";
  if (map.ADMIN.permissions === "none") {
    map.ADMIN.permissions = "read";
  }

  cache.set(organizationId, { at: Date.now(), map });
  return map;
}

export async function getEffectivePermission(
  organizationId: string,
  role: Role,
  resource: PermissionResource,
): Promise<PermissionLevel> {
  const map = await loadLevelMap(organizationId);
  return map[role][resource] ?? "none";
}

/** Permissão efetiva considerando perfil personalizado do usuário (se houver). */
export async function getEffectivePermissionForUser(
  organizationId: string,
  userId: string,
  role: Role,
  resource: PermissionResource,
): Promise<PermissionLevel> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: { organizationProfileId: true },
  });
  if (user?.organizationProfileId) {
    const profileMap = await getProfilePermissionsMap(
      user.organizationProfileId,
    );
    if (profileMap) return profileMap[resource] ?? "none";
  }
  return getEffectivePermission(organizationId, role, resource);
}

export async function canReadEffective(
  organizationId: string,
  role: Role,
  resource: PermissionResource,
): Promise<boolean> {
  const level = await getEffectivePermission(organizationId, role, resource);
  return level === "read" || level === "write";
}

export async function canReadEffectiveForUser(
  organizationId: string,
  userId: string,
  role: Role,
  resource: PermissionResource,
): Promise<boolean> {
  const level = await getEffectivePermissionForUser(
    organizationId,
    userId,
    role,
    resource,
  );
  return level === "read" || level === "write";
}

export async function canWriteEffective(
  organizationId: string,
  role: Role,
  resource: PermissionResource,
): Promise<boolean> {
  return (
    (await getEffectivePermission(organizationId, role, resource)) === "write"
  );
}

export async function canWriteEffectiveForUser(
  organizationId: string,
  userId: string,
  role: Role,
  resource: PermissionResource,
): Promise<boolean> {
  const level = await getEffectivePermissionForUser(
    organizationId,
    userId,
    role,
    resource,
  );
  return level === "write";
}

export async function getRolePermissionsMap(
  organizationId: string,
  role: Role,
): Promise<Record<PermissionResource, PermissionLevel>> {
  const map = await loadLevelMap(organizationId);
  return { ...map[role] };
}

/** Mapa de permissões do usuário: perfil customizado tem prioridade. */
export async function getPermissionsMapForUser(
  organizationId: string,
  role: Role,
  organizationProfileId: string | null | undefined,
): Promise<Record<PermissionResource, PermissionLevel>> {
  if (organizationProfileId) {
    const profileMap = await getProfilePermissionsMap(organizationProfileId);
    if (profileMap) return profileMap;
  }
  return getRolePermissionsMap(organizationId, role);
}

export async function buildEffectivePermissionsMatrix(organizationId: string) {
  const map = await loadLevelMap(organizationId);
  const enabledRoles = await getOrgEnabledRoles(organizationId);
  // Matriz só mostra roles habilitados; ADMIN sempre.
  const systemRoles = ALL_ROLES.filter(
    (role) => role === "ADMIN" || enabledRoles.includes(role),
  );

  const customProfiles = await prisma.organizationProfile.findMany({
    where: { organizationId, enabled: true },
    include: {
      permissions: { select: { resource: true, level: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  const roles = [
    ...systemRoles.map((role) => ({
      role: role as string,
      label: ROLE_LABELS[role],
      hasSellerProfile: role === "SELLER",
      locked: LOCKED_ROLES.includes(role),
      kind: "system" as const,
      profileId: null as string | null,
    })),
    ...customProfiles.map((p) => ({
      role: p.key,
      label: p.name,
      hasSellerProfile: p.hasSellerProfile,
      locked: false,
      kind: "custom" as const,
      profileId: p.id,
    })),
  ];

  const customLevels = new Map<
    string,
    Record<PermissionResource, PermissionLevel>
  >();
  for (const p of customProfiles) {
    const levels = {} as Record<PermissionResource, PermissionLevel>;
    for (const resource of PERMISSION_RESOURCES) {
      levels[resource] = "none";
    }
    for (const row of p.permissions) {
      if (!isPermissionResource(row.resource)) continue;
      if (!isPermissionLevel(row.level)) continue;
      levels[row.resource] = row.level;
    }
    customLevels.set(p.key, levels);
  }

  return {
    roles,
    resources: PERMISSION_RESOURCES.map((resource) => ({
      resource,
      label: PERMISSION_RESOURCE_LABELS[resource],
      levels: Object.fromEntries(
        roles.map((col) => {
          if (col.kind === "custom") {
            return [col.role, customLevels.get(col.role)?.[resource] ?? "none"];
          }
          return [col.role, map[col.role as Role][resource]];
        }),
      ) as Record<string, PermissionLevel>,
    })),
    enabledRoles,
    allRoles: ALL_ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      hasSellerProfile: role === "SELLER",
    })),
    customProfiles: customProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      key: p.key,
      enabled: p.enabled,
      hasSellerProfile: p.hasSellerProfile,
    })),
    editableRoles: EDITABLE_ROLES.filter((r) => enabledRoles.includes(r)),
    lockedRoles: LOCKED_ROLES,
    notes: [
      "A coluna Administrador é somente leitura no painel (evita lockout em Usuários/Permissões).",
      "Perfis criados por você começam sem acesso; configure cada recurso na matriz.",
      "Perfis desabilitados não aparecem na matriz (ADMIN permanece sempre).",
      "Escritas em rotas sensíveis de /admin podem continuar exigindo Administrador na API.",
    ],
  };
}

export type PermissionMatrixUpdate = {
  role: string;
  resource: PermissionResource;
  level: PermissionLevel;
};

/** Atualiza roles editáveis e/ou permissões de perfis customizados. */
export async function updateOrgRolePermissions(
  organizationId: string,
  updates: PermissionMatrixUpdate[],
): Promise<Awaited<ReturnType<typeof buildEffectivePermissionsMatrix>>> {
  await ensureOrgRolePermissions(organizationId);

  const systemUpdates = updates.filter(
    (u) =>
      isRole(u.role) &&
      EDITABLE_ROLES.includes(u.role) &&
      isPermissionResource(u.resource) &&
      isPermissionLevel(u.level),
  );

  const customKeyUpdates = updates.filter(
    (u) =>
      isCustomProfileKey(u.role) &&
      isPermissionResource(u.resource) &&
      isPermissionLevel(u.level),
  );

  if (systemUpdates.length > 0) {
    await prisma.$transaction(
      systemUpdates.map((u) =>
        prisma.organizationRolePermission.upsert({
          where: {
            organizationId_role_resource: {
              organizationId,
              role: u.role as Role,
              resource: u.resource,
            },
          },
          create: {
            organizationId,
            role: u.role as Role,
            resource: u.resource,
            level: u.level,
          },
          update: { level: u.level },
        }),
      ),
    );
  }

  if (customKeyUpdates.length > 0) {
    const keys = [...new Set(customKeyUpdates.map((u) => u.role))];
    const profiles = await prisma.organizationProfile.findMany({
      where: { organizationId, key: { in: keys } },
      select: { id: true, key: true },
    });
    const keyToId = new Map(profiles.map((p) => [p.key, p.id]));

    const ops = customKeyUpdates
      .map((u) => {
        const profileId = keyToId.get(u.role);
        if (!profileId) return null;
        return prisma.organizationProfilePermission.upsert({
          where: {
            profileId_resource: { profileId, resource: u.resource },
          },
          create: { profileId, resource: u.resource, level: u.level },
          update: { level: u.level },
        });
      })
      .filter((op): op is NonNullable<typeof op> => op != null);

    if (ops.length > 0) await prisma.$transaction(ops);
  }

  // Reafirma defaults da coluna ADMIN no banco.
  const adminDefaults = defaultPermissionRows().filter(
    (r) => r.role === "ADMIN",
  );
  await prisma.$transaction(
    adminDefaults.map((r) =>
      prisma.organizationRolePermission.upsert({
        where: {
          organizationId_role_resource: {
            organizationId,
            role: "ADMIN",
            resource: r.resource,
          },
        },
        create: {
          organizationId,
          role: "ADMIN",
          resource: r.resource,
          level: r.level,
        },
        update: { level: r.level },
      }),
    ),
  );

  invalidateCache(organizationId);
  return buildEffectivePermissionsMatrix(organizationId);
}

/** Mapeia path do plugin /admin → recurso da matriz (GET). */
export function adminPathToResource(
  routePath: string,
): PermissionResource | null {
  const path = routePath.split("?")[0] ?? routePath;
  if (path === "/" || path === "") return "dashboard";
  if (
    path.startsWith("/products") ||
    path.startsWith("/product-categories") ||
    path.startsWith("/purchase-units") ||
    path.startsWith("/promotions")
  )
    return "products";
  if (path.startsWith("/stock")) return "stock";
  if (path.startsWith("/suppliers")) return "suppliers";
  if (
    path.startsWith("/fiscal") ||
    path.startsWith("/establishments") ||
    path.startsWith("/fixed-expenses") ||
    path.startsWith("/accounts-payable") ||
    path.startsWith("/cost-centers") ||
    path.startsWith("/expense-histories") ||
    path.startsWith("/nfe") ||
    path.startsWith("/banking") ||
    path.startsWith("/receivables")
  )
    return "fiscal";
  if (path.startsWith("/boletos")) return "boletos";
  if (path.startsWith("/customers") || path.startsWith("/credit"))
    return "customers";
  if (/^\/orders\/[^/]+\/pdf-80mm$/.test(path)) return "orders_print_80mm";
  if (
    path.startsWith("/orders") ||
    path.startsWith("/payment-conditions") ||
    path.startsWith("/order-situations")
  )
    return "orders";
  if (
    path.startsWith("/sellers") ||
    path.startsWith("/managers") ||
    path.startsWith("/seller-locations")
  ) {
    if (path.startsWith("/seller-locations")) return "tracking";
    return "sellers";
  }
  if (path.startsWith("/teams") || path.startsWith("/sales-teams"))
    return "teams";
  if (path.startsWith("/users") || path.startsWith("/staff")) return "users";
  if (path.startsWith("/customer-visits")) return "visits";
  if (
    path === "/reports/commissions-payable" ||
    path === "/reports/commissions-payable.pdf" ||
    path === "/reports/commissions-payable.xlsx"
  ) {
    return "reports_commissions_payable";
  }
  if (path === "/commission-settings") return "commissions";
  if (path.startsWith("/reports") || path.startsWith("/insights"))
    return "reports";
  if (path.startsWith("/expedition")) return "expedition";
  if (path.startsWith("/commission") || path.startsWith("/goals"))
    return "commissions";
  if (path.startsWith("/price-tables") || path.startsWith("/pricing"))
    return "price_tables";
  if (
    path.startsWith("/permissions") ||
    path.startsWith("/system-settings") ||
    path.startsWith("/profiles")
  )
    return "permissions";
  if (path.startsWith("/order-situations")) return "orders";
  if (path.startsWith("/audit")) return "audit";
  if (path.startsWith("/notifications/send")) return "broadcast";
  return null;
}
