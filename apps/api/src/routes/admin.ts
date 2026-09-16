import {
    capHomeIndicators,
    HOME_CHART_INDICATOR_KEYS,
    HOME_INDICATOR_KEYS,
    homeIndicatorLimitForPlan,
    isLifecycleSituationCode,
    isReservedSituationCode,
    normalizePurchaseUnitCode,
    parseHomeIndicators,
    persistHomeIndicatorsError,
    uniqueIdsPreserveOrder,
    type HomeChartIndicatorKey,
    type HomeIndicatorKey,
} from "@pedidos/shared";
import {
    Prisma,
    type OrderStatus,
    type PromotionKind,
    type PromotionScope,
} from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { verifyAccessToken, type AccessPayload } from "../auth/jwt.js";
import {
    adminRelativePath,
    isManagerGetAllowed,
    isManagerWriteAllowed,
    isOrgStaff,
    isTeamLeaderAuth,
    isTeamLeaderGetAllowed,
    isTeamLeaderWriteAllowed,
    orderScopeWhere,
    requireAdmin,
    requireOrgStaff,
    sellerScopeWhere,
    teamMemberSellerIds,
    validateManagerAssignment,
} from "../auth/org-roles.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { isPermissionResource } from "../auth/permissions.js";
import { prisma } from "../db.js";
import {
    notifySellerGoalUpdated,
} from "../services/admin-notifications.js";
import {
    AUDIT_ACTION,
    AUDIT_ENTITY,
    auditFromAuth,
    getActorAuditFields,
    writeAuditLog,
} from "../services/audit-log.js";
import { assertAdminPathPlanFeature } from "../services/billing/plan-gate.js";
import { syncSubscriptionSeats } from "../services/billing/seats.js";
import { ensureOrgSubscription } from "../services/billing/subscription.js";
import {
    maybeInactivateStaleCustomersForOrg,
} from "../services/customer-status.js";
import {
    customerBodySchema,
    customerPatchSchema,
    parseCompleteCustomerBody,
    toCustomerPrismaData,
} from "../services/customer-validation.js";
import { nextCustomerCode } from "../services/customer-code.js";
import { buildDistributorInsights } from "../services/distributor-insights.js";
import {
    AccountsPayableError,
    createAccountsPayable,
    deleteAccountsPayable,
    listAccountsPayable,
    updateAccountsPayable,
} from "../services/fiscal/accounts-payable.js";
import {
    createCostCenter,
    createExpenseHistory,
    deleteCostCenter,
    deleteExpenseHistory,
    FiscalLookupError,
    listCostCenters,
    listExpenseHistories,
    updateCostCenter,
    updateExpenseHistory,
} from "../services/fiscal/fiscal-lookups.js";
import {
    createFixedExpense,
    deleteFixedExpense,
    FixedExpenseError,
    listFixedExpenses,
    updateFixedExpense,
} from "../services/fiscal/fixed-expenses.js";
import {
    buildNfeXml,
    buildNfeXmlZip,
    listFiscalOrders,
    NfeXmlError,
} from "../services/fiscal/nfe-xml.js";
import { buildHomeIndicator } from "../services/home-dashboard-indicators.js";
import {
    buildCommissionByOrderReport,
    buildCustomerAbcReport,
    buildCustomerPositivacaoReport,
    buildInvoicedOrdersReport,
    buildPortfolioBySellerReport,
    buildProductPositivacaoByCustomerReport,
    buildTopProductsReport,
} from "../services/catalog-reports.js";
import {
    buildCommissionStatement,
    buildCreditAgingReport,
    buildFiscalOutboundSummary,
    buildFiscalReconciliation,
    buildMarginReport,
    buildSalesScorecard,
    buildStockHealthReport,
    buildVisitEffectiveness,
} from "../services/management-reports.js";
import {
    buildFinancialResult,
    buildFinancialResultPdf,
    type FinancialPeriodGroup,
} from "../services/financial-result-report.js";
import { getOrCreateMorningBrief } from "../services/morning-brief.js";
import { getWebPushPublicKey, notifyUsers } from "../services/notify.js";
import {
    loadOrderForPdf,
    sendOrderPdf80mmReply,
    sendOrderPdfReply,
} from "../services/order-pdf-load.js";
import {
    computeSaleOrder,
    OrderPricingError,
} from "../services/order-pricing.js";
import {
    createSaleOrder,
    replySaleCreateError,
    sellerAllowedProductIds,
} from "../services/create-sale-order.js";
import { checkCustomer, evaluateOrderCredit } from "../services/credit.js";
import { bankingAdminRoutes } from "./banking-admin.js";
import { boletosAdminRoutes } from "./boletos-admin.js";
import { resolveEffectiveUnitPrice } from "../services/price-resolve.js";
import {
    listAssignedProductsInOrg,
    listSellerCatalogProductIds,
} from "../services/seller-product-catalog.js";
import {
    applyOrderStageChange,
    OrderStageError,
} from "../services/order-stage.js";
import {
    ensureDefaultOrderSituations,
    findOrgSituationId,
    normalizeSituationCode,
    situationIdForOrderStatus,
} from "../services/order-situations.js";
import {
    ensureDefaultPurchaseUnits,
    listOrgPurchaseUnits,
} from "../services/purchase-units.js";
import {
    createOrgProfile,
    deleteOrgProfile,
    listOrgProfiles,
    OrgProfileError,
    updateOrgProfile,
} from "../services/org-profiles.js";
import type { AttributeFieldDef } from "../services/product-attributes.js";
import {
    parseCategoryAttributeSchema,
    validateProductAttributes,
} from "../services/product-attributes.js";
import {
    deriveBasePriceFromTablePrices,
    mapProductCadastroPrisma,
    normalizeProductNcm,
    productCadastroFieldsSchema,
    syncProductAttributesNcm,
} from "../services/product-cadastro-schema.js";
import {
    applyStockOnStatusChange, StockError,
    stockErrorPayload
} from "../services/product-stock.js";
import {
    handleRegisterPushDevice,
    handleUnregisterPushDevice,
} from "../services/push-device-routes.js";
import { buildCustomersPdf } from "../services/reports/customers-pdf.js";
import { readExtraParams } from "../services/reports/extra-filters.js";
import { buildOrderItemsPdf } from "../services/reports/order-items-pdf.js";
import { buildOrdersPdf } from "../services/reports/orders-pdf.js";
import { buildRouteRomaneioPdf } from "../services/reports/route-romaneio-pdf.js";
import { buildSalesDetailedPdf } from "../services/reports/sales-pdf.js";
import { buildStockPdf } from "../services/reports/stock-pdf.js";
import { buildStockCountPdf } from "../services/reports/stock-count-pdf.js";
import {
    adminPathToResource,
    buildEffectivePermissionsMatrix,
    canReadEffectiveForUser,
    canWriteEffective,
    canWriteEffectiveForUser,
    setOrgEnabledRoles,
    updateOrgRolePermissions,
} from "../services/role-permissions.js";
import { buildSalesBySupplier } from "../services/sales-by-supplier.js";
import {
    createSalesTeam,
    deleteSalesTeam,
    getSalesTeam,
    listSalesTeams,
    SalesTeamError,
    serializeSalesTeam,
    updateSalesTeam,
} from "../services/sales-teams.js";
import { getSellerLocationHistory } from "../services/seller-location-history.js";
import { registerSellerLocationClient } from "../services/seller-location-ws.js";
import { listAdminSellerLocations } from "../services/seller-locations-admin.js";
import {
    buildGoalScopeKey,
    goalInclude,
    notifyUserIdsForGoal,
} from "../services/seller-monthly-goals.js";
import {
    applyManualStockEntry,
    listExpiringLots,
    listStockMovements,
    listStockProducts,
} from "../services/stock-ledger.js";
import {
    assertSupplierInOrg,
    createSupplier,
    deleteSupplier,
    getSupplier,
    listSuppliers,
    SupplierError,
    updateSupplier,
} from "../services/suppliers.js";
import { buildTeamSalesSummary } from "../services/team-sales-summary.js";
import { decToNum } from "../util/money.js";
import { sendZodError } from "../util/zod-reply.js";
import { expeditionRoutes } from "./expedition.js";
import { fiscalRoutes } from "./fiscal.js";
const idParam = z.object({ id: z.string().min(1) });

const sellerCommissionTypeSchema = z.enum([
  "FIXED",
  "BY_PRODUCT",
  "BY_CATEGORY",
  "BY_SUPPLIER",
]);

const optionalCommissionPercentSchema = z
  .number()
  .min(0)
  .max(100)
  .nullable()
  .optional();

/** Aceita `YYYY-MM-DD` (UTC) ou ISO completo; `start` = início do dia, `end` = fim do dia. */
function parseVisitPeriodDate(
  raw: string | undefined,
  kind: "start" | "end",
): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (day) {
    const y = Number(day[1]);
    const mo = Number(day[2]);
    const d = Number(day[3]);
    if (kind === "start") return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
    return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Identificador estável por organização — apenas dígitos. */
function normalizeCategoryCode(raw: string): string {
  return raw.trim().replace(/\D/g, "");
}

function normalizeRegionCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
}

function normalizeProductBarcode(
  raw: string | undefined | null,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function loadCategoryDefs(
  categoryId: string | null,
  organizationId: string,
): Promise<AttributeFieldDef[]> {
  if (!categoryId) return [];
  const cat = await prisma.productCategory.findFirst({
    where: { id: categoryId, organizationId },
    select: { attributeSchema: true },
  });
  if (!cat?.attributeSchema) return [];
  const p = parseCategoryAttributeSchema(cat.attributeSchema);
  return p.ok ? p.defs : [];
}

const promotionRelationInclude = {
  seller: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  customer: { select: { id: true, name: true, email: true } },
} as const;

type PromotionRow = Prisma.ProductPromotionGetPayload<{
  include: typeof promotionRelationInclude;
}>;

function serializeProductPromotion(row: PromotionRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    productId: row.productId,
    scope: row.scope,
    sellerId: row.sellerId,
    customerId: row.customerId,
    kind: row.kind,
    value: decToNum(row.value),
    label: row.label,
    active: row.active,
    validFrom: row.validFrom?.toISOString() ?? null,
    validTo: row.validTo?.toISOString() ?? null,
    priority: row.priority,
    minQuantity: row.minQuantity,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    seller: row.seller
      ? {
          id: row.seller.id,
          name: row.seller.user.name,
          email: row.seller.user.email,
        }
      : null,
    customer: row.customer
      ? {
          id: row.customer.id,
          name: row.customer.name,
          email: row.customer.email ?? null,
        }
      : null,
  };
}

function assertPromotionCoherence(p: {
  scope: PromotionScope;
  sellerId: string | null | undefined;
  customerId: string | null | undefined;
  kind: PromotionKind;
  value: number;
}): string | null {
  const sellerId = p.sellerId ?? null;
  const customerId = p.customerId ?? null;
  if (p.scope === "PRODUCT_GLOBAL" && (sellerId || customerId)) {
    return "Promoção para todos não deve ter vendedor nem cliente.";
  }
  if (p.scope === "SELLER") {
    if (!sellerId) return "Escolha o vendedor.";
    if (customerId) return "Promoção por vendedor não deve ter cliente.";
  }
  if (p.scope === "CUSTOMER") {
    if (!customerId) return "Escolha o cliente.";
    if (sellerId) return "Promoção por cliente não deve ter vendedor.";
  }
  if (p.kind === "PERCENT_OFF" && (p.value < 0 || p.value > 100)) {
    return "Percentual deve estar entre 0 e 100.";
  }
  if (
    (p.kind === "FIXED_AMOUNT_OFF" || p.kind === "SALE_PRICE") &&
    p.value < 0
  ) {
    return "Valor deve ser maior ou igual a zero.";
  }
  return null;
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook(
    "preHandler",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!requireOrgStaff(reply, req.auth)) return;

      const auth = req.auth!;
      const method = req.method.toUpperCase();
      const routePath = adminRelativePath(req.routeOptions?.url ?? req.url);

      if (
        !(await assertAdminPathPlanFeature(
          reply,
          auth.organizationId,
          routePath,
        ))
      ) {
        return;
      }

      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        if (auth.role === "MANAGER" && isManagerWriteAllowed(routePath)) {
          return;
        }
        if (
          isTeamLeaderAuth(auth) &&
          isTeamLeaderWriteAllowed(routePath)
        ) {
          return;
        }
        if (!requireAdmin(reply, auth)) return;
        return;
      }

      if (routePath === "/seller-locations/ws") return;

      if (auth.role === "MANAGER" && method === "GET") {
        const resource = adminPathToResource(routePath);
        if (resource) {
          const allowed = await canReadEffectiveForUser(
            auth.organizationId,
            auth.sub,
            auth.role,
            resource,
          );
          if (!allowed) {
            return reply
              .status(403)
              .send({ error: "Gestores não têm acesso a este recurso" });
          }
        } else if (!isManagerGetAllowed(routePath)) {
          return reply
            .status(403)
            .send({ error: "Gestores não têm acesso a este recurso" });
        }
      }

      if (
        isTeamLeaderAuth(auth) &&
        method === "GET" &&
        !isTeamLeaderGetAllowed(routePath)
      ) {
        return reply
          .status(403)
          .send({ error: "Líderes de equipe não têm acesso a este recurso" });
      }
    },
  );

  /** Raiz do prefixo `/api/v1/admin` — útil para testar URL base (sem isto, GET aqui dava 404). */
  app.get("/", async () => ({ ok: true, scope: "admin" as const }));

  app.get("/pricing-settings", async (req) => {
    const auth = req.auth!;
    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { defaultMaxSellerDiscountPercent: true, creditPolicy: true },
    });
    if (!org)
      return {
        defaultMaxSellerDiscountPercent: 50,
        creditPolicy: "WARN_ONLY" as const,
      };
    return {
      defaultMaxSellerDiscountPercent: decToNum(
        org.defaultMaxSellerDiscountPercent,
      ),
      creditPolicy: org.creditPolicy,
    };
  });

  app.patch("/pricing-settings", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        defaultMaxSellerDiscountPercent: z.number().min(0).max(100).optional(),
        creditPolicy: z
          .enum(["WARN_ONLY", "BLOCK_ORDER", "REQUIRE_APPROVAL"])
          .optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const data: Prisma.OrganizationUpdateInput = {};
    if (body.data.defaultMaxSellerDiscountPercent !== undefined) {
      data.defaultMaxSellerDiscountPercent =
        body.data.defaultMaxSellerDiscountPercent;
    }
    if (body.data.creditPolicy !== undefined) {
      data.creditPolicy = body.data.creditPolicy;
    }
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: "Nada para atualizar" });
    }

    await prisma.organization.update({
      where: { id: auth.organizationId },
      data,
    });
    return { ok: true };
  });

  /** Regras de sistema da org (sync de pedidos, etc.). */
  app.get("/system-settings", async (req) => {
    const auth = req.auth!;
    const [org, sub] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: auth.organizationId },
        select: {
          orderSyncMode: true,
          sellerShowUnassignedCustomers: true,
          customerRegistrationMode: true,
          sellerCanEditQueuedSales: true,
          autoInactivateCustomersAfterMonths: true,
          homeIndicators: true,
        },
      }),
      ensureOrgSubscription(auth.organizationId),
    ]);
    const homeIndicatorLimit = homeIndicatorLimitForPlan(sub.planId);
    return {
      orderSyncMode: org?.orderSyncMode ?? ("AUTO" as const),
      sellerShowUnassignedCustomers: org?.sellerShowUnassignedCustomers ?? true,
      customerRegistrationMode:
        org?.customerRegistrationMode ?? ("AUTO" as const),
      sellerCanEditQueuedSales: org?.sellerCanEditQueuedSales ?? false,
      autoInactivateCustomersAfterMonths:
        org?.autoInactivateCustomersAfterMonths ?? false,
      homeIndicators: parseHomeIndicators(org?.homeIndicators),
      homeIndicatorLimit,
    };
  });

  app.patch("/system-settings", async (req, reply) => {
    const auth = req.auth!;
    const homeIndicatorKeySchema = z.enum(
      HOME_INDICATOR_KEYS as unknown as [
        HomeIndicatorKey,
        ...HomeIndicatorKey[],
      ],
    );
    const body = z
      .object({
        orderSyncMode: z.enum(["AUTO", "MANUAL"]).optional(),
        sellerShowUnassignedCustomers: z.boolean().optional(),
        customerRegistrationMode: z
          .enum(["AUTO", "REQUIRE_APPROVAL"])
          .optional(),
        sellerCanEditQueuedSales: z.boolean().optional(),
        autoInactivateCustomersAfterMonths: z.boolean().optional(),
        homeIndicators: z
          .array(homeIndicatorKeySchema)
          .min(1, "Selecione pelo menos 1 indicador.")
          .max(HOME_INDICATOR_KEYS.length)
          .optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    if (
      body.data.orderSyncMode === undefined &&
      body.data.sellerShowUnassignedCustomers === undefined &&
      body.data.customerRegistrationMode === undefined &&
      body.data.sellerCanEditQueuedSales === undefined &&
      body.data.autoInactivateCustomersAfterMonths === undefined &&
      body.data.homeIndicators === undefined
    ) {
      return reply.status(400).send({ error: "Nada para atualizar" });
    }

    const sub = await ensureOrgSubscription(auth.organizationId);
    const homeIndicatorLimit = homeIndicatorLimitForPlan(sub.planId);

    let homeIndicators: HomeIndicatorKey[] | undefined;
    if (body.data.homeIndicators !== undefined) {
      const currentOrg = await prisma.organization.findUnique({
        where: { id: auth.organizationId },
        select: { homeIndicators: true },
      });
      const current = parseHomeIndicators(currentOrg?.homeIndicators);
      const next = parseHomeIndicators(body.data.homeIndicators);
      const persistError = persistHomeIndicatorsError({
        next,
        current,
        limit: homeIndicatorLimit,
      });
      if (persistError) {
        return reply.status(400).send({ error: persistError });
      }
      homeIndicators = next;
    }

    const updated = await prisma.organization.update({
      where: { id: auth.organizationId },
      data: {
        ...(body.data.orderSyncMode !== undefined
          ? { orderSyncMode: body.data.orderSyncMode }
          : {}),
        ...(body.data.sellerShowUnassignedCustomers !== undefined
          ? {
              sellerShowUnassignedCustomers:
                body.data.sellerShowUnassignedCustomers,
            }
          : {}),
        ...(body.data.customerRegistrationMode !== undefined
          ? {
              customerRegistrationMode: body.data.customerRegistrationMode,
            }
          : {}),
        ...(body.data.sellerCanEditQueuedSales !== undefined
          ? {
              sellerCanEditQueuedSales: body.data.sellerCanEditQueuedSales,
            }
          : {}),
        ...(body.data.autoInactivateCustomersAfterMonths !== undefined
          ? {
              autoInactivateCustomersAfterMonths:
                body.data.autoInactivateCustomersAfterMonths,
            }
          : {}),
        ...(homeIndicators !== undefined ? { homeIndicators } : {}),
      },
      select: {
        orderSyncMode: true,
        sellerShowUnassignedCustomers: true,
        customerRegistrationMode: true,
        sellerCanEditQueuedSales: true,
        autoInactivateCustomersAfterMonths: true,
        homeIndicators: true,
      },
    });
    return {
      ok: true,
      orderSyncMode: updated.orderSyncMode,
      sellerShowUnassignedCustomers: updated.sellerShowUnassignedCustomers,
      customerRegistrationMode: updated.customerRegistrationMode,
      sellerCanEditQueuedSales: updated.sellerCanEditQueuedSales,
      autoInactivateCustomersAfterMonths:
        updated.autoInactivateCustomersAfterMonths,
      homeIndicators: parseHomeIndicators(updated.homeIndicators),
      homeIndicatorLimit,
    };
  });

  /**
   * Marca / whitelabel da própria organização (`organizationId` do token).
   * UI web: quando existir tela de configurações gerais, pode consumir este PATCH (campos todos opcionais).
   */
  app.patch("/organization/branding", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        displayName: z.string().trim().min(1).max(160).optional(),
        logoUrl: z
          .union([z.string().url(), z.literal(""), z.null()])
          .optional(),
        primaryColor: z
          .union([
            z.string().regex(/^#([0-9A-Fa-f]{6})$/),
            z.literal(""),
            z.null(),
          ])
          .optional(),
        slug: z
          .string()
          .trim()
          .min(2)
          .max(64)
          .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
          .optional()
          .nullable(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const data: Prisma.OrganizationUpdateInput = {};
    if (body.data.displayName !== undefined) {
      data.displayName = body.data.displayName;
    }
    if (body.data.logoUrl !== undefined) {
      data.logoUrl = body.data.logoUrl === "" ? null : body.data.logoUrl;
    }
    if (body.data.primaryColor !== undefined) {
      data.primaryColor =
        body.data.primaryColor === "" ? null : body.data.primaryColor;
    }
    if (body.data.slug !== undefined) {
      data.slug = body.data.slug;
    }
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: "Nada para atualizar" });
    }

    try {
      await prisma.organization.update({
        where: { id: auth.organizationId },
        data,
      });
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code?: string }).code === "P2002"
      ) {
        return reply
          .status(409)
          .send({ error: "Slug já em uso por outra organização" });
      }
      throw e;
    }
    return { ok: true };
  });

  /* --- Regiões (preço por região via cliente + tabela) --- */
  app.get("/regions", async (req) => {
    const auth = req.auth!;
    return prisma.region.findMany({
      where: { organizationId: auth.organizationId },
      orderBy: [{ name: "asc" }],
    });
  });

  app.post("/regions", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({ code: z.string().min(1), name: z.string().min(1) })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    const code = normalizeRegionCode(body.data.code);
    if (!code.length)
      return reply.status(400).send({ error: "Código de região inválido" });
    try {
      return await prisma.region.create({
        data: {
          organizationId: auth.organizationId,
          code,
          name: body.data.name.trim(),
        },
      });
    } catch {
      return reply
        .status(409)
        .send({ error: "Já existe região com esse código" });
    }
  });

  app.patch("/regions/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    const existing = await prisma.region.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    const code =
      body.data.code !== undefined
        ? normalizeRegionCode(body.data.code)
        : undefined;
    if (code !== undefined && !code.length) {
      return reply.status(400).send({ error: "Código de região inválido" });
    }
    try {
      return await prisma.region.update({
        where: { id },
        data: {
          code: code ?? undefined,
          name: body.data.name?.trim(),
        },
      });
    } catch {
      return reply
        .status(409)
        .send({ error: "Já existe região com esse código" });
    }
  });

  app.delete("/regions/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.region.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.region.delete({ where: { id } });
    return reply.status(204).send();
  });

  /* --- Tabelas de preço --- */
  app.get("/price-tables", async (req) => {
    const auth = req.auth!;
    return prisma.priceTable.findMany({
      where: { organizationId: auth.organizationId },
      include: {
        items: { include: { product: true } },
        customer: { select: { id: true, name: true } },
        seller: { include: { user: { select: { name: true } } } },
        region: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/price-tables", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        name: z.string().min(1),
        validFrom: z.string().datetime().optional(),
        validTo: z.string().datetime().optional(),
        priority: z.number().int().optional(),
        customerId: z.string().nullable().optional(),
        sellerId: z.string().nullable().optional(),
        regionId: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const d = body.data;
    if (d.customerId) {
      const c = await prisma.customer.findFirst({
        where: { id: d.customerId, organizationId: auth.organizationId },
      });
      if (!c)
        return reply
          .status(400)
          .send({ error: "Cliente inválido para escopo da tabela" });
    }
    if (d.sellerId) {
      const s = await prisma.seller.findFirst({
        where: { id: d.sellerId, organizationId: auth.organizationId },
      });
      if (!s)
        return reply
          .status(400)
          .send({ error: "Vendedor inválido para escopo da tabela" });
    }
    if (d.regionId) {
      const r = await prisma.region.findFirst({
        where: { id: d.regionId, organizationId: auth.organizationId },
      });
      if (!r)
        return reply
          .status(400)
          .send({ error: "Região inválida para escopo da tabela" });
    }

    const created = await prisma.priceTable.create({
      data: {
        name: d.name,
        organizationId: auth.organizationId,
        validFrom: d.validFrom ? new Date(d.validFrom) : null,
        validTo: d.validTo ? new Date(d.validTo) : null,
        priority: d.priority ?? 0,
        customerId: d.customerId ?? null,
        sellerId: d.sellerId ?? null,
        regionId: d.regionId ?? null,
      },
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.CREATE,
      entityType: AUDIT_ENTITY.PriceTable,
      entityId: created.id,
      metadata: { name: created.name },
    });
    return created;
  });

  app.patch("/price-tables/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        validFrom: z.string().datetime().nullable().optional(),
        validTo: z.string().datetime().nullable().optional(),
        priority: z.number().int().optional(),
        customerId: z.string().nullable().optional(),
        sellerId: z.string().nullable().optional(),
        regionId: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.priceTable.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    const d = body.data;
    if (d.customerId) {
      const c = await prisma.customer.findFirst({
        where: { id: d.customerId, organizationId: auth.organizationId },
      });
      if (!c)
        return reply
          .status(400)
          .send({ error: "Cliente inválido para escopo da tabela" });
    }
    if (d.sellerId) {
      const s = await prisma.seller.findFirst({
        where: { id: d.sellerId, organizationId: auth.organizationId },
      });
      if (!s)
        return reply
          .status(400)
          .send({ error: "Vendedor inválido para escopo da tabela" });
    }
    if (d.regionId) {
      const r = await prisma.region.findFirst({
        where: { id: d.regionId, organizationId: auth.organizationId },
      });
      if (!r)
        return reply
          .status(400)
          .send({ error: "Região inválida para escopo da tabela" });
    }

    const updated = await prisma.priceTable.update({
      where: { id },
      data: {
        name: d.name ?? undefined,
        validFrom:
          d.validFrom === undefined
            ? undefined
            : d.validFrom
              ? new Date(d.validFrom)
              : null,
        validTo:
          d.validTo === undefined
            ? undefined
            : d.validTo
              ? new Date(d.validTo)
              : null,
        priority: d.priority ?? undefined,
        customerId: d.customerId === undefined ? undefined : d.customerId,
        sellerId: d.sellerId === undefined ? undefined : d.sellerId,
        regionId: d.regionId === undefined ? undefined : d.regionId,
      },
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.UPDATE,
      entityType: AUDIT_ENTITY.PriceTable,
      entityId: id,
      metadata: { fields: Object.keys(body.data) },
    });
    return updated;
  });

  app.delete("/price-tables/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.priceTable.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.priceTable.delete({ where: { id } });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.DELETE,
      entityType: AUDIT_ENTITY.PriceTable,
      entityId: id,
      metadata: { name: existing.name },
    });
    return reply.status(204).send();
  });

  app.post("/price-tables/:id/items", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        productId: z.string(),
        price: z.number().positive(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const pt = await prisma.priceTable.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!pt) return reply.status(404).send({ error: "Tabela não encontrada" });
    const prod = await prisma.product.findFirst({
      where: { id: body.data.productId, organizationId: auth.organizationId },
    });
    if (!prod) return reply.status(400).send({ error: "Produto inválido" });

    return prisma.priceTableItem.upsert({
      where: {
        priceTableId_productId: {
          priceTableId: id,
          productId: body.data.productId,
        },
      },
      create: {
        priceTableId: id,
        productId: body.data.productId,
        price: body.data.price,
      },
      update: { price: body.data.price },
    });
  });

  app.delete("/price-tables/:tableId/items/:productId", async (req, reply) => {
    const auth = req.auth!;
    const p = z
      .object({ tableId: z.string(), productId: z.string() })
      .parse(req.params);
    const pt = await prisma.priceTable.findFirst({
      where: { id: p.tableId, organizationId: auth.organizationId },
    });
    if (!pt) return reply.status(404).send({ error: "Tabela não encontrada" });
    await prisma.priceTableItem.deleteMany({
      where: { priceTableId: p.tableId, productId: p.productId },
    });
    return reply.status(204).send();
  });

  /* --- Categorias de produto (lookup / “enum” por organização) --- */
  app.get("/product-categories", async (req) => {
    const auth = req.auth!;
    return prisma.productCategory.findMany({
      where: { organizationId: auth.organizationId },
      orderBy: [{ code: "asc" }],
    });
  });

  app.post("/product-categories", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        attributeSchema: z.any().optional(),
        commissionPercent: optionalCommissionPercentSchema,
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const code = normalizeCategoryCode(body.data.code);
    if (!code.length)
      return reply
        .status(400)
        .send({ error: "Código inválido (use apenas números)" });

    let schemaValue: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
    if (body.data.attributeSchema !== undefined) {
      const parsed = parseCategoryAttributeSchema(body.data.attributeSchema);
      if (!parsed.ok) return reply.status(400).send({ error: parsed.error });
      schemaValue =
        parsed.defs.length > 0
          ? (parsed.defs as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull;
    }

    try {
      return await prisma.productCategory.create({
        data: {
          organizationId: auth.organizationId,
          code,
          name: body.data.name.trim(),
          ...(body.data.commissionPercent !== undefined
            ? { commissionPercent: body.data.commissionPercent }
            : {}),
          ...(schemaValue !== undefined
            ? { attributeSchema: schemaValue }
            : {}),
        },
      });
    } catch {
      return reply
        .status(409)
        .send({ error: "Já existe categoria com esse código" });
    }
  });

  app.patch("/product-categories/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        code: z.string().min(1).optional(),
        attributeSchema: z.any().nullable().optional(),
        commissionPercent: optionalCommissionPercentSchema,
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.productCategory.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    if (
      body.data.name === undefined &&
      body.data.code === undefined &&
      body.data.attributeSchema === undefined &&
      body.data.commissionPercent === undefined
    ) {
      return reply.status(400).send({
        error:
          "Informe nome, código, comissão ou campos dinâmicos para atualizar",
      });
    }

    const code =
      body.data.code !== undefined
        ? normalizeCategoryCode(body.data.code)
        : undefined;
    if (code !== undefined && !code.length) {
      return reply
        .status(400)
        .send({ error: "Código inválido (use apenas números)" });
    }

    let schemaPatch: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
    if (body.data.attributeSchema !== undefined) {
      if (body.data.attributeSchema === null) {
        schemaPatch = Prisma.JsonNull;
      } else {
        const parsed = parseCategoryAttributeSchema(body.data.attributeSchema);
        if (!parsed.ok) return reply.status(400).send({ error: parsed.error });
        schemaPatch =
          parsed.defs.length > 0
            ? (parsed.defs as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull;
      }
    }

    try {
      return await prisma.productCategory.update({
        where: { id },
        data: {
          name: body.data.name?.trim(),
          ...(code !== undefined ? { code } : {}),
          ...(body.data.commissionPercent !== undefined
            ? { commissionPercent: body.data.commissionPercent }
            : {}),
          ...(schemaPatch !== undefined
            ? { attributeSchema: schemaPatch }
            : {}),
        },
      });
    } catch {
      return reply
        .status(409)
        .send({ error: "Já existe categoria com esse código" });
    }
  });

  app.delete("/product-categories/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.productCategory.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.productCategory.delete({ where: { id } });
    return reply.status(204).send();
  });

  /* --- Unidades de compra (lookup por organização) --- */
  app.get("/purchase-units", async (req) => {
    const auth = req.auth!;
    return listOrgPurchaseUnits(auth.organizationId);
  });

  app.post("/purchase-units", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1).max(80),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const code = normalizePurchaseUnitCode(body.data.code);
    if (!code.length)
      return reply.status(400).send({ error: "Código é obrigatório" });

    await ensureDefaultPurchaseUnits(auth.organizationId);

    try {
      return await prisma.purchaseUnit.create({
        data: {
          organizationId: auth.organizationId,
          code,
          name: body.data.name.trim(),
          sortOrder: 100,
          isSystem: false,
        },
      });
    } catch {
      return reply
        .status(409)
        .send({ error: "Já existe unidade com esse código" });
    }
  });

  /* --- Condições de pagamento --- */
  app.get("/payment-conditions", async (req) => {
    const auth = req.auth!;
    return prisma.paymentCondition.findMany({
      where: { organizationId: auth.organizationId },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
  });

  app.post("/payment-conditions", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        days: z.number().int().min(0).max(3650).optional(),
        installmentDays: z.array(z.number().int().min(1).max(3650)).max(48).optional(),
        active: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const code = body.data.code.trim();
    if (!code.length)
      return reply.status(400).send({ error: "Código é obrigatório" });

    try {
      return await prisma.paymentCondition.create({
        data: {
          organizationId: auth.organizationId,
          code,
          name: body.data.name.trim(),
          days: body.data.days ?? 0,
          installmentDays: body.data.installmentDays ?? [],
          active: body.data.active ?? true,
          sortOrder: body.data.sortOrder ?? 0,
        },
      });
    } catch {
      return reply
        .status(409)
        .send({ error: "Já existe condição com esse código" });
    }
  });

  app.patch("/payment-conditions/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        days: z.number().int().min(0).max(3650).optional(),
        installmentDays: z.array(z.number().int().min(1).max(3650)).max(48).optional(),
        active: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.paymentCondition.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    if (
      body.data.code === undefined &&
      body.data.name === undefined &&
      body.data.days === undefined &&
      body.data.installmentDays === undefined &&
      body.data.active === undefined &&
      body.data.sortOrder === undefined
    ) {
      return reply.status(400).send({
        error: "Informe ao menos um campo para atualizar",
      });
    }

    try {
      return await prisma.paymentCondition.update({
        where: { id },
        data: {
          ...(body.data.code !== undefined
            ? { code: body.data.code.trim() }
            : {}),
          ...(body.data.name !== undefined
            ? { name: body.data.name.trim() }
            : {}),
          ...(body.data.days !== undefined ? { days: body.data.days } : {}),
          ...(body.data.installmentDays !== undefined
            ? { installmentDays: body.data.installmentDays }
            : {}),
          ...(body.data.active !== undefined
            ? { active: body.data.active }
            : {}),
          ...(body.data.sortOrder !== undefined
            ? { sortOrder: body.data.sortOrder }
            : {}),
        },
      });
    } catch {
      return reply
        .status(409)
        .send({ error: "Já existe condição com esse código" });
    }
  });

  app.delete("/payment-conditions/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.paymentCondition.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.paymentCondition.delete({ where: { id } });
    return reply.status(204).send();
  });

  /* --- Fluxo do pedido (etapas: sistema + org) --- */
  app.get("/order-situations", async (req) => {
    const auth = req.auth!;
    await ensureDefaultOrderSituations(auth.organizationId);
    return prisma.orderSituation.findMany({
      where: { organizationId: auth.organizationId },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
  });

  app.post("/order-situations", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        code: z.string().min(1),
        name: z.string().min(1),
        active: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
        mapsToCancel: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const code = normalizeSituationCode(body.data.code);
    if (!code.length)
      return reply.status(400).send({ error: "Código é obrigatório" });
    if (isReservedSituationCode(code)) {
      return reply.status(400).send({
        error: "Código reservado do sistema. Escolha outro nome.",
      });
    }

    await ensureDefaultOrderSituations(auth.organizationId);

    try {
      return await prisma.orderSituation.create({
        data: {
          organizationId: auth.organizationId,
          code,
          name: body.data.name.trim(),
          active: body.data.active ?? true,
          sortOrder: body.data.sortOrder ?? 0,
          mapsToCancel: body.data.mapsToCancel ?? false,
          isSystem: false,
        },
      });
    } catch {
      return reply
        .status(409)
        .send({ error: "Já existe etapa com esse código" });
    }
  });

  app.patch("/order-situations/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        active: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
        mapsToCancel: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.orderSituation.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    if (
      body.data.code === undefined &&
      body.data.name === undefined &&
      body.data.active === undefined &&
      body.data.sortOrder === undefined &&
      body.data.mapsToCancel === undefined
    ) {
      return reply.status(400).send({
        error: "Informe ao menos um campo para atualizar",
      });
    }

    const nextCode =
      body.data.code !== undefined
        ? normalizeSituationCode(body.data.code)
        : undefined;
    if (nextCode !== undefined && !nextCode.length) {
      return reply.status(400).send({ error: "Código é obrigatório" });
    }
    if (
      existing.isSystem &&
      nextCode !== undefined &&
      nextCode !== existing.code
    ) {
      return reply.status(400).send({
        error: "Código de etapa do sistema não pode ser alterado",
      });
    }
    if (
      existing.isSystem &&
      isLifecycleSituationCode(existing.code) &&
      body.data.active === false
    ) {
      return reply.status(400).send({
        error:
          "Etapas de sistema (rascunho, crédito, entregue e cancelado) não podem ser desativadas",
      });
    }
    if (
      existing.isSystem &&
      body.data.mapsToCancel !== undefined &&
      body.data.mapsToCancel !== existing.mapsToCancel
    ) {
      return reply.status(400).send({
        error: "Cancelamento de etapa do sistema não pode ser alterado",
      });
    }

    try {
      return await prisma.orderSituation.update({
        where: { id },
        data: {
          ...(nextCode !== undefined ? { code: nextCode } : {}),
          ...(body.data.name !== undefined
            ? { name: body.data.name.trim() }
            : {}),
          ...(body.data.active !== undefined
            ? { active: body.data.active }
            : {}),
          ...(body.data.sortOrder !== undefined
            ? { sortOrder: body.data.sortOrder }
            : {}),
          ...(body.data.mapsToCancel !== undefined
            ? { mapsToCancel: body.data.mapsToCancel }
            : {}),
        },
      });
    } catch {
      return reply
        .status(409)
        .send({ error: "Já existe etapa com esse código" });
    }
  });

  app.delete("/order-situations/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.orderSituation.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    if (isLifecycleSituationCode(existing.code)) {
      return reply.status(400).send({
        error:
          "Rascunho, aguardando crédito, entregue e cancelado não podem ser excluídos.",
      });
    }
    const inUse = await prisma.order.count({
      where: { organizationId: auth.organizationId, situationId: id },
    });
    if (inUse > 0) {
      return reply.status(400).send({
        error: "Há pedidos nesta etapa. Mova-os antes de excluir.",
      });
    }
    await prisma.orderSituation.delete({ where: { id } });
    return reply.status(204).send();
  });

  /* --- Produtos --- */
  const productRelationsInclude = {
    category: {
      select: { id: true, code: true, name: true, attributeSchema: true },
    },
    supplier: {
      select: {
        id: true,
        code: true,
        tradeName: true,
        legalName: true,
        cnpj: true,
      },
    },
    priceTableItems: {
      select: {
        id: true,
        priceTableId: true,
        price: true,
        priceTable: { select: { id: true, name: true } },
      },
    },
  } as const;

  /* --- Fornecedores --- */
  app.get("/suppliers", async (req) => {
    const auth = req.auth!;
    return listSuppliers(auth.organizationId);
  });

  app.get("/suppliers/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const supplier = await getSupplier(auth.organizationId, id);
    if (!supplier)
      return reply.status(404).send({ error: "Fornecedor não encontrado" });
    return supplier;
  });

  app.post("/suppliers", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        code: z.string().min(1),
        legalName: z.string().min(1),
        cnpj: z.string().min(1),
        tradeName: z.string().min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    try {
      const created = await createSupplier(auth.organizationId, body.data);
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.CREATE,
        entityType: AUDIT_ENTITY.Supplier,
        entityId: created.id,
        metadata: { tradeName: created.tradeName, cnpj: created.cnpj },
      });
      return created;
    } catch (e) {
      if (e instanceof SupplierError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.patch("/suppliers/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        code: z.string().min(1).optional(),
        legalName: z.string().min(1).optional(),
        cnpj: z.string().min(1).optional(),
        tradeName: z.string().min(1).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    try {
      const supplier = await updateSupplier(auth.organizationId, id, body.data);
      if (!supplier)
        return reply.status(404).send({ error: "Fornecedor não encontrado" });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.UPDATE,
        entityType: AUDIT_ENTITY.Supplier,
        entityId: id,
        metadata: { fields: Object.keys(body.data) },
      });
      return supplier;
    } catch (e) {
      if (e instanceof SupplierError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.delete("/suppliers/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    try {
      const ok = await deleteSupplier(auth.organizationId, id);
      if (!ok)
        return reply.status(404).send({ error: "Fornecedor não encontrado" });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.DELETE,
        entityType: AUDIT_ENTITY.Supplier,
        entityId: id,
      });
      return reply.status(204).send();
    } catch (e) {
      if (e instanceof SupplierError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  /* --- Fiscal: centros de custo, históricos, despesas fixas, AP, XML --- */
  app.get("/cost-centers", async (req) => {
    return listCostCenters(req.auth!.organizationId);
  });

  app.post("/cost-centers", async (req, reply) => {
    const body = z
      .object({ code: z.string().min(1), name: z.string().min(1) })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    try {
      return await createCostCenter(req.auth!.organizationId, body.data);
    } catch (e) {
      if (e instanceof FiscalLookupError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.patch("/cost-centers/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    try {
      const row = await updateCostCenter(
        req.auth!.organizationId,
        id,
        body.data,
      );
      if (!row)
        return reply
          .status(404)
          .send({ error: "Centro de custo não encontrado" });
      return row;
    } catch (e) {
      if (e instanceof FiscalLookupError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.delete("/cost-centers/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const ok = await deleteCostCenter(req.auth!.organizationId, id);
    if (!ok)
      return reply
        .status(404)
        .send({ error: "Centro de custo não encontrado" });
    return reply.status(204).send();
  });

  app.get("/expense-histories", async (req) => {
    return listExpenseHistories(req.auth!.organizationId);
  });

  app.post("/expense-histories", async (req, reply) => {
    const body = z
      .object({ code: z.string().min(1), description: z.string().min(1) })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    try {
      return await createExpenseHistory(req.auth!.organizationId, body.data);
    } catch (e) {
      if (e instanceof FiscalLookupError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.patch("/expense-histories/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        code: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    try {
      const row = await updateExpenseHistory(
        req.auth!.organizationId,
        id,
        body.data,
      );
      if (!row)
        return reply.status(404).send({ error: "Histórico não encontrado" });
      return row;
    } catch (e) {
      if (e instanceof FiscalLookupError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.delete("/expense-histories/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const ok = await deleteExpenseHistory(req.auth!.organizationId, id);
    if (!ok)
      return reply.status(404).send({ error: "Histórico não encontrado" });
    return reply.status(204).send();
  });

  app.get("/fixed-expenses", async (req) => {
    return listFixedExpenses(req.auth!.organizationId);
  });

  app.post("/fixed-expenses", async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(1),
        amount: z.number().positive(),
        dayOfMonth: z.number().int().min(1).max(28),
        supplierId: z.string().nullable().optional(),
        costCenterId: z.string().nullable().optional(),
        historyId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        competenceLabel: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    try {
      return await createFixedExpense(req.auth!.organizationId, body.data);
    } catch (e) {
      if (e instanceof FixedExpenseError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.patch("/fixed-expenses/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        amount: z.number().positive().optional(),
        dayOfMonth: z.number().int().min(1).max(28).optional(),
        supplierId: z.string().nullable().optional(),
        costCenterId: z.string().nullable().optional(),
        historyId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        competenceLabel: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    try {
      const row = await updateFixedExpense(
        req.auth!.organizationId,
        id,
        body.data,
      );
      if (!row)
        return reply.status(404).send({ error: "Despesa fixa não encontrada" });
      return row;
    } catch (e) {
      if (e instanceof FixedExpenseError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.delete("/fixed-expenses/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const ok = await deleteFixedExpense(req.auth!.organizationId, id);
    if (!ok)
      return reply.status(404).send({ error: "Despesa fixa não encontrada" });
    return reply.status(204).send();
  });

  const apStatusSchema = z.enum(["AUTHORIZED", "PENDING", "PAID", "CANCELLED"]);

  app.get("/accounts-payable", async (req, reply) => {
    const q = z
      .object({
        status: apStatusSchema.optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        supplierId: z.string().optional(),
      })
      .safeParse(req.query);
    if (!q.success)
      return reply.status(400).send({ error: "Filtros inválidos" });
    try {
      return await listAccountsPayable(req.auth!.organizationId, q.data);
    } catch (e) {
      if (e instanceof AccountsPayableError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  const accountsPayableBody = z.object({
    docNumber: z.string().min(1),
    supplierId: z.string().min(1),
    issueDate: z.string().min(1),
    dueDate: z.string().min(1),
    competence: z.string().min(1),
    amount: z.number().positive(),
    status: apStatusSchema.optional(),
    historyId: z.string().nullable().optional(),
    costCenterId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  });

  app.post("/accounts-payable", async (req, reply) => {
    const body = accountsPayableBody.safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    try {
      return await createAccountsPayable(req.auth!.organizationId, body.data);
    } catch (e) {
      if (e instanceof AccountsPayableError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.patch("/accounts-payable/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = accountsPayableBody.partial().safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    try {
      const row = await updateAccountsPayable(
        req.auth!.organizationId,
        id,
        body.data,
      );
      if (!row)
        return reply.status(404).send({ error: "Lançamento não encontrado" });
      return row;
    } catch (e) {
      if (e instanceof AccountsPayableError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.delete("/accounts-payable/:id", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const ok = await deleteAccountsPayable(req.auth!.organizationId, id);
    if (!ok)
      return reply.status(404).send({ error: "Lançamento não encontrado" });
    return reply.status(204).send();
  });

  app.get("/fiscal/orders", async (req, reply) => {
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .safeParse(req.query);
    if (!q.success)
      return reply.status(400).send({ error: "Filtros inválidos" });
    return listFiscalOrders(req.auth!.organizationId, q.data);
  });

  app.get("/fiscal/orders/nfe.zip", async (req, reply) => {
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .safeParse(req.query);
    if (!q.success)
      return reply.status(400).send({ error: "Filtros inválidos" });
    try {
      const { zip, filename } = await buildNfeXmlZip(
        req.auth!.organizationId,
        q.data,
      );
      return reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(zip);
    } catch (e) {
      if (e instanceof NfeXmlError) {
        return reply.status(400).send({ error: e.message });
      }
      throw e;
    }
  });

  app.get("/orders/:id/nfe.xml", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    try {
      const { xml, filename } = await buildNfeXml(req.auth!.organizationId, id);
      return reply
        .header("Content-Type", "application/xml; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(xml);
    } catch (e) {
      if (e instanceof NfeXmlError) {
        const status = e.message.includes("não encontrado") ? 404 : 400;
        return reply.status(status).send({ error: e.message });
      }
      throw e;
    }
  });

  app.get("/products", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        supplierId: z.string().optional(),
        categoryId: z.string().optional(),
        q: z.string().optional(),
      })
      .safeParse(req.query);
    const filters = q.success ? q.data : {};
    const where: Prisma.ProductWhereInput = {
      organizationId: auth.organizationId,
    };
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.q?.trim()) {
      const text = filters.q.trim();
      where.OR = [
        { name: { contains: text, mode: "insensitive" } },
        { sku: { contains: text, mode: "insensitive" } },
        { barcode: { contains: text, mode: "insensitive" } },
      ];
    }
    return prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      include: productRelationsInclude,
    });
  });

  /* --- Estoque --- */
  app.get("/stock", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        supplierId: z.string().optional(),
        categoryId: z.string().optional(),
        q: z.string().optional(),
      })
      .safeParse(req.query);
    const filters = q.success ? q.data : {};
    return listStockProducts({
      organizationId: auth.organizationId,
      supplierId: filters.supplierId,
      categoryId: filters.categoryId,
      q: filters.q,
    });
  });

  app.get("/stock/expiring", async (req) => {
    const auth = req.auth!;
    return listExpiringLots(auth.organizationId);
  });

  app.get("/stock/movements", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        productId: z.string().optional(),
        type: z
          .enum(["MANUAL_IN", "MANUAL_OUT", "ADJUST", "SALE", "SALE_REVERSAL"])
          .optional(),
        take: z.coerce.number().int().positive().optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
      })
      .safeParse(req.query);
    const filters = q.success ? q.data : {};
    return listStockMovements({
      organizationId: auth.organizationId,
      productId: filters.productId,
      type: filters.type,
      take: filters.take,
      skip: filters.skip,
    });
  });

  app.post("/stock/entries", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        productId: z.string().min(1),
        type: z.enum(["MANUAL_IN", "MANUAL_OUT", "ADJUST"]),
        qty: z.number().int().positive(),
        lotCode: z.string().min(1).max(80),
        expiresAt: z.string().min(1),
        reason: z.string().max(500).optional(),
        password: z.string().min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const user = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: { passwordHash: true, matricula: true },
    });
    if (!user) return reply.status(401).send({ error: "Não autorizado" });

    const ok = await verifyPassword(body.data.password, user.passwordHash);
    if (!ok) return reply.status(401).send({ error: "Senha incorreta" });

    const expiresAt = new Date(body.data.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      return reply.status(400).send({ error: "Validade inválida" });
    }

    try {
      const result = await applyManualStockEntry({
        organizationId: auth.organizationId,
        userId: auth.sub,
        userMatricula: user.matricula,
        productId: body.data.productId,
        type: body.data.type,
        qty: body.data.qty,
        lotCode: body.data.lotCode,
        expiresAt,
        reason: body.data.reason,
      });
      return result;
    } catch (e) {
      if (e instanceof StockError)
        return reply.status(400).send(stockErrorPayload(e));
      throw e;
    }
  });

  app.get("/permissions", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    return buildEffectivePermissionsMatrix(auth.organizationId);
  });

  app.put("/permissions", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;

    const body = z
      .object({
        updates: z
          .array(
            z.object({
              role: z.string().min(1),
              resource: z.string().min(1),
              level: z.enum(["none", "read", "write"]),
            }),
          )
          .optional(),
        enabledRoles: z
          .array(z.enum(["ADMIN", "MANAGER", "SELLER", "SUPERVISOR"]))
          .optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return sendZodError(reply, body.error, req);
    }

    if (
      body.data.enabledRoles === undefined &&
      (body.data.updates === undefined || body.data.updates.length === 0)
    ) {
      return reply
        .status(400)
        .send({ error: "Informe updates e/ou enabledRoles" });
    }

    if (body.data.enabledRoles !== undefined) {
      await setOrgEnabledRoles(auth.organizationId, body.data.enabledRoles);
    }

    let matrix;
    if (body.data.updates && body.data.updates.length > 0) {
      const updates = body.data.updates.filter((u) =>
        isPermissionResource(u.resource),
      );
      if (updates.length === 0 && body.data.enabledRoles === undefined) {
        return reply.status(400).send({ error: "Nenhum recurso válido" });
      }
      matrix = await updateOrgRolePermissions(
        auth.organizationId,
        updates.map((u) => ({
          role: u.role,
          resource:
            u.resource as import("../auth/permissions.js").PermissionResource,
          level: u.level,
        })),
      );
    } else {
      matrix = await buildEffectivePermissionsMatrix(auth.organizationId);
    }

    await auditFromAuth(auth, {
      action: AUDIT_ACTION.PERMISSIONS_UPDATE,
      entityType: AUDIT_ENTITY.OrganizationRolePermission,
      entityId: auth.organizationId,
      metadata: {
        updateCount: body.data.updates?.length ?? 0,
        enabledRoles: body.data.enabledRoles,
      },
    });

    return matrix;
  });

  app.get("/profiles", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    return listOrgProfiles(auth.organizationId);
  });

  app.post("/profiles", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;

    const body = z
      .object({
        name: z.string().trim().min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
      return sendZodError(reply, body.error, req);
    }

    try {
      const created = await createOrgProfile(auth.organizationId, body.data);
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.CREATE,
        entityType: AUDIT_ENTITY.OrganizationRolePermission,
        entityId: created.id,
        metadata: {
          kind: "OrganizationProfile",
          name: created.name,
          key: created.key,
        },
      });
      return created;
    } catch (e) {
      if (e instanceof OrgProfileError) {
        return reply.status(400).send({ error: e.message });
      }
      throw e;
    }
  });

  app.patch("/profiles/:id", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);

    const body = z
      .object({
        name: z.string().trim().min(1).optional(),
        enabled: z.boolean().optional(),
        hasSellerProfile: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return sendZodError(reply, body.error, req);
    }
    if (
      body.data.name === undefined &&
      body.data.enabled === undefined &&
      body.data.hasSellerProfile === undefined
    ) {
      return reply.status(400).send({ error: "Nenhuma alteração informada" });
    }

    try {
      const updated = await updateOrgProfile(
        auth.organizationId,
        id,
        body.data,
      );
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.UPDATE,
        entityType: AUDIT_ENTITY.OrganizationRolePermission,
        entityId: id,
        metadata: {
          kind: "OrganizationProfile",
          fields: Object.keys(body.data),
        },
      });
      return updated;
    } catch (e) {
      if (e instanceof OrgProfileError) {
        return reply.status(400).send({ error: e.message });
      }
      throw e;
    }
  });

  app.delete("/profiles/:id", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);

    try {
      await deleteOrgProfile(auth.organizationId, id);
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.DELETE,
        entityType: AUDIT_ENTITY.OrganizationRolePermission,
        entityId: id,
        metadata: { kind: "OrganizationProfile" },
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof OrgProfileError) {
        return reply.status(400).send({ error: e.message });
      }
      throw e;
    }
  });

  app.get("/audit-logs", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        take: z.coerce.number().int().positive().optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        action: z.string().optional(),
        matricula: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .safeParse(req.query);
    const take = Math.min(q.success ? (q.data.take ?? 50) : 50, 200);
    const skip = q.success ? (q.data.skip ?? 0) : 0;
    const where: Prisma.AuditLogWhereInput = {
      organizationId: auth.organizationId,
    };
    if (q.success) {
      if (q.data.entityType) where.entityType = q.data.entityType;
      if (q.data.entityId) where.entityId = q.data.entityId;
      if (q.data.action) where.action = q.data.action;
      if (q.data.matricula?.trim()) {
        where.userMatricula = {
          contains: q.data.matricula.trim(),
          mode: "insensitive",
        };
      }
      const createdAt: Prisma.DateTimeFilter = {};
      if (q.data.from?.trim()) {
        const from = new Date(q.data.from);
        if (!Number.isNaN(from.getTime())) createdAt.gte = from;
      }
      if (q.data.to?.trim()) {
        const to = new Date(q.data.to);
        if (!Number.isNaN(to.getTime())) createdAt.lte = to;
      }
      if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
    }
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: {
          user: {
            select: { id: true, name: true, email: true, matricula: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total, take, skip };
  });

  app.get("/products/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const p = await prisma.product.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: productRelationsInclude,
    });
    if (!p) return reply.status(404).send({ error: "Não encontrado" });
    return p;
  });

  app.post("/products", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        name: z.string().min(1),
        sku: z.string().nullable().optional(),
        barcode: z.string().max(80).nullable().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z
          .union([z.string().max(2048), z.literal("")])
          .nullable()
          .optional(),
        basePrice: z.number().nonnegative().optional(),
        categoryId: z.string().min(1),
        supplierId: z.string().min(1),
        attributes: z.record(z.string(), z.unknown()).optional(),
        maxSellerDiscountPercent: z
          .number()
          .min(0)
          .max(100)
          .nullable()
          .optional(),
        minSaleUnitPrice: z.number().nonnegative().nullable().optional(),
        commissionPercent: optionalCommissionPercentSchema,
        ncmId: z.string().nullable().optional(),
        fiscalOrigin: z.number().int().min(0).max(8).nullable().optional(),
        fiscalGtin: z.string().nullable().optional(),
        fiscalUnit: z.string().nullable().optional(),
        fiscalCest: z.string().nullable().optional(),
        fiscalDescription: z.string().nullable().optional(),
        outboundOperationId: z.string().nullable().optional(),
        stockQty: z.number().int().min(0).optional(),
        blockSaleWhenOutOfStock: z.boolean().optional(),
        priceTablePrices: z
          .array(
            z.object({
              priceTableId: z.string().min(1),
              price: z.number().nonnegative(),
            }),
          )
          .min(1),
        ...productCadastroFieldsSchema,
      })
      .safeParse(req.body);
    if (!body.success) {
      return sendZodError(reply, body.error, req);
    }

    const resolvedCatId = body.data.categoryId;

    const categoryOk = await prisma.productCategory.findFirst({
      where: { id: resolvedCatId, organizationId: auth.organizationId },
    });
    if (!categoryOk)
      return reply.status(400).send({ error: "Grupo de produtos inválido" });

    const supplierOk = await assertSupplierInOrg(
      auth.organizationId,
      body.data.supplierId,
    );
    if (!supplierOk)
      return reply.status(400).send({ error: "Fornecedor inválido" });

    const createPriceRows = body.data.priceTablePrices;
    const resolvedBasePrice =
      body.data.basePrice ??
      deriveBasePriceFromTablePrices(createPriceRows.map((row) => row.price));

    if (createPriceRows.length > 0) {
      const tableIds = createPriceRows.map((p) => p.priceTableId);
      const tables = await prisma.priceTable.findMany({
        where: {
          id: { in: tableIds },
          organizationId: auth.organizationId,
        },
        select: { id: true },
      });
      const okIds = new Set(tables.map((t) => t.id));
      const invalid = tableIds.filter((tid) => !okIds.has(tid));
      if (invalid.length > 0) {
        return reply.status(400).send({ error: "Tabela de preço inválida" });
      }
    }

    const defs = await loadCategoryDefs(resolvedCatId, auth.organizationId);
    const attrsRaw = body.data.attributes ?? {};
    const validated = validateProductAttributes(attrsRaw, defs);
    if (!validated.ok)
      return reply.status(400).send({ error: validated.error });

    const ncmCol =
      body.data.ncm === undefined
        ? undefined
        : normalizeProductNcm(body.data.ncm);
    const attrsSynced = syncProductAttributesNcm(
      validated.value,
      ncmCol ?? null,
    );

    try {
      const created = await prisma.product.create({
        data: {
          name: body.data.name,
          sku: body.data.sku ?? undefined,
          barcode: normalizeProductBarcode(body.data.barcode) ?? undefined,
          description: body.data.description || undefined,
          imageUrl:
            !body.data.imageUrl || body.data.imageUrl === ""
              ? undefined
              : body.data.imageUrl.trim() || undefined,
          basePrice: resolvedBasePrice,
          organizationId: auth.organizationId,
          categoryId: body.data.categoryId,
          supplierId: body.data.supplierId,
          attributes: attrsSynced as Prisma.InputJsonValue,
          maxSellerDiscountPercent:
            body.data.maxSellerDiscountPercent === undefined
              ? undefined
              : body.data.maxSellerDiscountPercent,
          minSaleUnitPrice:
            body.data.minSaleUnitPrice === undefined
              ? undefined
              : body.data.minSaleUnitPrice,
          commissionPercent:
            body.data.commissionPercent === undefined
              ? undefined
              : body.data.commissionPercent,
          stockQty: body.data.stockQty ?? 0,
          blockSaleWhenOutOfStock: body.data.blockSaleWhenOutOfStock ?? false,
          ...mapProductCadastroPrisma(body.data),
          ncmId: body.data.ncmId === undefined ? undefined : body.data.ncmId,
          fiscalOrigin:
            body.data.fiscalOrigin === undefined
              ? undefined
              : body.data.fiscalOrigin,
          fiscalGtin:
            body.data.fiscalGtin === undefined
              ? undefined
              : body.data.fiscalGtin,
          fiscalUnit:
            body.data.fiscalUnit === undefined
              ? undefined
              : body.data.fiscalUnit,
          fiscalCest:
            body.data.fiscalCest === undefined
              ? undefined
              : body.data.fiscalCest,
          fiscalDescription:
            body.data.fiscalDescription === undefined
              ? undefined
              : body.data.fiscalDescription,
          outboundOperationId:
            body.data.outboundOperationId === undefined
              ? undefined
              : body.data.outboundOperationId,
        },
        include: productRelationsInclude,
      });

      if (createPriceRows.length > 0) {
        await prisma.$transaction(
          createPriceRows.map((row) =>
            prisma.priceTableItem.upsert({
              where: {
                priceTableId_productId: {
                  priceTableId: row.priceTableId,
                  productId: created.id,
                },
              },
              create: {
                priceTableId: row.priceTableId,
                productId: created.id,
                price: row.price,
              },
              update: { price: row.price },
            }),
          ),
        );
      }

      const actor = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { matricula: true },
      });
      const initialQty = body.data.stockQty ?? 0;
      if (initialQty > 0) {
        await prisma.stockMovement.create({
          data: {
            organizationId: auth.organizationId,
            productId: created.id,
            type: "ADJUST",
            qtyDelta: initialQty,
            balanceAfter: initialQty,
            userId: auth.sub,
            reason: "Estoque inicial no cadastro",
          },
        });
      }
      await writeAuditLog({
        organizationId: auth.organizationId,
        userId: auth.sub,
        userMatricula: actor?.matricula ?? null,
        action: AUDIT_ACTION.CREATE,
        entityType: AUDIT_ENTITY.Product,
        entityId: created.id,
        metadata: {
          name: created.name,
          stockQty: initialQty,
          priceTableCount: createPriceRows.length,
        },
      });

      return prisma.product.findFirstOrThrow({
        where: { id: created.id, organizationId: auth.organizationId },
        include: productRelationsInclude,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return reply
          .status(400)
          .send({ error: "Código de barras já cadastrado nesta empresa." });
      }
      throw e;
    }
  });

  app.patch("/products/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        sku: z.string().nullable().optional(),
        barcode: z.string().max(80).nullable().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z
          .union([z.string().max(2048), z.literal("")])
          .nullable()
          .optional(),
        basePrice: z.number().nonnegative().optional(),
        featured: z.boolean().optional(),
        categoryId: z.string().nullable().optional(),
        supplierId: z.string().nullable().optional(),
        attributes: z.record(z.string(), z.unknown()).optional(),
        maxSellerDiscountPercent: z
          .number()
          .min(0)
          .max(100)
          .nullable()
          .optional(),
        minSaleUnitPrice: z.number().nonnegative().nullable().optional(),
        commissionPercent: optionalCommissionPercentSchema,
        ncmId: z.string().nullable().optional(),
        fiscalOrigin: z.number().int().min(0).max(8).nullable().optional(),
        fiscalGtin: z.string().nullable().optional(),
        fiscalUnit: z.string().nullable().optional(),
        fiscalCest: z.string().nullable().optional(),
        fiscalDescription: z.string().nullable().optional(),
        outboundOperationId: z.string().nullable().optional(),
        stockQty: z.number().int().min(0).optional(),
        blockSaleWhenOutOfStock: z.boolean().optional(),
        priceTablePrices: z
          .array(
            z.object({
              priceTableId: z.string().min(1),
              price: z.number().nonnegative(),
            }),
          )
          .min(1)
          .optional(),
        ...productCadastroFieldsSchema,
      })
      .safeParse(req.body);
    if (!body.success) {
      return sendZodError(reply, body.error, req);
    }

    const existing = await prisma.product.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    if ((req.body as { stockQty?: unknown })?.stockQty !== undefined) {
      return reply.status(400).send({
        error:
          "Alterações de estoque devem ser feitas em /admin/stock/entries (com reautenticação).",
      });
    }
    if (body.data.categoryId === null) {
      return reply
        .status(400)
        .send({ error: "Grupo de produtos é obrigatório" });
    }
    if (body.data.supplierId === null) {
      return reply.status(400).send({ error: "Fornecedor é obrigatório" });
    }

    if (body.data.categoryId !== undefined && body.data.categoryId !== null) {
      const ok = await prisma.productCategory.findFirst({
        where: {
          id: body.data.categoryId,
          organizationId: auth.organizationId,
        },
      });
      if (!ok)
        return reply.status(400).send({ error: "Grupo de produtos inválido" });
    }

    if (body.data.supplierId !== undefined && body.data.supplierId !== null) {
      const ok = await assertSupplierInOrg(
        auth.organizationId,
        body.data.supplierId,
      );
      if (!ok) return reply.status(400).send({ error: "Fornecedor inválido" });
    }

    const resolvedCatId =
      body.data.categoryId !== undefined
        ? body.data.categoryId
        : existing.categoryId;

    const categoryChanged =
      body.data.categoryId !== undefined &&
      body.data.categoryId !== existing.categoryId;
    const attrsProvided = body.data.attributes !== undefined;

    let validatedAttrs: Record<string, unknown> | undefined;

    if (attrsProvided || categoryChanged) {
      const mergedAttrs = attrsProvided
        ? body.data.attributes!
        : (existing.attributes as Record<string, unknown>);
      const defs = await loadCategoryDefs(
        resolvedCatId ?? null,
        auth.organizationId,
      );
      const validated = validateProductAttributes(mergedAttrs, defs);
      if (!validated.ok)
        return reply.status(400).send({ error: validated.error });
      validatedAttrs = validated.value;
    }

    const ncmProvided = body.data.ncm !== undefined;
    if (ncmProvided || validatedAttrs !== undefined) {
      const baseAttrs =
        validatedAttrs ?? (existing.attributes as Record<string, unknown>);
      const ncmCol = ncmProvided
        ? normalizeProductNcm(body.data.ncm)
        : existing.ncm;
      validatedAttrs = syncProductAttributesNcm(baseAttrs, ncmCol ?? null);
    }

    const patchBasePrice =
      body.data.priceTablePrices !== undefined
        ? (body.data.basePrice ??
          deriveBasePriceFromTablePrices(
            body.data.priceTablePrices.map((row) => row.price),
          ))
        : body.data.basePrice;

    try {
      const updated = await prisma.product.update({
        where: { id },
        data: {
          name: body.data.name,
          sku: body.data.sku === undefined ? undefined : body.data.sku,
          barcode:
            body.data.barcode === undefined
              ? undefined
              : normalizeProductBarcode(body.data.barcode),
          description:
            body.data.description === undefined
              ? undefined
              : body.data.description,
          basePrice: patchBasePrice,
          featured:
            body.data.featured === undefined ? undefined : body.data.featured,
          ...(body.data.imageUrl !== undefined
            ? {
                imageUrl:
                  body.data.imageUrl === null || body.data.imageUrl === ""
                    ? null
                    : body.data.imageUrl.trim() || null,
              }
            : {}),
          categoryId:
            body.data.categoryId === undefined
              ? undefined
              : body.data.categoryId,
          supplierId:
            body.data.supplierId === undefined
              ? undefined
              : body.data.supplierId,
          ...(validatedAttrs !== undefined
            ? { attributes: validatedAttrs as Prisma.InputJsonValue }
            : {}),
          maxSellerDiscountPercent:
            body.data.maxSellerDiscountPercent === undefined
              ? undefined
              : body.data.maxSellerDiscountPercent,
          minSaleUnitPrice:
            body.data.minSaleUnitPrice === undefined
              ? undefined
              : body.data.minSaleUnitPrice,
          commissionPercent:
            body.data.commissionPercent === undefined
              ? undefined
              : body.data.commissionPercent,
          blockSaleWhenOutOfStock: body.data.blockSaleWhenOutOfStock,
          ...mapProductCadastroPrisma(body.data),
          ncmId: body.data.ncmId === undefined ? undefined : body.data.ncmId,
          fiscalOrigin:
            body.data.fiscalOrigin === undefined
              ? undefined
              : body.data.fiscalOrigin,
          fiscalGtin:
            body.data.fiscalGtin === undefined
              ? undefined
              : body.data.fiscalGtin,
          fiscalUnit:
            body.data.fiscalUnit === undefined
              ? undefined
              : body.data.fiscalUnit,
          fiscalCest:
            body.data.fiscalCest === undefined
              ? undefined
              : body.data.fiscalCest,
          fiscalDescription:
            body.data.fiscalDescription === undefined
              ? undefined
              : body.data.fiscalDescription,
          outboundOperationId:
            body.data.outboundOperationId === undefined
              ? undefined
              : body.data.outboundOperationId,
        },
        include: productRelationsInclude,
      });

      if (body.data.priceTablePrices && body.data.priceTablePrices.length > 0) {
        const tableIds = body.data.priceTablePrices.map((p) => p.priceTableId);
        const tables = await prisma.priceTable.findMany({
          where: {
            id: { in: tableIds },
            organizationId: auth.organizationId,
          },
          select: { id: true },
        });
        const okIds = new Set(tables.map((t) => t.id));
        const invalid = tableIds.filter((tid) => !okIds.has(tid));
        if (invalid.length > 0) {
          return reply.status(400).send({ error: "Tabela de preço inválida" });
        }
        await prisma.$transaction(
          body.data.priceTablePrices.map((row) =>
            prisma.priceTableItem.upsert({
              where: {
                priceTableId_productId: {
                  priceTableId: row.priceTableId,
                  productId: id,
                },
              },
              create: {
                priceTableId: row.priceTableId,
                productId: id,
                price: row.price,
              },
              update: { price: row.price },
            }),
          ),
        );
      }

      await auditFromAuth(auth, {
        action: AUDIT_ACTION.UPDATE,
        entityType: AUDIT_ENTITY.Product,
        entityId: id,
        metadata: { name: updated.name, fields: Object.keys(body.data) },
      });
      return prisma.product.findFirstOrThrow({
        where: { id, organizationId: auth.organizationId },
        include: productRelationsInclude,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return reply
          .status(400)
          .send({ error: "Código de barras já cadastrado nesta empresa." });
      }
      throw e;
    }
  });

  app.delete("/products/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.product.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.product.delete({ where: { id } });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.DELETE,
      entityType: AUDIT_ENTITY.Product,
      entityId: id,
      metadata: { name: existing.name },
    });
    return reply.status(204).send();
  });

  /* --- Promoções (lista org + por produto) --- */
  app.get("/promotions", async (req) => {
    const auth = req.auth!;
    const rows = await prisma.productPromotion.findMany({
      where: { organizationId: auth.organizationId },
      include: {
        ...promotionRelationInclude,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            imageUrl: true,
            basePrice: true,
          },
        },
      },
      orderBy: [{ active: "desc" }, { priority: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => ({
      ...serializeProductPromotion(row),
      product: {
        id: row.product.id,
        name: row.product.name,
        sku: row.product.sku,
        imageUrl: row.product.imageUrl,
        basePrice: decToNum(row.product.basePrice),
      },
    }));
  });

  app.post("/promotions", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        productId: z.string().min(1),
        scope: z
          .enum(["PRODUCT_GLOBAL", "SELLER", "CUSTOMER"])
          .optional()
          .default("PRODUCT_GLOBAL"),
        sellerId: z.string().optional(),
        customerId: z.string().optional(),
        kind: z
          .enum(["PERCENT_OFF", "FIXED_AMOUNT_OFF", "SALE_PRICE"])
          .optional()
          .default("SALE_PRICE"),
        value: z.number(),
        label: z.string().optional(),
        active: z.boolean().optional(),
        validFrom: z.string().datetime().nullable().optional(),
        validTo: z.string().datetime().nullable().optional(),
        priority: z.number().int().optional(),
        minQuantity: z.number().int().positive().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return sendZodError(reply, body.error, req);
    }

    const d = body.data;
    const prod = await prisma.product.findFirst({
      where: { id: d.productId, organizationId: auth.organizationId },
    });
    if (!prod)
      return reply.status(404).send({ error: "Produto não encontrado" });

    const sellerId = d.scope === "SELLER" ? (d.sellerId ?? null) : null;
    const customerId = d.scope === "CUSTOMER" ? (d.customerId ?? null) : null;

    const errMsg = assertPromotionCoherence({
      scope: d.scope,
      sellerId,
      customerId,
      kind: d.kind,
      value: d.value,
    });
    if (errMsg) return reply.status(400).send({ error: errMsg });

    if (d.scope === "SELLER") {
      const s = await prisma.seller.findFirst({
        where: { id: sellerId!, organizationId: auth.organizationId },
      });
      if (!s) return reply.status(400).send({ error: "Vendedor inválido" });
    }
    if (d.scope === "CUSTOMER") {
      const c = await prisma.customer.findFirst({
        where: { id: customerId!, organizationId: auth.organizationId },
      });
      if (!c) return reply.status(400).send({ error: "Cliente inválido" });
    }

    const row = await prisma.productPromotion.create({
      data: {
        organizationId: auth.organizationId,
        productId: d.productId,
        scope: d.scope,
        sellerId,
        customerId,
        kind: d.kind,
        value: d.value,
        label: d.label?.trim() || null,
        active: d.active ?? true,
        validFrom: d.validFrom ? new Date(d.validFrom) : null,
        validTo: d.validTo ? new Date(d.validTo) : null,
        priority: d.priority ?? 0,
        minQuantity: d.minQuantity === undefined ? undefined : d.minQuantity,
      },
      include: {
        ...promotionRelationInclude,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            imageUrl: true,
            basePrice: true,
          },
        },
      },
    });

    await auditFromAuth(auth, {
      action: AUDIT_ACTION.CREATE,
      entityType: AUDIT_ENTITY.ProductPromotion,
      entityId: row.id,
      metadata: { productId: d.productId, kind: d.kind, scope: d.scope },
    });

    return {
      ...serializeProductPromotion(row),
      product: {
        id: row.product.id,
        name: row.product.name,
        sku: row.product.sku,
        imageUrl: row.product.imageUrl,
        basePrice: decToNum(row.product.basePrice),
      },
    };
  });

  app.get("/products/:productId/promotions", async (req, reply) => {
    const auth = req.auth!;
    const { productId } = z
      .object({ productId: z.string().min(1) })
      .parse(req.params);
    const prod = await prisma.product.findFirst({
      where: { id: productId, organizationId: auth.organizationId },
    });
    if (!prod)
      return reply.status(404).send({ error: "Produto não encontrado" });

    const rows = await prisma.productPromotion.findMany({
      where: { productId, organizationId: auth.organizationId },
      include: promotionRelationInclude,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(serializeProductPromotion);
  });

  app.post("/products/:productId/promotions", async (req, reply) => {
    const auth = req.auth!;
    const { productId } = z
      .object({ productId: z.string().min(1) })
      .parse(req.params);
    const body = z
      .object({
        scope: z.enum(["PRODUCT_GLOBAL", "SELLER", "CUSTOMER"]),
        sellerId: z.string().optional(),
        customerId: z.string().optional(),
        kind: z.enum(["PERCENT_OFF", "FIXED_AMOUNT_OFF", "SALE_PRICE"]),
        value: z.number(),
        label: z.string().optional(),
        active: z.boolean().optional(),
        validFrom: z.string().datetime().nullable().optional(),
        validTo: z.string().datetime().nullable().optional(),
        priority: z.number().int().optional(),
        minQuantity: z.number().int().positive().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const prod = await prisma.product.findFirst({
      where: { id: productId, organizationId: auth.organizationId },
    });
    if (!prod)
      return reply.status(404).send({ error: "Produto não encontrado" });

    const d = body.data;
    const sellerId = d.scope === "SELLER" ? (d.sellerId ?? null) : null;
    const customerId = d.scope === "CUSTOMER" ? (d.customerId ?? null) : null;

    const errMsg = assertPromotionCoherence({
      scope: d.scope,
      sellerId,
      customerId,
      kind: d.kind,
      value: d.value,
    });
    if (errMsg) return reply.status(400).send({ error: errMsg });

    if (d.scope === "SELLER") {
      const s = await prisma.seller.findFirst({
        where: { id: sellerId!, organizationId: auth.organizationId },
      });
      if (!s) return reply.status(400).send({ error: "Vendedor inválido" });
    }
    if (d.scope === "CUSTOMER") {
      const c = await prisma.customer.findFirst({
        where: { id: customerId!, organizationId: auth.organizationId },
      });
      if (!c) return reply.status(400).send({ error: "Cliente inválido" });
    }

    const row = await prisma.productPromotion.create({
      data: {
        organizationId: auth.organizationId,
        productId,
        scope: d.scope,
        sellerId,
        customerId,
        kind: d.kind,
        value: d.value,
        label: d.label ?? null,
        active: d.active ?? true,
        validFrom: d.validFrom ? new Date(d.validFrom) : null,
        validTo: d.validTo ? new Date(d.validTo) : null,
        priority: d.priority ?? 0,
        minQuantity: d.minQuantity ?? null,
      },
      include: promotionRelationInclude,
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.CREATE,
      entityType: AUDIT_ENTITY.ProductPromotion,
      entityId: row.id,
      metadata: { productId, scope: d.scope, kind: d.kind, value: d.value },
    });
    return serializeProductPromotion(row);
  });

  app.patch(
    "/products/:productId/promotions/:promotionId",
    async (req, reply) => {
      const auth = req.auth!;
      const p = z
        .object({
          productId: z.string().min(1),
          promotionId: z.string().min(1),
        })
        .parse(req.params);
      const body = z
        .object({
          scope: z.enum(["PRODUCT_GLOBAL", "SELLER", "CUSTOMER"]).optional(),
          sellerId: z.string().nullable().optional(),
          customerId: z.string().nullable().optional(),
          kind: z
            .enum(["PERCENT_OFF", "FIXED_AMOUNT_OFF", "SALE_PRICE"])
            .optional(),
          value: z.number().optional(),
          label: z.string().nullable().optional(),
          active: z.boolean().optional(),
          validFrom: z.string().datetime().nullable().optional(),
          validTo: z.string().datetime().nullable().optional(),
          priority: z.number().int().optional(),
          minQuantity: z.number().int().positive().nullable().optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
          return sendZodError(reply, body.error, req);
        }

      const existing = await prisma.productPromotion.findFirst({
        where: {
          id: p.promotionId,
          productId: p.productId,
          organizationId: auth.organizationId,
        },
      });
      if (!existing) return reply.status(404).send({ error: "Não encontrado" });

      const scope = body.data.scope ?? existing.scope;
      let sellerId =
        body.data.sellerId !== undefined
          ? body.data.sellerId
          : existing.sellerId;
      let customerId =
        body.data.customerId !== undefined
          ? body.data.customerId
          : existing.customerId;

      if (scope === "PRODUCT_GLOBAL") {
        sellerId = null;
        customerId = null;
      } else if (scope === "SELLER") {
        customerId = null;
      } else if (scope === "CUSTOMER") {
        sellerId = null;
      }

      const kind = body.data.kind ?? existing.kind;
      const value = body.data.value ?? decToNum(existing.value);

      const errMsg = assertPromotionCoherence({
        scope,
        sellerId,
        customerId,
        kind,
        value,
      });
      if (errMsg) return reply.status(400).send({ error: errMsg });

      if (scope === "SELLER") {
        const s = await prisma.seller.findFirst({
          where: { id: sellerId!, organizationId: auth.organizationId },
        });
        if (!s) return reply.status(400).send({ error: "Vendedor inválido" });
      }
      if (scope === "CUSTOMER") {
        const c = await prisma.customer.findFirst({
          where: { id: customerId!, organizationId: auth.organizationId },
        });
        if (!c) return reply.status(400).send({ error: "Cliente inválido" });
      }

      const row = await prisma.productPromotion.update({
        where: { id: p.promotionId },
        data: {
          scope,
          sellerId,
          customerId,
          kind,
          value: body.data.value ?? undefined,
          label: body.data.label === undefined ? undefined : body.data.label,
          active: body.data.active ?? undefined,
          validFrom:
            body.data.validFrom === undefined
              ? undefined
              : body.data.validFrom
                ? new Date(body.data.validFrom)
                : null,
          validTo:
            body.data.validTo === undefined
              ? undefined
              : body.data.validTo
                ? new Date(body.data.validTo)
                : null,
          priority: body.data.priority ?? undefined,
          minQuantity:
            body.data.minQuantity === undefined
              ? undefined
              : body.data.minQuantity === null
                ? null
                : body.data.minQuantity,
        },
        include: promotionRelationInclude,
      });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.UPDATE,
        entityType: AUDIT_ENTITY.ProductPromotion,
        entityId: p.promotionId,
        metadata: { productId: p.productId, fields: Object.keys(body.data) },
      });
      return serializeProductPromotion(row);
    },
  );

  app.delete(
    "/products/:productId/promotions/:promotionId",
    async (req, reply) => {
      const auth = req.auth!;
      const par = z
        .object({
          productId: z.string().min(1),
          promotionId: z.string().min(1),
        })
        .parse(req.params);
      const existing = await prisma.productPromotion.findFirst({
        where: {
          id: par.promotionId,
          productId: par.productId,
          organizationId: auth.organizationId,
        },
      });
      if (!existing) return reply.status(404).send({ error: "Não encontrado" });
      await prisma.productPromotion.delete({ where: { id: par.promotionId } });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.DELETE,
        entityType: AUDIT_ENTITY.ProductPromotion,
        entityId: par.promotionId,
        metadata: { productId: par.productId },
      });
      return reply.status(204).send();
    },
  );

  /* --- Vendedores --- */
  app.get("/managers", async (req) => {
    const auth = req.auth!;
    return prisma.user.findMany({
      where: { organizationId: auth.organizationId, role: "MANAGER" },
      select: { id: true, email: true, name: true },
      orderBy: { name: "asc" },
    });
  });

  /* --- Usuários da organização (ADMIN / MANAGER; vendedores em /sellers) --- */
  app.get("/users", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    return prisma.user.findMany({
      where: {
        organizationId: auth.organizationId,
        role: { in: ["ADMIN", "MANAGER"] },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationProfileId: true,
        organizationProfile: {
          select: { id: true, name: true, key: true, baseRole: true },
        },
        createdAt: true,
        activatedAt: true,
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
  });

  app.post("/users", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;

    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(6).optional(),
        name: z.string().min(1),
        role: z.enum(["ADMIN", "MANAGER"]).optional(),
        organizationProfileId: z.string().min(1).nullable().optional(),
        invite: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    try {
      await syncSubscriptionSeats(auth.organizationId, { extraAdmins: 1 });
    } catch (err) {
      const e = err as { message?: string; code?: string; http?: number };
      return reply.status(e.http ?? 502).send({
        error: e.message || "Não foi possível atualizar a cobrança dos assentos",
        code: e.code || "BILLING_SEAT_UPDATE_FAILED",
      });
    }

    const email = body.data.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return reply.status(409).send({ error: "Email já cadastrado" });

    let role: "ADMIN" | "MANAGER" = body.data.role ?? "MANAGER";
    let organizationProfileId: string | null =
      body.data.organizationProfileId ?? null;

    if (organizationProfileId) {
      const profile = await prisma.organizationProfile.findFirst({
        where: {
          id: organizationProfileId,
          organizationId: auth.organizationId,
          enabled: true,
        },
        select: { id: true, baseRole: true },
      });
      if (!profile) {
        return reply
          .status(400)
          .send({ error: "Perfil personalizado inválido" });
      }
      // Perfil custom: User.role técnico fica MANAGER; permissões vêm do perfil.
      role = "MANAGER";
      organizationProfileId = profile.id;
    } else if (!body.data.role) {
      return reply.status(400).send({ error: "Informe o perfil" });
    }

    if (role === "ADMIN") organizationProfileId = null;

    const useInvite = body.data.invite === true || !body.data.password;
    const { createActivationToken, unusablePasswordHash } =
      await import("../services/billing/account-activation.js");
    const { sendUserInviteEmail } =
      await import("../services/billing/activation-email.js");

    const passwordHash = useInvite
      ? await unusablePasswordHash()
      : await hashPassword(body.data.password!);
    let created;
    try {
      created = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: body.data.name.trim(),
          role,
          organizationId: auth.organizationId,
          organizationProfileId,
          activatedAt: useInvite ? null : new Date(),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationProfileId: true,
          organizationProfile: {
            select: { id: true, name: true, key: true, baseRole: true },
          },
          createdAt: true,
        },
      });
    } catch (err) {
      await syncSubscriptionSeats(auth.organizationId).catch(() => undefined);
      throw err;
    }

    let inviteEmailSent: boolean | undefined;
    let inviteEmailError: string | undefined;
    if (useInvite) {
      const { rawToken, expiresAt } = await createActivationToken(
        created.id,
        "USER_INVITE",
      );
      const org = await prisma.organization.findUnique({
        where: { id: auth.organizationId },
        select: { name: true, displayName: true },
      });
      const emailResult = await sendUserInviteEmail({
        to: created.email,
        name: created.name,
        companyName: org?.displayName || org?.name || "PedixPro",
        rawToken,
        expiresAt,
      });
      inviteEmailSent = emailResult.sent;
      inviteEmailError = emailResult.sent ? undefined : emailResult.reason;
    }

    const actor = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: { matricula: true },
    });
    await writeAuditLog({
      organizationId: auth.organizationId,
      userId: auth.sub,
      userMatricula: actor?.matricula ?? null,
      action: AUDIT_ACTION.CREATE,
      entityType: AUDIT_ENTITY.User,
      entityId: created.id,
      metadata: {
        email: created.email,
        role: created.role,
        organizationProfileId: created.organizationProfileId,
        invited: useInvite,
      },
    });

    return {
      ...created,
      invited: useInvite,
      inviteEmailSent,
      inviteEmailError,
    };
  });

  async function countOrgAdmins(organizationId: string): Promise<number> {
    return prisma.user.count({
      where: { organizationId, role: "ADMIN" },
    });
  }

  async function findStaffUser(organizationId: string, id: string) {
    return prisma.user.findFirst({
      where: {
        id,
        organizationId,
        role: { in: ["ADMIN", "MANAGER"] },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationProfileId: true,
        createdAt: true,
      },
    });
  }

  app.post("/users/:id/resend-invite", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const staff = await findStaffUser(auth.organizationId, id);
    if (!staff) return reply.status(404).send({ error: "Não encontrado" });
    const { sendInviteForExistingUser } =
      await import("../services/billing/activation-email.js");
    const result = await sendInviteForExistingUser(staff.id);
    if (!result.sent) {
      return reply.status(502).send({
        error: result.reason ?? "Não foi possível enviar o convite.",
      });
    }
    return { ok: true, inviteEmailSent: true };
  });

  app.post("/users/batch-delete", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;

    const body = z
      .object({ ids: z.array(z.string().min(1)).min(1).max(100) })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const ids = [...new Set(body.data.ids)];
    if (ids.includes(auth.sub)) {
      return reply
        .status(400)
        .send({ error: "Não é possível excluir a própria conta" });
    }

    const targets = await prisma.user.findMany({
      where: {
        organizationId: auth.organizationId,
        id: { in: ids },
        role: { in: ["ADMIN", "MANAGER"] },
      },
      select: { id: true, email: true, role: true },
    });
    if (targets.length !== ids.length) {
      return reply
        .status(400)
        .send({ error: "Um ou mais usuários não foram encontrados" });
    }

    const adminTargets = targets.filter((t) => t.role === "ADMIN").length;
    if (
      adminTargets > 0 &&
      (await countOrgAdmins(auth.organizationId)) <= adminTargets
    ) {
      return reply
        .status(400)
        .send({ error: "Não é possível excluir todos os administradores" });
    }

    await prisma.user.deleteMany({
      where: { organizationId: auth.organizationId, id: { in: ids } },
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.DELETE,
      entityType: AUDIT_ENTITY.User,
      entityId: auth.organizationId,
      metadata: {
        batch: true,
        count: targets.length,
        emails: targets.map((t) => t.email),
      },
    });
    return { deleted: targets.length };
  });

  app.patch("/users/batch", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;

    const body = z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(100),
        role: z.enum(["ADMIN", "MANAGER"]),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const ids = [...new Set(body.data.ids)];
    const targets = await prisma.user.findMany({
      where: {
        organizationId: auth.organizationId,
        id: { in: ids },
        role: { in: ["ADMIN", "MANAGER"] },
      },
      select: { id: true, email: true, role: true },
    });
    if (targets.length !== ids.length) {
      return reply
        .status(400)
        .send({ error: "Um ou mais usuários não foram encontrados" });
    }

    if (body.data.role === "MANAGER") {
      const demotingAdmins = targets.filter((t) => t.role === "ADMIN").length;
      if (
        demotingAdmins > 0 &&
        (await countOrgAdmins(auth.organizationId)) <= demotingAdmins
      ) {
        return reply
          .status(400)
          .send({ error: "Não é possível rebaixar todos os administradores" });
      }
    }

    await prisma.user.updateMany({
      where: { organizationId: auth.organizationId, id: { in: ids } },
      data: { role: body.data.role, organizationProfileId: null },
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.UPDATE,
      entityType: AUDIT_ENTITY.User,
      entityId: auth.organizationId,
      metadata: {
        batch: true,
        role: body.data.role,
        count: targets.length,
        emails: targets.map((t) => t.email),
      },
    });
    return { updated: targets.length, role: body.data.role };
  });

  app.patch("/users/:id", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);

    const body = z
      .object({
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        name: z.string().min(1).optional(),
        role: z.enum(["ADMIN", "MANAGER"]).optional(),
        organizationProfileId: z.string().min(1).nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await findStaffUser(auth.organizationId, id);
    if (!existing)
      return reply.status(404).send({ error: "Usuário não encontrado" });

    const d = body.data;
    let nextRole = d.role ?? existing.role;
    let nextProfileId =
      d.organizationProfileId === undefined
        ? existing.organizationProfileId
        : d.organizationProfileId;

    if (d.organizationProfileId) {
      const profile = await prisma.organizationProfile.findFirst({
        where: {
          id: d.organizationProfileId,
          organizationId: auth.organizationId,
          enabled: true,
        },
        select: { id: true, baseRole: true },
      });
      if (!profile) {
        return reply
          .status(400)
          .send({ error: "Perfil personalizado inválido" });
      }
      nextRole = "MANAGER";
      nextProfileId = profile.id;
    } else if (d.organizationProfileId === null || d.role) {
      nextProfileId = null;
    }

    if (nextRole === "ADMIN") nextProfileId = null;

    if (
      nextRole === "MANAGER" &&
      existing.role === "ADMIN" &&
      (await countOrgAdmins(auth.organizationId)) <= 1
    ) {
      return reply
        .status(400)
        .send({ error: "Não é possível rebaixar o último administrador" });
    }

    if (d.email) {
      const email = d.email.toLowerCase();
      if (email !== existing.email) {
        const taken = await prisma.user.findUnique({ where: { email } });
        if (taken)
          return reply.status(409).send({ error: "Email já cadastrado" });
      }
    }

    const patched = await prisma.user.updateMany({
      where: {
        id,
        organizationId: auth.organizationId,
        role: { in: ["ADMIN", "MANAGER"] },
      },
      data: {
        name: d.name?.trim(),
        email: d.email?.toLowerCase(),
        role: nextRole,
        organizationProfileId: nextProfileId,
        ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}),
      },
    });
    if (patched.count === 0) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }
    const updated = await prisma.user.findFirst({
      where: { id, organizationId: auth.organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationProfileId: true,
        organizationProfile: {
          select: { id: true, name: true, key: true, baseRole: true },
        },
        createdAt: true,
      },
    });
    if (!updated) {
      return reply.status(404).send({ error: "Usuário não encontrado" });
    }

    await auditFromAuth(auth, {
      action: AUDIT_ACTION.UPDATE,
      entityType: AUDIT_ENTITY.User,
      entityId: id,
      metadata: {
        fields: Object.keys(d),
        email: updated.email,
        role: updated.role,
        organizationProfileId: updated.organizationProfileId,
      },
    });

    return updated;
  });

  app.delete("/users/:id", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);

    if (id === auth.sub) {
      return reply
        .status(400)
        .send({ error: "Não é possível excluir a própria conta" });
    }

    const existing = await findStaffUser(auth.organizationId, id);
    if (!existing)
      return reply.status(404).send({ error: "Usuário não encontrado" });

    if (
      existing.role === "ADMIN" &&
      (await countOrgAdmins(auth.organizationId)) <= 1
    ) {
      return reply
        .status(400)
        .send({ error: "Não é possível excluir o último administrador" });
    }

    await prisma.user.deleteMany({
      where: {
        id,
        organizationId: auth.organizationId,
        role: { in: ["ADMIN", "MANAGER"] },
      },
    });
    await syncSubscriptionSeats(auth.organizationId).catch(() => undefined);
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.DELETE,
      entityType: AUDIT_ENTITY.User,
      entityId: id,
      metadata: { email: existing.email, role: existing.role },
    });
    return reply.status(204).send();
  });

  /* --- Equipes de vendas (admin) --- */
  app.get("/teams", async (req) => {
    const auth = req.auth!;
    const teams = await listSalesTeams(auth.organizationId);
    return teams.map(serializeSalesTeam);
  });

  app.get("/teams/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const team = await getSalesTeam(auth.organizationId, id);
    if (!team)
      return reply.status(404).send({ error: "Equipe não encontrada" });
    return serializeSalesTeam(team);
  });

  app.post("/teams", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        name: z.string().min(1),
        leaderSellerId: z.string().min(1),
        memberSellerIds: z.array(z.string().min(1)).min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    try {
      const team = await createSalesTeam(auth.organizationId, body.data);
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.CREATE,
        entityType: AUDIT_ENTITY.SalesTeam,
        entityId: team.id,
        metadata: { name: team.name },
      });
      return serializeSalesTeam(team);
    } catch (e) {
      if (e instanceof SalesTeamError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.patch("/teams/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        leaderSellerId: z.string().min(1).optional(),
        memberSellerIds: z.array(z.string().min(1)).min(1).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    try {
      const team = await updateSalesTeam(auth.organizationId, id, body.data);
      if (!team)
        return reply.status(404).send({ error: "Equipe não encontrada" });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.UPDATE,
        entityType: AUDIT_ENTITY.SalesTeam,
        entityId: id,
        metadata: { fields: Object.keys(body.data) },
      });
      return serializeSalesTeam(team);
    } catch (e) {
      if (e instanceof SalesTeamError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.delete("/teams/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const ok = await deleteSalesTeam(auth.organizationId, id);
    if (!ok) return reply.status(404).send({ error: "Equipe não encontrada" });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.DELETE,
      entityType: AUDIT_ENTITY.SalesTeam,
      entityId: id,
    });
    return reply.status(204).send();
  });

  app.get("/sellers", async (req) => {
    const auth = req.auth!;
    return prisma.seller.findMany({
      where: sellerScopeWhere(auth),
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            matricula: true,
            activatedAt: true,
          },
        },
        manager: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/sellers", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(6).optional(),
        invite: z.boolean().optional(),
        name: z.string().min(1),
        matricula: z.string().min(1).max(40).optional(),
        commissionType: sellerCommissionTypeSchema.default("FIXED"),
        commissionPercent: z.number().min(0).max(100).optional(),
        teamId: z.string().min(1).nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    try {
      await syncSubscriptionSeats(auth.organizationId, { extraSellers: 1 });
    } catch (err) {
      const e = err as { message?: string; code?: string; http?: number };
      return reply.status(e.http ?? 502).send({
        error: e.message || "Não foi possível atualizar a cobrança dos assentos",
        code: e.code || "BILLING_SEAT_UPDATE_FAILED",
      });
    }

    const { commissionType } = body.data;
    const commissionPercent =
      commissionType === "FIXED"
        ? (body.data.commissionPercent ?? 10)
        : (body.data.commissionPercent ?? 0);

    const email = body.data.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return reply.status(409).send({ error: "Email já cadastrado" });

    const useInvite = body.data.invite === true || !body.data.password;
    const { createActivationToken, unusablePasswordHash } =
      await import("../services/billing/account-activation.js");
    const { sendUserInviteEmail } =
      await import("../services/billing/activation-email.js");
    const passwordHash = useInvite
      ? await unusablePasswordHash()
      : await hashPassword(body.data.password!);

    if (body.data.teamId) {
      const team = await prisma.salesTeam.findFirst({
        where: { id: body.data.teamId, organizationId: auth.organizationId },
        select: { id: true },
      });
      if (!team) return reply.status(400).send({ error: "Equipe inválida" });
    }

    try {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: body.data.name,
          matricula: body.data.matricula?.trim() || null,
          role: "SELLER",
          organizationId: auth.organizationId,
          activatedAt: useInvite ? null : new Date(),
          seller: {
            create: {
              organizationId: auth.organizationId,
              commissionType,
              commissionPercent,
              active: true,
              ...(body.data.teamId ? { teamId: body.data.teamId } : {}),
            },
          },
        },
        include: { seller: true },
      });

      let inviteEmailSent: boolean | undefined;
      let inviteEmailError: string | undefined;
      if (useInvite) {
        const { rawToken, expiresAt } = await createActivationToken(
          user.id,
          "USER_INVITE",
        );
        const org = await prisma.organization.findUnique({
          where: { id: auth.organizationId },
          select: { name: true, displayName: true },
        });
        const emailResult = await sendUserInviteEmail({
          to: user.email,
          name: user.name,
          companyName: org?.displayName || org?.name || "PedixPro",
          rawToken,
          expiresAt,
        });
        inviteEmailSent = emailResult.sent;
        inviteEmailError = emailResult.sent ? undefined : emailResult.reason;
      }

      await auditFromAuth(auth, {
        action: AUDIT_ACTION.CREATE,
        entityType: AUDIT_ENTITY.User,
        entityId: user.id,
        metadata: {
          sellerId: user.seller!.id,
          email: user.email,
          role: "SELLER",
          invited: useInvite,
        },
      });

      return {
        id: user.seller!.id,
        userId: user.id,
        email: user.email,
        name: user.name,
        matricula: user.matricula,
        commissionType: user.seller!.commissionType,
        commissionPercent: decToNum(user.seller!.commissionPercent),
        active: user.seller!.active,
        invited: useInvite,
        inviteEmailSent,
        inviteEmailError,
      };
    } catch (e) {
      await syncSubscriptionSeats(auth.organizationId).catch(() => undefined);
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return reply
          .status(409)
          .send({ error: "Matrícula já cadastrada nesta empresa" });
      }
      throw e;
    }
  });

  const sellerInclude = {
    user: {
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        matricula: true,
        activatedAt: true,
      },
    },
    manager: { select: { id: true, name: true, email: true } },
    team: { select: { id: true, name: true } },
  } as const;

  async function findOrgSeller(organizationId: string, id: string) {
    return prisma.seller.findFirst({
      where: { id, organizationId },
      include: {
        user: true,
        ledTeam: { select: { id: true, name: true } },
      },
    });
  }

  app.post("/sellers/:id/resend-invite", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const seller = await findOrgSeller(auth.organizationId, id);
    if (!seller) return reply.status(404).send({ error: "Não encontrado" });
    const { sendInviteForExistingUser } =
      await import("../services/billing/activation-email.js");
    const result = await sendInviteForExistingUser(seller.userId);
    if (!result.sent) {
      return reply.status(502).send({
        error: result.reason ?? "Não foi possível enviar o convite.",
      });
    }
    return { ok: true, inviteEmailSent: true };
  });

  app.post("/sellers/batch-delete", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({ ids: z.array(z.string().min(1)).min(1).max(100) })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const ids = [...new Set(body.data.ids)];
    const targets = await prisma.seller.findMany({
      where: { organizationId: auth.organizationId, id: { in: ids } },
      include: {
        user: { select: { id: true, email: true, name: true } },
        ledTeam: { select: { id: true, name: true } },
      },
    });
    if (targets.length !== ids.length) {
      return reply
        .status(400)
        .send({ error: "Um ou mais vendedores não foram encontrados" });
    }

    const leaders = targets.filter((t) => t.ledTeam);
    if (leaders.length > 0) {
      return reply.status(400).send({
        error: `Não é possível excluir líder(es) de equipe: ${leaders
          .map((l) => l.user.name)
          .join(", ")}. Transfira a liderança antes.`,
      });
    }

    const userIds = targets.map((t) => t.userId);
    await prisma.user.deleteMany({
      where: { organizationId: auth.organizationId, id: { in: userIds } },
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.DELETE,
      entityType: AUDIT_ENTITY.User,
      entityId: auth.organizationId,
      metadata: {
        batch: true,
        sellers: true,
        count: targets.length,
        emails: targets.map((t) => t.user.email),
      },
    });
    return { deleted: targets.length };
  });

  app.patch("/sellers/batch", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(100),
        active: z.boolean().optional(),
        managerUserId: z.string().min(1).nullable().optional(),
        commissionType: sellerCommissionTypeSchema.optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const { ids: rawIds, ...patch } = body.data;
    if (
      patch.active === undefined &&
      patch.managerUserId === undefined &&
      patch.commissionType === undefined
    ) {
      return reply.status(400).send({ error: "Nenhuma alteração informada" });
    }

    const ids = [...new Set(rawIds)];
    const targets = await prisma.seller.findMany({
      where: { organizationId: auth.organizationId, id: { in: ids } },
      select: { id: true },
    });
    if (targets.length !== ids.length) {
      return reply
        .status(400)
        .send({ error: "Um ou mais vendedores não foram encontrados" });
    }

    if (patch.managerUserId !== undefined) {
      const v = await validateManagerAssignment(
        auth.organizationId,
        patch.managerUserId,
      );
      if (!v.ok) return reply.status(400).send({ error: v.error });
    }

    await prisma.seller.updateMany({
      where: { organizationId: auth.organizationId, id: { in: ids } },
      data: {
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.managerUserId !== undefined
          ? { managerUserId: patch.managerUserId }
          : {}),
        ...(patch.commissionType !== undefined
          ? { commissionType: patch.commissionType }
          : {}),
      },
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.UPDATE,
      entityType: AUDIT_ENTITY.User,
      entityId: auth.organizationId,
      metadata: {
        batch: true,
        sellers: true,
        count: targets.length,
        fields: Object.keys(patch),
      },
    });
    return { updated: targets.length };
  });

  app.patch("/sellers/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        commissionType: sellerCommissionTypeSchema.optional(),
        commissionPercent: z.number().min(0).max(100).optional(),
        active: z.boolean().optional(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        matricula: z.string().min(1).max(40).nullable().optional(),
        managerUserId: z.string().min(1).nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const seller = await findOrgSeller(auth.organizationId, id);
    if (!seller) return reply.status(404).send({ error: "Não encontrado" });

    if (body.data.managerUserId !== undefined) {
      const v = await validateManagerAssignment(
        auth.organizationId,
        body.data.managerUserId,
      );
      if (!v.ok) return reply.status(400).send({ error: v.error });
    }

    if (body.data.email) {
      const email = body.data.email.toLowerCase();
      if (email !== seller.user.email) {
        const taken = await prisma.user.findUnique({ where: { email } });
        if (taken)
          return reply.status(409).send({ error: "Email já cadastrado" });
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        const sellerPatch = await tx.seller.updateMany({
          where: { id, organizationId: auth.organizationId },
          data: {
            commissionType: body.data.commissionType ?? undefined,
            commissionPercent: body.data.commissionPercent ?? undefined,
            active: body.data.active ?? undefined,
            ...(body.data.managerUserId !== undefined
              ? { managerUserId: body.data.managerUserId }
              : {}),
          },
        });
        if (sellerPatch.count === 0) {
          throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
        }
        if (
          body.data.name ||
          body.data.email ||
          body.data.password ||
          body.data.matricula !== undefined
        ) {
          await tx.user.updateMany({
            where: {
              id: seller.userId,
              organizationId: auth.organizationId,
            },
            data: {
              ...(body.data.name ? { name: body.data.name.trim() } : {}),
              ...(body.data.email
                ? { email: body.data.email.toLowerCase() }
                : {}),
              ...(body.data.password
                ? {
                    passwordHash: await hashPassword(body.data.password),
                  }
                : {}),
              ...(body.data.matricula !== undefined
                ? {
                    matricula: body.data.matricula?.trim() || null,
                  }
                : {}),
            },
          });
        }
      });
    } catch (e) {
      if ((e as { code?: string }).code === "NOT_FOUND") {
        return reply.status(404).send({ error: "Não encontrado" });
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return reply
          .status(409)
          .send({ error: "Matrícula já cadastrada nesta empresa" });
      }
      throw e;
    }

    await auditFromAuth(auth, {
      action: AUDIT_ACTION.UPDATE,
      entityType: AUDIT_ENTITY.User,
      entityId: seller.userId,
      metadata: {
        sellerId: id,
        fields: Object.keys(body.data),
      },
    });

    return prisma.seller.findUnique({
      where: { id },
      include: sellerInclude,
    });
  });

  app.delete("/sellers/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);

    const seller = await findOrgSeller(auth.organizationId, id);
    if (!seller) return reply.status(404).send({ error: "Não encontrado" });

    if (seller.ledTeam) {
      return reply.status(400).send({
        error: `Não é possível excluir o líder da equipe “${seller.ledTeam.name}”. Transfira a liderança antes.`,
      });
    }

    if (seller.userId === auth.sub) {
      return reply
        .status(400)
        .send({ error: "Não é possível excluir a própria conta" });
    }

    await prisma.user.deleteMany({
      where: {
        id: seller.userId,
        organizationId: auth.organizationId,
      },
    });
    await syncSubscriptionSeats(auth.organizationId).catch(() => undefined);
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.DELETE,
      entityType: AUDIT_ENTITY.User,
      entityId: seller.userId,
      metadata: {
        sellerId: id,
        email: seller.user.email,
        role: "SELLER",
      },
    });
    return reply.status(204).send();
  });

  app.get("/sellers/:id/products", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const seller = await prisma.seller.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!seller)
      return reply.status(404).send({ error: "Vendedor não encontrado" });

    const products = await listAssignedProductsInOrg(
      auth.organizationId,
      id,
    );
    return products;
  });

  app.put("/sellers/:id/products", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ productIds: z.array(z.string()) })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const seller = await prisma.seller.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!seller)
      return reply.status(404).send({ error: "Vendedor não encontrado" });

    const products = await prisma.product.findMany({
      where: {
        organizationId: auth.organizationId,
        id: { in: body.data.productIds },
      },
    });
    if (products.length !== body.data.productIds.length) {
      return reply.status(400).send({ error: "Algum produto é inválido" });
    }

    await prisma.sellerProduct.deleteMany({ where: { sellerId: id } });
    if (body.data.productIds.length) {
      await prisma.sellerProduct.createMany({
        data: body.data.productIds.map((productId) => ({
          sellerId: id,
          productId,
        })),
      });
    }
    return { ok: true };
  });

  /* --- Clientes --- */
  app.get("/customers", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        sellerId: z.string().optional(),
        approvalStatus: z.enum(["APPROVED", "PENDING", "REJECTED"]).optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      })
      .safeParse(req.query);
    await maybeInactivateStaleCustomersForOrg(auth.organizationId);
    const where: Prisma.CustomerWhereInput = {
      organizationId: auth.organizationId,
    };
    if (q.success && q.data.sellerId) where.sellerId = q.data.sellerId;
    if (q.success && q.data.approvalStatus)
      where.approvalStatus = q.data.approvalStatus;
    if (q.success && q.data.status) where.status = q.data.status;
    return prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        seller: { include: { user: { select: { name: true } } } },
        region: { select: { id: true, code: true, name: true } },
      },
    }).then(async (customers) => {
      if (!customers.length) return customers;
      const ids = customers.map((c) => c.id);
      const today0 = new Date();
      today0.setHours(0, 0, 0, 0);

      const [openTitles, openReceivables] = await Promise.all([
        prisma.customerCreditTitle.findMany({
          where: {
            organizationId: auth.organizationId,
            customerId: { in: ids },
            status: "OPEN",
          },
          select: {
            customerId: true,
            amount: true,
            paidAmount: true,
            dueDate: true,
          },
        }),
        prisma.receivable.findMany({
          where: {
            organizationId: auth.organizationId,
            customerId: { in: ids },
            status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
          },
          select: {
            customerId: true,
            amount: true,
            paidAmount: true,
            dueDate: true,
            status: true,
          },
        }),
      ]);

      const summary = new Map<
        string,
        { openAmount: number; overdueAmount: number; situation: string }
      >();
      for (const id of ids) {
        summary.set(id, {
          openAmount: 0,
          overdueAmount: 0,
          situation: "OK",
        });
      }
      const round = (n: number) => Math.round(n * 100) / 100;
      for (const t of openTitles) {
        const rem =
          Number(t.amount) - Number(t.paidAmount);
        if (rem <= 0) continue;
        const s = summary.get(t.customerId)!;
        s.openAmount = round(s.openAmount + rem);
        if (t.dueDate < today0) {
          s.overdueAmount = round(s.overdueAmount + rem);
        }
      }
      for (const r of openReceivables) {
        const rem = Number(r.amount) - Number(r.paidAmount);
        if (rem <= 0) continue;
        const s = summary.get(r.customerId)!;
        s.openAmount = round(s.openAmount + rem);
        if (r.status === "OVERDUE" || r.dueDate < today0) {
          s.overdueAmount = round(s.overdueAmount + rem);
        }
      }
      for (const c of customers) {
        const s = summary.get(c.id)!;
        if (c.creditBlocked || s.overdueAmount > 0) {
          s.situation = "OVERDUE";
        } else if (s.openAmount > 0) {
          s.situation = "OPEN";
        }
      }

      return customers.map((c) => {
        const s = summary.get(c.id)!;
        return {
          ...c,
          creditSituation: s.situation,
          creditOpenAmount: s.openAmount,
          creditOverdueAmount: s.overdueAmount,
        };
      });
    });
  });

  app.patch("/customers/batch", async (req, reply) => {
    const auth = req.auth!;
    if (
      auth.role === "MANAGER" &&
      !(await canWriteEffective(auth.organizationId, auth.role, "customers"))
    ) {
      return reply
        .status(403)
        .send({ error: "Sem permissão para editar clientes" });
    }
    const body = z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(100),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
        creditBlocked: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const { ids: rawIds, ...patch } = body.data;
    if (patch.status === undefined && patch.creditBlocked === undefined) {
      return reply.status(400).send({ error: "Nenhuma alteração informada" });
    }

    const ids = [...new Set(rawIds)];
    const targets = await prisma.customer.findMany({
      where: { organizationId: auth.organizationId, id: { in: ids } },
      select: { id: true, name: true },
    });
    if (targets.length !== ids.length) {
      return reply
        .status(400)
        .send({ error: "Um ou mais clientes não foram encontrados" });
    }

    await prisma.customer.updateMany({
      where: { organizationId: auth.organizationId, id: { in: ids } },
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.creditBlocked !== undefined
          ? { creditBlocked: patch.creditBlocked }
          : {}),
      },
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.UPDATE,
      entityType: AUDIT_ENTITY.Customer,
      entityId: auth.organizationId,
      metadata: {
        batch: true,
        count: targets.length,
        status: patch.status ?? null,
        creditBlocked: patch.creditBlocked ?? null,
        names: targets.map((t) => t.name).slice(0, 20),
      },
    });
    return { updated: targets.length };
  });

  app.get("/customers/pending-approval", async (req) => {
    const auth = req.auth!;
    return prisma.customer.findMany({
      where: {
        organizationId: auth.organizationId,
        approvalStatus: "PENDING",
      },
      orderBy: { createdAt: "asc" },
      include: {
        seller: { include: { user: { select: { name: true } } } },
        region: { select: { id: true, code: true, name: true } },
      },
    });
  });

  app.post("/customers/:id/approve", async (req, reply) => {
    const auth = req.auth!;
    if (
      auth.role === "MANAGER" &&
      !(await canWriteEffective(auth.organizationId, auth.role, "customers"))
    ) {
      return reply
        .status(403)
        .send({ error: "Sem permissão para aprovar clientes" });
    }
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ note: z.string().trim().max(500).optional() })
      .safeParse(req.body ?? {});
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.customer.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    if (existing.approvalStatus !== "PENDING") {
      return reply
        .status(400)
        .send({ error: "Cliente não está aguardando validação" });
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedByUserId: auth.sub,
        approvalNote: body.data.note ?? null,
        rejectedAt: null,
        rejectionReason: null,
      },
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.STATUS_CHANGE,
      entityType: AUDIT_ENTITY.Customer,
      entityId: updated.id,
      metadata: {
        approvalStatus: "APPROVED",
        name: updated.name,
        note: body.data.note ?? null,
      },
    });
    return updated;
  });

  app.post("/customers/:id/reject", async (req, reply) => {
    const auth = req.auth!;
    if (
      auth.role === "MANAGER" &&
      !(await canWriteEffective(auth.organizationId, auth.role, "customers"))
    ) {
      return reply
        .status(403)
        .send({ error: "Sem permissão para rejeitar clientes" });
    }
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        reason: z.string().trim().max(500).optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.customer.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    if (existing.approvalStatus !== "PENDING") {
      return reply
        .status(400)
        .send({ error: "Cliente não está aguardando validação" });
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        approvalStatus: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: body.data.reason ?? null,
        approvedAt: null,
        approvedByUserId: null,
        approvalNote: null,
      },
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.STATUS_CHANGE,
      entityType: AUDIT_ENTITY.Customer,
      entityId: updated.id,
      metadata: {
        approvalStatus: "REJECTED",
        name: updated.name,
        reason: body.data.reason ?? null,
      },
    });
    return updated;
  });

  app.post("/customers", async (req, reply) => {
    const auth = req.auth!;
    const body = customerBodySchema.safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    if (body.data.sellerId) {
      const s = await prisma.seller.findFirst({
        where: { id: body.data.sellerId, organizationId: auth.organizationId },
      });
      if (!s) return reply.status(400).send({ error: "Vendedor inválido" });
    }

    if (body.data.regionId) {
      const r = await prisma.region.findFirst({
        where: { id: body.data.regionId, organizationId: auth.organizationId },
      });
      if (!r) return reply.status(400).send({ error: "Região inválida" });
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const code = await nextCustomerCode(tx, auth.organizationId);
        return tx.customer.create({
          data: {
            organizationId: auth.organizationId,
            code,
            ...toCustomerPrismaData(body.data, { includeCredit: true }),
          } as Prisma.CustomerUncheckedCreateInput,
        });
      });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.CREATE,
        entityType: AUDIT_ENTITY.Customer,
        entityId: created.id,
        metadata: { name: created.name, code: created.code },
      });
      return created;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return reply
          .status(409)
          .send({ error: "CNPJ ou CPF já cadastrado nesta organização." });
      }
      throw e;
    }
  });

  app.patch("/customers/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = customerPatchSchema.safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.customer.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    if (body.data.regionId) {
      const r = await prisma.region.findFirst({
        where: { id: body.data.regionId, organizationId: auth.organizationId },
      });
      if (!r) return reply.status(400).send({ error: "Região inválida" });
    }

    const merged = {
      name: body.data.name ?? existing.name,
      email: body.data.email !== undefined ? body.data.email : existing.email,
      phone: body.data.phone !== undefined ? body.data.phone : existing.phone,
      sellerId:
        body.data.sellerId !== undefined
          ? body.data.sellerId
          : existing.sellerId,
      regionId:
        body.data.regionId !== undefined
          ? body.data.regionId
          : existing.regionId,
      latitude:
        body.data.latitude !== undefined
          ? body.data.latitude
          : existing.latitude != null
            ? decToNum(existing.latitude)
            : null,
      longitude:
        body.data.longitude !== undefined
          ? body.data.longitude
          : existing.longitude != null
            ? decToNum(existing.longitude)
            : null,
      addressNote:
        body.data.addressNote !== undefined
          ? body.data.addressNote
          : existing.addressNote,
      documentType:
        body.data.documentType !== undefined
          ? body.data.documentType
          : existing.documentType,
      cnpj: body.data.cnpj !== undefined ? body.data.cnpj : existing.cnpj,
      cpf: body.data.cpf !== undefined ? body.data.cpf : existing.cpf,
      legalName:
        body.data.legalName !== undefined
          ? body.data.legalName
          : existing.legalName,
      tradeName:
        body.data.tradeName !== undefined
          ? body.data.tradeName
          : existing.tradeName,
      cep: body.data.cep !== undefined ? body.data.cep : existing.cep,
      street:
        body.data.street !== undefined ? body.data.street : existing.street,
      number:
        body.data.number !== undefined ? body.data.number : existing.number,
      neighborhood:
        body.data.neighborhood !== undefined
          ? body.data.neighborhood
          : existing.neighborhood,
      state: body.data.state !== undefined ? body.data.state : existing.state,
      city: body.data.city !== undefined ? body.data.city : existing.city,
      cityIbgeCode:
        body.data.cityIbgeCode !== undefined
          ? body.data.cityIbgeCode
          : existing.cityIbgeCode,
      stateRegistration:
        body.data.stateRegistration !== undefined
          ? body.data.stateRegistration
          : existing.stateRegistration,
      buyerName:
        body.data.buyerName !== undefined
          ? body.data.buyerName
          : existing.buyerName,
      notes: body.data.notes !== undefined ? body.data.notes : existing.notes,
      creditLimit:
        body.data.creditLimit !== undefined
          ? body.data.creditLimit
          : existing.creditLimit != null
            ? decToNum(existing.creditLimit)
            : null,
      creditBlocked:
        body.data.creditBlocked !== undefined
          ? body.data.creditBlocked
          : existing.creditBlocked,
      status:
        body.data.status !== undefined ? body.data.status : existing.status,
    };

    const complete = parseCompleteCustomerBody(merged);
    if (!complete.success) {
      return sendZodError(
        reply,
        complete.error,
        req,
        "Cadastro incompleto — preencha todos os campos obrigatórios",
      );
    }

    // Revalida IBGE quando CEP/cidade/UF mudam (ou código inválido).
    {
      const { resolveMunicipioIbge } = await import(
        "../services/ibge/municipio-resolver.js"
      );
      const addrChanged =
        body.data.cep !== undefined ||
        body.data.city !== undefined ||
        body.data.state !== undefined ||
        body.data.cityIbgeCode !== undefined;
      if (addrChanged) {
        const resolved = await resolveMunicipioIbge({
          codigoIbge: complete.data.cityIbgeCode,
          cep: complete.data.cep,
          cidade: complete.data.city,
          uf: complete.data.state,
          cnpj: complete.data.cnpj,
        });
        if (resolved.codigoIbge) {
          complete.data.cityIbgeCode = resolved.codigoIbge;
        }
      }
    }

    try {
      const updated = await prisma.customer.update({
        where: { id },
        data: {
          ...(toCustomerPrismaData(complete.data, {
            includeCredit: true,
          }) as Prisma.CustomerUncheckedUpdateInput),
          ...(body.data.status !== undefined
            ? { status: body.data.status }
            : {}),
        },
      });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.UPDATE,
        entityType: AUDIT_ENTITY.Customer,
        entityId: id,
        metadata: {
          name: updated.name,
          fields: Object.keys(body.data),
          ...(body.data.status !== undefined
            ? { status: body.data.status }
            : {}),
        },
      });
      return updated;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return reply
          .status(409)
          .send({ error: "CNPJ ou CPF já cadastrado nesta organização." });
      }
      throw e;
    }
  });

  app.delete("/customers/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.customer.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.customer.delete({ where: { id } });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.DELETE,
      entityType: AUDIT_ENTITY.Customer,
      entityId: id,
      metadata: { name: existing.name },
    });
    return reply.status(204).send();
  });

  /* --- Visitas em campo (check-in/out no app do vendedor) --- */
  app.get("/customer-visits", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sellerId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
      })
      .safeParse(req.query);
    if (!q.success)
      return reply.status(400).send({ error: "Parâmetros inválidos" });

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let fromDt = defaultFrom;
    if (q.data.from?.trim()) {
      const p = parseVisitPeriodDate(q.data.from, "start");
      if (!p)
        return reply
          .status(400)
          .send({ error: "Data inicial inválida (use YYYY-MM-DD ou ISO)" });
      fromDt = p;
    }

    let toDt = now;
    if (q.data.to?.trim()) {
      const p = parseVisitPeriodDate(q.data.to, "end");
      if (!p)
        return reply
          .status(400)
          .send({ error: "Data final inválida (use YYYY-MM-DD ou ISO)" });
      toDt = p;
    }

    if (fromDt > toDt)
      return reply
        .status(400)
        .send({ error: "O início do período deve ser antes do fim" });

    const sellerId = q.data.sellerId?.trim();
    const scope = sellerScopeWhere(auth);
    if (sellerId) {
      const sRow = await prisma.seller.findFirst({
        where: { id: sellerId, ...scope },
        select: { id: true },
      });
      if (!sRow) return reply.status(400).send({ error: "Vendedor inválido" });
    }

    const limit = q.data.limit ?? 300;

    const rows = await prisma.sellerCustomerVisit.findMany({
      where: {
        organizationId: auth.organizationId,
        checkedInAt: { gte: fromDt, lte: toDt },
        seller: scope,
        ...(sellerId ? { sellerId } : {}),
      },
      orderBy: { checkedInAt: "desc" },
      take: limit,
      include: {
        seller: { include: { user: { select: { name: true } } } },
        customer: {
          select: { id: true, name: true, latitude: true, longitude: true },
        },
      },
    });

    const visits = rows.map((v) => {
      const durationSeconds =
        v.checkedOutAt != null
          ? Math.round(
              (v.checkedOutAt.getTime() - v.checkedInAt.getTime()) / 1000,
            )
          : null;
      return {
        id: v.id,
        sellerId: v.sellerId,
        sellerName: v.seller.user.name,
        customerId: v.customerId,
        customerName: v.customer.name,
        customerLatitude:
          v.customer.latitude != null ? decToNum(v.customer.latitude) : null,
        customerLongitude:
          v.customer.longitude != null ? decToNum(v.customer.longitude) : null,
        checkedInAt: v.checkedInAt.toISOString(),
        checkedOutAt: v.checkedOutAt?.toISOString() ?? null,
        checkInLat: v.checkInLat != null ? decToNum(v.checkInLat) : null,
        checkInLng: v.checkInLng != null ? decToNum(v.checkInLng) : null,
        checkOutLat: v.checkOutLat != null ? decToNum(v.checkOutLat) : null,
        checkOutLng: v.checkOutLng != null ? decToNum(v.checkOutLng) : null,
        durationSeconds,
        openVisit: v.checkedOutAt == null,
        notes: v.notes,
      };
    });

    return {
      period: { from: fromDt.toISOString(), to: toDt.toISOString() },
      limit,
      visits,
    };
  });

  app.get("/seller-locations", async (req) => {
    const auth = req.auth!;
    return listAdminSellerLocations(auth);
  });

  app.get("/seller-locations/ws", { websocket: true }, (socket, req) => {
    const q = req.query as { access_token?: string };
    const token =
      typeof q.access_token === "string" ? q.access_token.trim() : "";
    if (!token) {
      socket.close(4401, "Token obrigatório");
      return;
    }
    let auth;
    try {
      auth = verifyAccessToken(token);
    } catch {
      socket.close(4401, "Token inválido");
      return;
    }
    if (!isOrgStaff(auth.role)) {
      socket.close(4403, "Sem permissão");
      return;
    }

    const role =
      auth.role === "MANAGER" ? ("MANAGER" as const) : ("ADMIN" as const);
    const unregister = registerSellerLocationClient(auth.organizationId, {
      socket,
      role,
      userId: auth.sub,
    });

    const heartbeat = setInterval(() => {
      if (socket.readyState === 1) socket.ping();
    }, 30_000);

    socket.on("close", () => {
      clearInterval(heartbeat);
      unregister();
    });
  });

  app.get("/sellers/:id/location-history", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const q = z.object({ date: z.string().optional() }).safeParse(req.query);
    if (!q.success) return reply.status(400).send({ error: "Query inválida" });
    const result = await getSellerLocationHistory(auth, reply, id, q.data.date);
    if (!result) return;
    return result;
  });

  /* --- Títulos / crédito do cliente --- */
  app.get("/customers/:customerId/credit-titles", async (req, reply) => {
    const auth = req.auth!;
    const { customerId } = z
      .object({ customerId: z.string().min(1) })
      .parse(req.params);
    const cust = await prisma.customer.findFirst({
      where: { id: customerId, organizationId: auth.organizationId },
    });
    if (!cust) return reply.status(404).send({ error: "Não encontrado" });
    return prisma.customerCreditTitle.findMany({
      where: { organizationId: auth.organizationId, customerId },
      orderBy: [{ dueDate: "desc" }],
    });
  });

  app.post("/customers/:customerId/credit-titles", async (req, reply) => {
    const auth = req.auth!;
    const { customerId } = z
      .object({ customerId: z.string().min(1) })
      .parse(req.params);
    const cust = await prisma.customer.findFirst({
      where: { id: customerId, organizationId: auth.organizationId },
    });
    if (!cust) return reply.status(404).send({ error: "Não encontrado" });

    const body = z
      .object({
        reference: z.string().nullable().optional(),
        amount: z.number().positive(),
        paidAmount: z.number().nonnegative().optional(),
        issueDate: z.string().datetime().optional(),
        dueDate: z.string().datetime(),
        notes: z.string().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const paid = body.data.paidAmount ?? 0;
    if (paid > body.data.amount + 1e-6) {
      return reply
        .status(400)
        .send({ error: "Valor pago não pode ser maior que o título" });
    }

    return prisma.customerCreditTitle.create({
      data: {
        organizationId: auth.organizationId,
        customerId,
        reference: body.data.reference ?? null,
        amount: body.data.amount,
        paidAmount: paid,
        issueDate: body.data.issueDate
          ? new Date(body.data.issueDate)
          : undefined,
        dueDate: new Date(body.data.dueDate),
        notes: body.data.notes ?? null,
      },
    });
  });

  app.patch("/credit-titles/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        reference: z.string().nullable().optional(),
        amount: z.number().positive().optional(),
        paidAmount: z.number().nonnegative().optional(),
        issueDate: z.string().datetime().optional(),
        dueDate: z.string().datetime().optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(["OPEN", "PAID", "CANCELLED"]).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.customerCreditTitle.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    const amt =
      body.data.amount !== undefined
        ? body.data.amount
        : decToNum(existing.amount);
    let paid =
      body.data.paidAmount !== undefined
        ? body.data.paidAmount
        : decToNum(existing.paidAmount);
    let status = body.data.status ?? existing.status;

    if (status === "PAID") {
      paid = amt;
    }
    if (paid > amt + 1e-6) {
      return reply.status(400).send({ error: "Valor pago inválido" });
    }

    return prisma.customerCreditTitle.update({
      where: { id },
      data: {
        reference:
          body.data.reference === undefined ? undefined : body.data.reference,
        amount: body.data.amount ?? undefined,
        paidAmount: paid,
        issueDate: body.data.issueDate
          ? new Date(body.data.issueDate)
          : undefined,
        dueDate: body.data.dueDate ? new Date(body.data.dueDate) : undefined,
        notes: body.data.notes === undefined ? undefined : body.data.notes,
        status,
      },
    });
  });

  app.delete("/credit-titles/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.customerCreditTitle.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.customerCreditTitle.delete({ where: { id } });
    return reply.status(204).send();
  });

  /* --- Notificações (admin; mesmo modelo que no app do vendedor) --- */
  app.get("/notifications", async (req) => {
    const auth = req.auth!;
    return prisma.notification.findMany({
      where: { userId: auth.sub },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });

  app.get("/notifications/unread-count", async (req) => {
    const auth = req.auth!;
    const count = await prisma.notification.count({
      where: { userId: auth.sub, read: false },
    });
    return { count };
  });

  app.patch("/notifications/:id/read", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const n = await prisma.notification.findFirst({
      where: { id, userId: auth.sub },
    });
    if (!n) return reply.status(404).send({ error: "Não encontrado" });
    return prisma.notification.update({ where: { id }, data: { read: true } });
  });

  app.post("/notifications/read-all", async (req) => {
    const auth = req.auth!;
    await prisma.notification.updateMany({
      where: { userId: auth.sub, read: false },
      data: { read: true },
    });
    return { ok: true };
  });

  /** Envia notificação in-app + push para vendedores selecionados (ADMIN/MANAGER). */
  app.post("/notifications/send", async (req, reply) => {
    const auth = req.auth!;
    if (
      !(await canWriteEffective(auth.organizationId, auth.role, "broadcast"))
    ) {
      return reply
        .status(403)
        .send({ error: "Sem permissão para notificar vendedores" });
    }
    const body = z
      .object({
        sellerIds: z.array(z.string().min(1)).min(1).max(200),
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(2000),
      })
      .safeParse(req.body);
    if (!body.success) {
      return sendZodError(reply, body.error, req);
    }

    const sellers = await prisma.seller.findMany({
      where: {
        id: { in: body.data.sellerIds },
        ...sellerScopeWhere(auth),
        active: true,
      },
      select: { id: true, userId: true },
    });

    if (sellers.length === 0) {
      return reply
        .status(404)
        .send({ error: "Nenhum vendedor válido encontrado" });
    }
    if (sellers.length !== body.data.sellerIds.length) {
      return reply.status(400).send({
        error:
          "Um ou mais vendedores não existem, estão inativos ou fora do seu escopo",
      });
    }

    const userIds = sellers.map((s) => s.userId);
    await notifyUsers({
      userIds,
      title: body.data.title,
      body: body.data.body,
      type: "GENERIC",
    });

    return {
      ok: true,
      sent: userIds.length,
      sellerIds: sellers.map((s) => s.id),
    };
  });

  app.get("/push-vapid-public-key", async () => {
    const publicKey = getWebPushPublicKey();
    return { publicKey };
  });

  app.post("/push-devices", async (req, reply) => {
    const auth = req.auth!;
    const result = await handleRegisterPushDevice(auth.sub, req.body);
    if ("error" in result)
      return reply.status(result.status).send({
        error: result.error,
        issues: "issues" in result ? result.issues : undefined,
      });
    return result;
  });

  app.delete("/push-devices", async (req, reply) => {
    const auth = req.auth!;
    const result = await handleUnregisterPushDevice(auth.sub, req.body);
    if ("error" in result)
      return reply.status(result.status).send({
        error: result.error,
        issues: "issues" in result ? result.issues : undefined,
      });
    return result;
  });

  /* --- Pedidos (visão admin) --- */
  app.get("/orders", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({
        sellerId: z.string().optional(),
        status: z
          .enum(["DRAFT", "CONFIRMED", "CANCELLED", "PENDING_CREDIT_APPROVAL"])
          .optional(),
        situationId: z.string().optional(),
        situationCode: z.string().optional(),
        /** Número do pedido (apenas dígitos; inteiro positivo). */
        orderNumber: z.string().optional(),
        /** Alias de orderNumber. */
        q: z.string().optional(),
        city: z.string().optional(),
        tradeName: z.string().optional(),
        legalName: z.string().optional(),
        /** Alias de legalName (também busca em customer.name). */
        name: z.string().optional(),
        establishmentId: z.string().optional(),
      })
      .safeParse(req.query);

    const where: Prisma.OrderWhereInput = {
      ...orderScopeWhere(auth),
    };
    if (q.success) {
      if (q.data.sellerId) where.sellerId = q.data.sellerId;
      if (q.data.status) where.status = q.data.status as OrderStatus;
      if (q.data.establishmentId) where.establishmentId = q.data.establishmentId;
      if (q.data.situationId) where.situationId = q.data.situationId;
      if (q.data.situationCode) {
        const sid = await findOrgSituationId(
          auth.organizationId,
          q.data.situationCode.trim().toUpperCase(),
        );
        if (sid) where.situationId = sid;
      }

      const codeRaw = (q.data.orderNumber ?? q.data.q)?.trim();
      if (codeRaw) {
        if (!/^\d+$/.test(codeRaw)) {
          return reply.status(400).send({
            error: "Número do pedido deve conter apenas dígitos",
          });
        }
        const n = Number(codeRaw);
        if (!Number.isSafeInteger(n) || n < 1) {
          return reply.status(400).send({
            error: "Número do pedido deve ser um inteiro positivo",
          });
        }
        where.orderNumber = n;
      }

      const customerAnd: Prisma.CustomerWhereInput[] = [];
      const city = q.data.city?.trim();
      if (city) {
        customerAnd.push({
          city: { contains: city, mode: "insensitive" },
        });
      }
      const tradeName = q.data.tradeName?.trim();
      if (tradeName) {
        customerAnd.push({
          tradeName: { contains: tradeName, mode: "insensitive" },
        });
      }
      const legalTerm = (q.data.legalName ?? q.data.name)?.trim();
      if (legalTerm) {
        customerAnd.push({
          OR: [
            { legalName: { contains: legalTerm, mode: "insensitive" } },
            { name: { contains: legalTerm, mode: "insensitive" } },
          ],
        });
      }
      if (customerAnd.length === 1) {
        where.customer = customerAnd[0];
      } else if (customerAnd.length > 1) {
        where.customer = { AND: customerAnd };
      }
    }

    return prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        seller: { include: { user: { select: { name: true, email: true } } } },
        customer: true,
        establishment: {
          select: {
            id: true,
            legalName: true,
            tradeName: true,
            cnpj: true,
            isPrimary: true,
          },
        },
        situation: {
          select: {
            id: true,
            code: true,
            name: true,
            sortOrder: true,
            active: true,
            isSystem: true,
            mapsToCancel: true,
          },
        },
        items: { include: { product: true } },
        paymentCondition: {
          select: { id: true, name: true, days: true, sortOrder: true },
        },
        fiscalInvoices: {
          where: { direction: "OUTBOUND" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, number: true, series: true },
        },
      },
    });
  });

  app.get("/orders/pending-credit-summary", async (req) => {
    const auth = req.auth!;
    const count = await prisma.order.count({
      where: {
        ...orderScopeWhere(auth),
        status: "PENDING_CREDIT_APPROVAL",
      },
    });
    return { count };
  });

  app.get("/orders/lookups", async (req) => {
    const auth = req.auth!;
    const [sellers, customers, paymentConditions, priceTables] = await Promise.all([
      prisma.seller.findMany({
        where: { ...sellerScopeWhere(auth), active: true },
        select: { id: true, user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.customer.findMany({
        where: {
          organizationId: auth.organizationId,
          approvalStatus: "APPROVED",
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          tradeName: true,
          legalName: true,
          city: true,
          sellerId: true,
          regionId: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.paymentCondition.findMany({
        where: { organizationId: auth.organizationId, active: true },
        select: { id: true, code: true, name: true, days: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      }),
      prisma.priceTable.findMany({
        where: { organizationId: auth.organizationId },
        select: {
          id: true,
          name: true,
          customerId: true,
          sellerId: true,
          regionId: true,
          priority: true,
          validFrom: true,
          validTo: true,
        },
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      }),
    ]);
    return {
      sellers: sellers.map((s) => ({ id: s.id, name: s.user.name })),
      customers,
      paymentConditions,
      priceTables,
    };
  });

  app.get("/orders/catalog", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({
        sellerId: z.string().min(1),
        customerId: z.string().min(1).optional(),
        priceTableId: z.string().min(1).optional(),
      })
      .safeParse(req.query);
    if (!q.success) return sendZodError(reply, q.error, req);

    const seller = await prisma.seller.findFirst({
      where: { id: q.data.sellerId, ...sellerScopeWhere(auth) },
      select: { id: true },
    });
    if (!seller) return reply.status(400).send({ error: "Vendedor inválido" });

    let regionId: string | null = null;
    if (q.data.customerId) {
      const cust = await prisma.customer.findFirst({
        where: {
          id: q.data.customerId,
          organizationId: auth.organizationId,
        },
        select: { regionId: true },
      });
      if (!cust) return reply.status(400).send({ error: "Cliente inválido" });
      regionId = cust.regionId ?? null;
    }

    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { defaultMaxSellerDiscountPercent: true },
    });
    const defaultMaxSellerDisc = org
      ? decToNum(org.defaultMaxSellerDiscountPercent)
      : 50;

    const catalogIds = await listSellerCatalogProductIds(
      auth.organizationId,
      q.data.sellerId,
    );
    const rows = catalogIds.length
      ? await prisma.product.findMany({
          where: {
            organizationId: auth.organizationId,
            id: { in: catalogIds },
          },
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            imageUrl: true,
            stockQty: true,
            blockSaleWhenOutOfStock: true,
            maxSellerDiscountPercent: true,
            minSaleUnitPrice: true,
          },
        })
      : [];

    const at = new Date();
    const products = [];
    for (const p of rows) {
      const priced = await resolveEffectiveUnitPrice(auth.organizationId, p.id, {
        sellerId: q.data.sellerId,
        customerId: q.data.customerId ?? null,
        regionId,
        priceTableId: q.data.priceTableId ?? null,
        quantity: 1,
        at,
      });
      products.push({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        imageUrl: p.imageUrl,
        stockQty: p.stockQty,
        blockSaleWhenOutOfStock: p.blockSaleWhenOutOfStock,
        catalogUnitPrice: priced.catalogUnitPrice,
        effectiveUnitPrice: priced.effectiveUnitPrice,
        promotionLabel: priced.promotionLabel,
        maxSellerDiscountPercent:
          p.maxSellerDiscountPercent != null
            ? decToNum(p.maxSellerDiscountPercent)
            : null,
        minSaleUnitPrice:
          p.minSaleUnitPrice != null ? decToNum(p.minSaleUnitPrice) : null,
        maxSellerDiscountPercentEffective:
          p.maxSellerDiscountPercent != null
            ? decToNum(p.maxSellerDiscountPercent)
            : defaultMaxSellerDisc,
      });
    }
    products.sort((a, b) => a.name.localeCompare(b.name, "pt"));
    return { products };
  });

  app.post("/orders/preview", async (req, reply) => {
    const auth = req.auth!;
    if (
      !(await canWriteEffectiveForUser(
        auth.organizationId,
        auth.sub,
        auth.role,
        "orders",
      ))
    ) {
      return reply.status(403).send({ error: "Sem permissão para criar pedidos" });
    }
    const body = z
      .object({
        sellerId: z.string().min(1),
        customerId: z.string().min(1),
        priceTableId: z.string().min(1).optional(),
        items: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number().int().positive(),
              discountPercent: z.number().min(0).max(100).optional(),
            }),
          )
          .min(1),
      })
      .safeParse(req.body);
    if (!body.success) return sendZodError(reply, body.error, req);

    const seller = await prisma.seller.findFirst({
      where: { id: body.data.sellerId, ...sellerScopeWhere(auth) },
      select: { id: true },
    });
    if (!seller) return reply.status(400).send({ error: "Vendedor inválido" });

    const customer = await prisma.customer.findFirst({
      where: {
        id: body.data.customerId,
        organizationId: auth.organizationId,
      },
      select: { id: true },
    });
    if (!customer) return reply.status(400).send({ error: "Cliente inválido" });

    try {
      const allowedProductIds = await sellerAllowedProductIds(
        body.data.sellerId,
        auth.organizationId,
      );
      const sale = await computeSaleOrder({
        organizationId: auth.organizationId,
        sellerId: body.data.sellerId,
        customerId: body.data.customerId,
        priceTableId: body.data.priceTableId ?? null,
        items: body.data.items,
        allowedProductIds,
      });
      const credit = await evaluateOrderCredit({
        organizationId: auth.organizationId,
        customerId: body.data.customerId,
        proposedOrderTotal: sale.netTotal,
      });
      const creditCheck = await checkCustomer(
        auth.organizationId,
        body.data.customerId,
        sale.netTotal,
      );
      return { ...sale, credit: { ...credit, check: creditCheck } };
    } catch (e) {
      if (e instanceof OrderPricingError)
        return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.get("/orders/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const order = await prisma.order.findFirst({
      where: { id, ...orderScopeWhere(auth) },
      include: {
        seller: { include: { user: { select: { name: true, email: true } } } },
        customer: true,
        situation: {
          select: {
            id: true,
            code: true,
            name: true,
            sortOrder: true,
            active: true,
            isSystem: true,
            mapsToCancel: true,
          },
        },
        items: { include: { product: true } },
        paymentCondition: {
          select: { id: true, name: true, days: true, sortOrder: true },
        },
      },
    });
    if (!order) return reply.status(404).send({ error: "Não encontrado" });
    return order;
  });

  app.get("/orders/:id/pdf", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const scoped = orderScopeWhere(auth);
    const order = await loadOrderForPdf({ id, ...scoped });
    if (!order) return reply.status(404).send({ error: "Não encontrado" });
    return sendOrderPdfReply(reply, order);
  });

  app.get("/orders/:id/pdf-80mm", async (req, reply) => {
    const auth = req.auth!;
    const allowed = await canReadEffectiveForUser(
      auth.organizationId,
      auth.sub,
      auth.role,
      "orders_print_80mm",
    );
    if (!allowed) {
      return reply
        .status(403)
        .send({ error: "Sem permissão para imprimir pedido em layout 80mm" });
    }
    const { id } = idParam.parse(req.params);
    const scoped = orderScopeWhere(auth);
    const order = await loadOrderForPdf({ id, ...scoped });
    if (!order) return reply.status(404).send({ error: "Não encontrado" });
    return sendOrderPdf80mmReply(reply, order);
  });

  app.patch("/orders/:id/status", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        status: z.enum([
          "DRAFT",
          "CONFIRMED",
          "CANCELLED",
          "PENDING_CREDIT_APPROVAL",
        ]),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    try {
      const situationId = await situationIdForOrderStatus(
        auth.organizationId,
        body.data.status,
      );
      return await applyOrderStageChange({
        organizationId: auth.organizationId,
        orderId: id,
        situationId,
        actorUserId: auth.sub,
        auth,
      });
    } catch (e) {
      if (e instanceof OrderStageError) {
        return reply.status(e.httpStatus).send({ error: e.message });
      }
      if (e instanceof StockError)
        return reply.status(400).send(stockErrorPayload(e));
      throw e;
    }
  });

  app.patch("/orders/:id/situation", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        situationId: z.string().min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    try {
      return await applyOrderStageChange({
        organizationId: auth.organizationId,
        orderId: id,
        situationId: body.data.situationId,
        actorUserId: auth.sub,
        auth,
      });
    } catch (e) {
      if (e instanceof OrderStageError) {
        return reply.status(e.httpStatus).send({ error: e.message });
      }
      if (e instanceof StockError)
        return reply.status(400).send(stockErrorPayload(e));
      throw e;
    }
  });

  app.delete("/orders/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.order.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    try {
      if (existing.status === "CONFIRMED") {
        await applyStockOnStatusChange(
          id,
          existing.status,
          "CANCELLED",
          auth.sub,
        );
      }
    } catch (e) {
      if (e instanceof StockError)
        return reply.status(400).send(stockErrorPayload(e));
      throw e;
    }

    await prisma.order.delete({ where: { id } });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.DELETE,
      entityType: AUDIT_ENTITY.Order,
      entityId: id,
      metadata: {
        orderNumber: existing.orderNumber,
        status: existing.status,
      },
    });
    return reply.status(204).send();
  });

  app.post("/orders", async (req, reply) => {
    const auth = req.auth!;
    if (
      !(await canWriteEffectiveForUser(
        auth.organizationId,
        auth.sub,
        auth.role,
        "orders",
      ))
    ) {
      return reply.status(403).send({ error: "Sem permissão para criar pedidos" });
    }
    const body = z
      .object({
        sellerId: z.string().min(1),
        customerId: z.string().min(1),
        paymentConditionId: z.string().min(1),
        priceTableId: z.string().min(1).optional(),
        establishmentId: z.string().min(1).optional(),
        status: z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]).optional(),
        notes: z.string().optional(),
        items: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number().int().positive(),
              discountPercent: z.number().min(0).max(100).optional(),
            }),
          )
          .min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
      return sendZodError(reply, body.error, req);
    }

    const seller = await prisma.seller.findFirst({
      where: { id: body.data.sellerId, ...sellerScopeWhere(auth) },
      select: { id: true },
    });
    if (!seller) return reply.status(400).send({ error: "Vendedor inválido" });

    const customer = await prisma.customer.findFirst({
      where: {
        id: body.data.customerId,
        organizationId: auth.organizationId,
      },
      select: { id: true, approvalStatus: true, status: true },
    });
    if (!customer) return reply.status(400).send({ error: "Cliente inválido" });
    if (customer.approvalStatus === "PENDING") {
      return reply.status(400).send({
        error: "Cliente aguardando validação do escritório",
      });
    }
    if (customer.approvalStatus === "REJECTED") {
      return reply.status(400).send({ error: "Cadastro do cliente foi rejeitado" });
    }
    if (customer.approvalStatus !== "APPROVED") {
      return reply.status(400).send({ error: "Cliente inválido" });
    }

    try {
      return await createSaleOrder({
        organizationId: auth.organizationId,
        actorUserId: auth.sub,
        sellerId: body.data.sellerId,
        customerId: body.data.customerId,
        paymentConditionId: body.data.paymentConditionId,
        priceTableId: body.data.priceTableId ?? null,
        establishmentId: body.data.establishmentId,
        items: body.data.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          discountPercent: i.discountPercent,
        })),
        notes: body.data.notes,
        status: body.data.status,
        source: "admin",
        actorRole: auth.role,
        allowedProductIds: await sellerAllowedProductIds(
          body.data.sellerId,
          auth.organizationId,
        ),
      });
    } catch (e) {
      if (replySaleCreateError(reply, e)) return;
      throw e;
    }
  });

  /* --- Combos --- */
  app.get("/product-combos", async (req) => {
    const auth = req.auth!;
    return prisma.productCombo.findMany({
      where: { organizationId: auth.organizationId },
      include: {
        lines: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
      },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    });
  });

  app.post("/product-combos", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        name: z.string().min(1),
        label: z.string().nullable().optional(),
        active: z.boolean().optional(),
        validFrom: z.string().datetime().nullable().optional(),
        validTo: z.string().datetime().nullable().optional(),
        priority: z.number().int().optional(),
        kind: z.enum(["FIXED_PER_COMPLETE_SET", "PERCENT_OF_SET_SUBTOTAL"]),
        value: z.number().nonnegative(),
        lines: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number().int().positive(),
            }),
          )
          .min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const ids = [...new Set(body.data.lines.map((l) => l.productId))];
    const count = await prisma.product.count({
      where: { organizationId: auth.organizationId, id: { in: ids } },
    });
    if (count !== ids.length)
      return reply
        .status(400)
        .send({ error: "Um ou mais produtos são inválidos" });

    const d = body.data;
    const combo = await prisma.productCombo.create({
      data: {
        organizationId: auth.organizationId,
        name: d.name.trim(),
        label: d.label === undefined ? null : d.label,
        active: d.active ?? true,
        validFrom: d.validFrom ? new Date(d.validFrom) : null,
        validTo: d.validTo ? new Date(d.validTo) : null,
        priority: d.priority ?? 0,
        kind: d.kind,
        value: d.value,
        lines: {
          create: d.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          })),
        },
      },
      include: {
        lines: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
      },
    });
    return combo;
  });

  app.patch("/product-combos/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        label: z.string().nullable().optional(),
        active: z.boolean().optional(),
        validFrom: z.string().datetime().nullable().optional(),
        validTo: z.string().datetime().nullable().optional(),
        priority: z.number().int().optional(),
        kind: z
          .enum(["FIXED_PER_COMPLETE_SET", "PERCENT_OF_SET_SUBTOTAL"])
          .optional(),
        value: z.number().nonnegative().optional(),
        lines: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number().int().positive(),
            }),
          )
          .min(1)
          .optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.productCombo.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    const d = body.data;
    if (d.lines) {
      const ids = [...new Set(d.lines.map((l) => l.productId))];
      const cnt = await prisma.product.count({
        where: { organizationId: auth.organizationId, id: { in: ids } },
      });
      if (cnt !== ids.length)
        return reply
          .status(400)
          .send({ error: "Um ou mais produtos são inválidos" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.productCombo.update({
        where: { id },
        data: {
          name: d.name?.trim(),
          label: d.label === undefined ? undefined : d.label,
          active: d.active ?? undefined,
          validFrom:
            d.validFrom === undefined
              ? undefined
              : d.validFrom
                ? new Date(d.validFrom)
                : null,
          validTo:
            d.validTo === undefined
              ? undefined
              : d.validTo
                ? new Date(d.validTo)
                : null,
          priority: d.priority ?? undefined,
          kind: d.kind ?? undefined,
          value: d.value ?? undefined,
        },
      });
      if (d.lines) {
        await tx.productComboLine.deleteMany({ where: { comboId: id } });
        await tx.productComboLine.createMany({
          data: d.lines.map((line) => ({
            comboId: id,
            productId: line.productId,
            quantity: line.quantity,
          })),
        });
      }
    });

    return prisma.productCombo.findFirst({
      where: { id },
      include: {
        lines: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
      },
    });
  });

  app.delete("/product-combos/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.productCombo.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.productCombo.delete({ where: { id } });
    return reply.status(204).send();
  });

  /* --- Comissão variável por vendedor --- */
  app.get("/seller-commission-rules", async (req, reply) => {
    const auth = req.auth!;
    const q = z.object({ sellerId: z.string().min(1) }).safeParse(req.query);
    if (!q.success)
      return reply.status(400).send({ error: "Informe sellerId na query" });

    const seller = await prisma.seller.findFirst({
      where: { id: q.data.sellerId, organizationId: auth.organizationId },
    });
    if (!seller)
      return reply.status(404).send({ error: "Vendedor não encontrado" });

    return prisma.sellerCommissionRule.findMany({
      where: { organizationId: auth.organizationId, sellerId: q.data.sellerId },
      include: {
        product: { select: { id: true, name: true } },
        category: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  });

  app.post("/seller-commission-rules", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        sellerId: z.string(),
        productId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        commissionPercent: z.number().min(0).max(100),
        priority: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const d = body.data;
    const seller = await prisma.seller.findFirst({
      where: { id: d.sellerId, organizationId: auth.organizationId },
    });
    if (!seller) return reply.status(400).send({ error: "Vendedor inválido" });

    if (d.productId) {
      const p = await prisma.product.findFirst({
        where: { id: d.productId, organizationId: auth.organizationId },
      });
      if (!p) return reply.status(400).send({ error: "Produto inválido" });
    }
    if (d.categoryId) {
      const c = await prisma.productCategory.findFirst({
        where: { id: d.categoryId, organizationId: auth.organizationId },
      });
      if (!c) return reply.status(400).send({ error: "Categoria inválida" });
    }

    return prisma.sellerCommissionRule.create({
      data: {
        organizationId: auth.organizationId,
        sellerId: d.sellerId,
        productId: d.productId ?? null,
        categoryId: d.categoryId ?? null,
        commissionPercent: d.commissionPercent,
        priority: d.priority ?? 0,
        active: d.active ?? true,
      },
      include: {
        product: { select: { id: true, name: true } },
        category: { select: { id: true, code: true, name: true } },
      },
    });
  });

  app.patch("/seller-commission-rules/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        productId: z.string().nullable().optional(),
        categoryId: z.string().nullable().optional(),
        commissionPercent: z.number().min(0).max(100).optional(),
        priority: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.sellerCommissionRule.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    const d = body.data;
    if (d.productId) {
      const p = await prisma.product.findFirst({
        where: { id: d.productId, organizationId: auth.organizationId },
      });
      if (!p) return reply.status(400).send({ error: "Produto inválido" });
    }
    if (d.categoryId) {
      const c = await prisma.productCategory.findFirst({
        where: { id: d.categoryId, organizationId: auth.organizationId },
      });
      if (!c) return reply.status(400).send({ error: "Categoria inválida" });
    }

    return prisma.sellerCommissionRule.update({
      where: { id },
      data: {
        productId: d.productId === undefined ? undefined : d.productId,
        categoryId: d.categoryId === undefined ? undefined : d.categoryId,
        commissionPercent: d.commissionPercent ?? undefined,
        priority: d.priority ?? undefined,
        active: d.active ?? undefined,
      },
      include: {
        product: { select: { id: true, name: true } },
        category: { select: { id: true, code: true, name: true } },
      },
    });
  });

  app.delete("/seller-commission-rules/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.sellerCommissionRule.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.sellerCommissionRule.delete({ where: { id } });
    return reply.status(204).send();
  });

  /* --- Faixas de comissão progressiva (por faturamento MTD) --- */
  app.get("/commission-progressive-tiers", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({ sellerId: z.string().optional() })
      .safeParse(req.query);
    const where: Prisma.CommissionProgressiveTierWhereInput = {
      organizationId: auth.organizationId,
    };
    if (q.success && q.data.sellerId) where.sellerId = q.data.sellerId;
    return prisma.commissionProgressiveTier.findMany({
      where,
      orderBy: [{ sellerId: "asc" }, { thresholdAmount: "asc" }],
      include: {
        seller: { include: { user: { select: { name: true } } } },
      },
    });
  });

  app.post("/commission-progressive-tiers", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        sellerId: z.string().nullable().optional(),
        thresholdAmount: z.number().nonnegative(),
        commissionPercent: z.number().min(0).max(100),
        label: z.string().nullable().optional(),
        priority: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    const d = body.data;
    if (d.sellerId) {
      const s = await prisma.seller.findFirst({
        where: { id: d.sellerId, organizationId: auth.organizationId },
      });
      if (!s) return reply.status(400).send({ error: "Vendedor inválido" });
    }
    return prisma.commissionProgressiveTier.create({
      data: {
        organizationId: auth.organizationId,
        sellerId: d.sellerId ?? null,
        thresholdAmount: d.thresholdAmount,
        commissionPercent: d.commissionPercent,
        label: d.label ?? null,
        priority: d.priority ?? 0,
        active: d.active ?? true,
      },
    });
  });

  app.patch("/commission-progressive-tiers/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        sellerId: z.string().nullable().optional(),
        thresholdAmount: z.number().nonnegative().optional(),
        commissionPercent: z.number().min(0).max(100).optional(),
        label: z.string().nullable().optional(),
        priority: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.commissionProgressiveTier.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    const d = body.data;
    if (d.sellerId) {
      const s = await prisma.seller.findFirst({
        where: { id: d.sellerId, organizationId: auth.organizationId },
      });
      if (!s) return reply.status(400).send({ error: "Vendedor inválido" });
    }

    return prisma.commissionProgressiveTier.update({
      where: { id },
      data: {
        sellerId: d.sellerId === undefined ? undefined : d.sellerId,
        thresholdAmount: d.thresholdAmount ?? undefined,
        commissionPercent: d.commissionPercent ?? undefined,
        label: d.label === undefined ? undefined : d.label,
        priority: d.priority ?? undefined,
        active: d.active ?? undefined,
      },
    });
  });

  app.delete("/commission-progressive-tiers/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.commissionProgressiveTier.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.commissionProgressiveTier.delete({ where: { id } });
    return reply.status(204).send();
  });

  /* --- Metas mensais (vendedor / equipe / todos) --- */
  app.get("/seller-monthly-goals", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        sellerId: z.string().optional(),
        teamId: z.string().optional(),
        scope: z.enum(["SELLER", "TEAM", "ALL"]).optional(),
        year: z.coerce.number().int().optional(),
        month: z.coerce.number().int().min(1).max(12).optional(),
      })
      .safeParse(req.query);
    const where: Prisma.SellerMonthlyGoalWhereInput = {
      organizationId: auth.organizationId,
    };
    if (q.success) {
      if (q.data.sellerId) where.sellerId = q.data.sellerId;
      if (q.data.teamId) where.teamId = q.data.teamId;
      if (q.data.scope) where.scope = q.data.scope;
      if (q.data.year != null) where.year = q.data.year;
      if (q.data.month != null) where.month = q.data.month;
    }
    return prisma.sellerMonthlyGoal.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }, { scope: "asc" }],
      include: goalInclude,
    });
  });

  app.post("/seller-monthly-goals", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        scope: z.enum(["SELLER", "TEAM", "ALL"]).default("SELLER"),
        sellerId: z.string().optional(),
        teamId: z.string().optional(),
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        title: z.string().min(1).optional(),
        targetAmount: z.number().positive(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const d = body.data;
    let sellerId: string | null = null;
    let teamId: string | null = null;

    if (d.scope === "SELLER") {
      if (!d.sellerId)
        return reply.status(400).send({ error: "Vendedor obrigatório" });
      const seller = await prisma.seller.findFirst({
        where: { id: d.sellerId, organizationId: auth.organizationId },
      });
      if (!seller)
        return reply.status(400).send({ error: "Vendedor inválido" });
      sellerId = d.sellerId;
    } else if (d.scope === "TEAM") {
      if (!d.teamId)
        return reply.status(400).send({ error: "Equipe obrigatória" });
      const team = await prisma.salesTeam.findFirst({
        where: { id: d.teamId, organizationId: auth.organizationId },
      });
      if (!team) return reply.status(400).send({ error: "Equipe inválida" });
      teamId = d.teamId;
    }

    const scopeKey = buildGoalScopeKey(d.scope, sellerId, teamId);

    const goal = await prisma.sellerMonthlyGoal.upsert({
      where: {
        organizationId_scopeKey_year_month: {
          organizationId: auth.organizationId,
          scopeKey,
          year: d.year,
          month: d.month,
        },
      },
      create: {
        organizationId: auth.organizationId,
        scope: d.scope,
        scopeKey,
        sellerId,
        teamId,
        year: d.year,
        month: d.month,
        title: d.title?.trim() ?? "Meta do mês",
        targetAmount: d.targetAmount,
      },
      update: {
        title: d.title?.trim(),
        targetAmount: d.targetAmount,
      },
      include: goalInclude,
    });

    const userIds = await notifyUserIdsForGoal(auth.organizationId, goal);
    void notifySellerGoalUpdated({
      organizationId: auth.organizationId,
      goalId: goal.id,
      year: goal.year,
      month: goal.month,
      targetAmount: Number(goal.targetAmount),
      title: goal.title,
      userIds,
      sellerId: goal.sellerId,
      scope: goal.scope,
    });

    return goal;
  });

  app.patch("/seller-monthly-goals/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        title: z.string().min(1).optional(),
        targetAmount: z.number().positive().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.sellerMonthlyGoal.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    const goal = await prisma.sellerMonthlyGoal.update({
      where: { id },
      data: {
        title: body.data.title?.trim(),
        targetAmount: body.data.targetAmount ?? undefined,
      },
      include: goalInclude,
    });

    const userIds = await notifyUserIdsForGoal(auth.organizationId, goal);
    void notifySellerGoalUpdated({
      organizationId: auth.organizationId,
      goalId: goal.id,
      year: goal.year,
      month: goal.month,
      targetAmount: Number(goal.targetAmount),
      title: goal.title,
      userIds,
      sellerId: goal.sellerId,
      scope: goal.scope,
    });

    return goal;
  });

  app.delete("/seller-monthly-goals/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const existing = await prisma.sellerMonthlyGoal.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });
    await prisma.sellerMonthlyGoal.delete({ where: { id } });
    return reply.status(204).send();
  });

  /** Painel simples — vendas do dia, carteira “parada”, produtos sem giro, clientes sem compra. */
  app.get("/reports/insights", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply.status(403).send({
        error: "Relatórios avançados não disponíveis para líderes de equipe",
      });
    }
    return buildDistributorInsights(auth.organizationId);
  });

  /** Resumo matinal baseado em regras — 1 por org/dia (America/Sao_Paulo), lazy-generate. */
  app.get("/insights/morning-brief", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply.status(403).send({
        error: "Resumo da manhã não disponível para líderes de equipe",
      });
    }
    return getOrCreateMorningBrief(auth.organizationId);
  });

  app.get("/reports/scorecard", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .safeParse(req.query);
    let sellerIds: string[] | undefined;
    if (isTeamLeaderAuth(auth)) {
      sellerIds = await teamMemberSellerIds(auth.teamLeaderTeamId!);
    } else if (auth.role === "MANAGER") {
      const sellers = await prisma.seller.findMany({
        where: sellerScopeWhere(auth),
        select: { id: true },
      });
      sellerIds = sellers.map((s) => s.id);
    }
    return buildSalesScorecard({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      sellerIds,
    });
  });

  app.get("/reports/margin", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply.status(403).send({
        error: "Relatório de margem disponível apenas para admin/gestor",
      });
    }
    const q = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .safeParse(req.query);
    let sellerIds: string[] | undefined;
    if (auth.role === "MANAGER") {
      const sellers = await prisma.seller.findMany({
        where: sellerScopeWhere(auth),
        select: { id: true },
      });
      sellerIds = sellers.map((s) => s.id);
    }
    return buildMarginReport({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      sellerIds,
    });
  });

  app.get("/reports/financial-result", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply.status(403).send({
        error: "Resultado financeiro disponível apenas para admin/gestor",
      });
    }
    const allowedProfit = await canReadEffectiveForUser(
      auth.organizationId,
      auth.sub,
      auth.role,
      "reports_profit_percent",
    );
    if (!allowedProfit) {
      return reply
        .status(403)
        .send({ error: "Sem permissão para visualizar lucro e margem" });
    }
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sellerId: z.string().optional(),
        includeFixedCosts: z
          .union([z.literal("1"), z.literal("true"), z.literal("0")])
          .optional(),
        periodGroup: z.enum(["day", "week", "month"]).optional(),
      })
      .safeParse(req.query);
    let sellerIds: string[] | undefined;
    if (auth.role === "MANAGER") {
      const sellers = await prisma.seller.findMany({
        where: sellerScopeWhere(auth),
        select: { id: true },
      });
      sellerIds = sellers.map((s) => s.id);
    }
    if (q.success && q.data.sellerId) {
      sellerIds = sellerIds
        ? sellerIds.filter((id) => id === q.data.sellerId)
        : [q.data.sellerId];
    }
    return buildFinancialResult({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      sellerIds,
      includeFixedCosts:
        q.success &&
        (q.data.includeFixedCosts === "1" ||
          q.data.includeFixedCosts === "true"),
      periodGroup: (q.success ? q.data.periodGroup : undefined) as
        | FinancialPeriodGroup
        | undefined,
    });
  });

  app.get("/reports/financial-result.pdf", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply.status(403).send({
        error: "Resultado financeiro disponível apenas para admin/gestor",
      });
    }
    const allowedProfit = await canReadEffectiveForUser(
      auth.organizationId,
      auth.sub,
      auth.role,
      "reports_profit_percent",
    );
    if (!allowedProfit) {
      return reply
        .status(403)
        .send({ error: "Sem permissão para visualizar lucro e margem" });
    }
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sellerId: z.string().optional(),
        includeFixedCosts: z
          .union([z.literal("1"), z.literal("true"), z.literal("0")])
          .optional(),
        periodGroup: z.enum(["day", "week", "month"]).optional(),
      })
      .safeParse(req.query);
    let sellerIds: string[] | undefined;
    if (auth.role === "MANAGER") {
      const sellers = await prisma.seller.findMany({
        where: sellerScopeWhere(auth),
        select: { id: true },
      });
      sellerIds = sellers.map((s) => s.id);
    }
    if (q.success && q.data.sellerId) {
      sellerIds = sellerIds
        ? sellerIds.filter((id) => id === q.data.sellerId)
        : [q.data.sellerId];
    }
    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { displayName: true, name: true },
    });
    const pdf = await buildFinancialResultPdf({
      organizationId: auth.organizationId,
      orgName: org?.displayName || org?.name,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      sellerIds,
      includeFixedCosts:
        q.success &&
        (q.data.includeFixedCosts === "1" ||
          q.data.includeFixedCosts === "true"),
      periodGroup: (q.success ? q.data.periodGroup : undefined) as
        | FinancialPeriodGroup
        | undefined,
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="resultado-financeiro.pdf"',
      )
      .send(pdf);
  });

  app.get("/reports/commission-statement", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply
        .status(403)
        .send({ error: "Extrato de comissão disponível apenas para admin" });
    }
    const q = z
      .object({
        year: z.coerce.number().int().optional(),
        month: z.coerce.number().int().min(1).max(12).optional(),
      })
      .safeParse(req.query);
    return buildCommissionStatement({
      organizationId: auth.organizationId,
      year: q.success ? q.data.year : undefined,
      month: q.success ? q.data.month : undefined,
    });
  });

  app.get("/reports/stock-health", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply
        .status(403)
        .send({ error: "Relatório de estoque disponível apenas para admin" });
    }
    return buildStockHealthReport(auth.organizationId);
  });

  app.get("/reports/credit-aging", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply
        .status(403)
        .send({ error: "Aging de crédito disponível apenas para admin" });
    }
    return buildCreditAgingReport(auth.organizationId);
  });

  app.get("/reports/fiscal-reconciliation", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply
        .status(403)
        .send({ error: "Conciliação fiscal disponível apenas para admin" });
    }
    const q = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .safeParse(req.query);
    return buildFiscalReconciliation({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
    });
  });

  app.get("/reports/fiscal-outbound-summary", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply
        .status(403)
        .send({ error: "Resumo fiscal disponível apenas para admin" });
    }
    const q = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .safeParse(req.query);
    return buildFiscalOutboundSummary({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
    });
  });

  app.get("/reports/visit-effectiveness", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        conversionWindowDays: z.coerce.number().int().min(1).max(30).optional(),
      })
      .safeParse(req.query);
    let sellerIds: string[] | undefined;
    if (isTeamLeaderAuth(auth)) {
      sellerIds = await teamMemberSellerIds(auth.teamLeaderTeamId!);
    } else if (auth.role === "MANAGER") {
      const sellers = await prisma.seller.findMany({
        where: sellerScopeWhere(auth),
        select: { id: true },
      });
      sellerIds = sellers.map((s) => s.id);
    }
    return buildVisitEffectiveness({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      conversionWindowDays: q.success ? q.data.conversionWindowDays : undefined,
      sellerIds,
    });
  });

  async function scopedSellerIds(
    auth: AccessPayload,
  ): Promise<string[] | undefined> {
    if (isTeamLeaderAuth(auth)) {
      return teamMemberSellerIds(auth.teamLeaderTeamId!);
    }
    if (auth.role === "MANAGER") {
      const sellers = await prisma.seller.findMany({
        where: sellerScopeWhere(auth),
        select: { id: true },
      });
      return sellers.map((s) => s.id);
    }
    return undefined;
  }

  app.get("/reports/customer-abc", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sellerId: z.string().optional(),
      })
      .safeParse(req.query);
    const sellerIds = await scopedSellerIds(auth);
    let sellerId = q.success ? q.data.sellerId : undefined;
    if (sellerId && sellerIds && !sellerIds.includes(sellerId)) {
      sellerId = undefined;
    }
    return buildCustomerAbcReport({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      sellerId,
      sellerIds: sellerId ? undefined : sellerIds,
    });
  });

  app.get("/reports/customer-positivacao", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sellerId: z.string().optional(),
      })
      .safeParse(req.query);
    const sellerIds = await scopedSellerIds(auth);
    let sellerId = q.success ? q.data.sellerId : undefined;
    if (sellerId && sellerIds && !sellerIds.includes(sellerId)) {
      sellerId = undefined;
    }
    return buildCustomerPositivacaoReport({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      sellerId,
      sellerIds: sellerId ? undefined : sellerIds,
    });
  });

  app.get("/reports/portfolio-by-seller", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply.status(403).send({
        error: "Carteira por vendedor disponível apenas para admin/gestor",
      });
    }
    return buildPortfolioBySellerReport({
      organizationId: auth.organizationId,
    });
  });

  app.get("/reports/top-products", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sellerId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .safeParse(req.query);
    const sellerIds = await scopedSellerIds(auth);
    let sellerId = q.success ? q.data.sellerId : undefined;
    if (sellerId && sellerIds && !sellerIds.includes(sellerId)) {
      sellerId = undefined;
    }
    return buildTopProductsReport({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      sellerId,
      sellerIds: sellerId ? undefined : sellerIds,
      limit: q.success ? q.data.limit : undefined,
    });
  });

  app.get("/reports/product-positivacao", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sellerId: z.string().optional(),
        customerId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(2000).optional(),
      })
      .safeParse(req.query);
    const sellerIds = await scopedSellerIds(auth);
    let sellerId = q.success ? q.data.sellerId : undefined;
    if (sellerId && sellerIds && !sellerIds.includes(sellerId)) {
      sellerId = undefined;
    }
    return buildProductPositivacaoByCustomerReport({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      sellerId,
      sellerIds: sellerId ? undefined : sellerIds,
      customerId: q.success ? q.data.customerId : undefined,
      limit: q.success ? q.data.limit : undefined,
    });
  });

  app.get("/reports/commission-by-order", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply
        .status(403)
        .send({ error: "Comissões por pedido disponível apenas para admin" });
    }
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sellerId: z.string().optional(),
      })
      .safeParse(req.query);
    return buildCommissionByOrderReport({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      sellerId: q.success ? q.data.sellerId : undefined,
    });
  });

  app.get("/reports/invoiced-orders", async (req, reply) => {
    const auth = req.auth!;
    if (isTeamLeaderAuth(auth)) {
      return reply.status(403).send({
        error: "Pedidos faturados disponível apenas para admin/gestor",
      });
    }
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sellerId: z.string().optional(),
      })
      .safeParse(req.query);
    return buildInvoicedOrdersReport({
      organizationId: auth.organizationId,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      sellerId: q.success ? q.data.sellerId : undefined,
    });
  });

  app.get("/reports/team-summary", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        teamId: z.string().optional(),
      })
      .safeParse(req.query);

    let sellerIds: string[];
    let teamName: string | null = null;

    if (isTeamLeaderAuth(auth)) {
      const teamId = auth.teamLeaderTeamId!;
      sellerIds = await teamMemberSellerIds(teamId);
      const team = await getSalesTeam(auth.organizationId, teamId);
      teamName = team?.name ?? null;
    } else if (q.success && q.data.teamId) {
      const team = await getSalesTeam(auth.organizationId, q.data.teamId);
      if (!team)
        return reply.status(404).send({ error: "Equipe não encontrada" });
      sellerIds = team.members.map((m) => m.id);
      teamName = team.name;
    } else {
      return reply
        .status(400)
        .send({ error: "Informe teamId ou acesse como líder de equipe" });
    }

    return buildTeamSalesSummary({
      organizationId: auth.organizationId,
      sellerIds,
      teamName,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
    });
  });

  app.get("/reports/sales-by-supplier", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(20).optional(),
      })
      .safeParse(req.query);

    let sellerIds: string[] | undefined;
    if (auth.role === "MANAGER" || isTeamLeaderAuth(auth)) {
      const sellers = await prisma.seller.findMany({
        where: sellerScopeWhere(auth),
        select: { id: true },
      });
      sellerIds = sellers.map((s) => s.id);
    }

    return buildSalesBySupplier({
      organizationId: auth.organizationId,
      sellerIds,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      limit: q.success ? q.data.limit : undefined,
    });
  });

  /** Preferências de widgets do painel (leitura para admin/gestor/líder). */
  app.get("/reports/home-dashboard-config", async (req) => {
    const auth = req.auth!;
    const [org, sub] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: auth.organizationId },
        select: { homeIndicators: true },
      }),
      ensureOrgSubscription(auth.organizationId),
    ]);
    const homeIndicatorLimit = homeIndicatorLimitForPlan(sub.planId);
    const stored = parseHomeIndicators(org?.homeIndicators);
    return {
      homeIndicators: capHomeIndicators(stored, homeIndicatorLimit),
      homeIndicatorLimit,
      homeIndicatorsOverLimit:
        homeIndicatorLimit != null && stored.length > homeIndicatorLimit,
    };
  });

  /**
   * Atualiza a ordem/seleção dos widgets da home (`Organization.homeIndicators`).
   * Aceita lista parcial (ex.: líder sem rentabilidade): preserva keys omitidas no fim.
   */
  app.patch("/reports/home-dashboard-config", async (req, reply) => {
    const auth = req.auth!;
    const homeIndicatorKeySchema = z.enum(
      HOME_INDICATOR_KEYS as unknown as [
        HomeIndicatorKey,
        ...HomeIndicatorKey[],
      ],
    );
    const body = z
      .object({
        homeIndicators: z
          .array(homeIndicatorKeySchema)
          .min(1)
          .max(HOME_INDICATOR_KEYS.length),
      })
      .safeParse(req.body);
    if (!body.success) {
      return sendZodError(reply, body.error, req);
    }

    const [org, sub] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: auth.organizationId },
        select: { homeIndicators: true },
      }),
      ensureOrgSubscription(auth.organizationId),
    ]);
    const homeIndicatorLimit = homeIndicatorLimitForPlan(sub.planId);
    const current = parseHomeIndicators(org?.homeIndicators);
    const requested = parseHomeIndicators(body.data.homeIndicators);
    const requestedSet = new Set(requested);
    const merged = parseHomeIndicators([
      ...requested,
      ...current.filter((k) => !requestedSet.has(k)),
    ]);
    const persistError = persistHomeIndicatorsError({
      next: merged,
      current,
      limit: homeIndicatorLimit,
    });
    if (persistError) {
      return reply.status(400).send({ error: persistError });
    }

    const updated = await prisma.organization.update({
      where: { id: auth.organizationId },
      data: { homeIndicators: merged },
      select: { homeIndicators: true },
    });
    const stored = parseHomeIndicators(updated.homeIndicators);
    return {
      homeIndicators: capHomeIndicators(stored, homeIndicatorLimit),
      homeIndicatorLimit,
      homeIndicatorsOverLimit:
        homeIndicatorLimit != null && stored.length > homeIndicatorLimit,
    };
  });

  /** Ranking genérico para widgets configuráveis do painel. */
  app.get("/reports/home-indicator", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({
        key: z.enum(
          HOME_CHART_INDICATOR_KEYS as unknown as [
            HomeChartIndicatorKey,
            ...HomeChartIndicatorKey[],
          ],
        ),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(20).optional(),
        establishmentId: z.string().optional(),
      })
      .safeParse(req.query);
    if (!q.success)
      return reply.status(400).send({ error: "Parâmetros inválidos" });

    if (q.data.key.startsWith("profit_") && isTeamLeaderAuth(auth)) {
      return reply.status(403).send({
        error:
          "Indicadores de rentabilidade disponíveis apenas para admin/gestor",
      });
    }

    /** Espelha o limite do de–para da home (~2 anos). */
    const MAX_RANGE_MS = 730 * 24 * 60 * 60 * 1000;
    const fromDt = q.data.from ? new Date(q.data.from) : null;
    const toDt = q.data.to ? new Date(q.data.to) : null;
    if (
      (q.data.from && (!fromDt || Number.isNaN(fromDt.getTime()))) ||
      (q.data.to && (!toDt || Number.isNaN(toDt.getTime())))
    ) {
      return reply.status(400).send({ error: "Datas inválidas" });
    }
    if (fromDt && toDt) {
      if (toDt < fromDt) {
        return reply.status(400).send({
          error: "A data final deve ser maior ou igual à inicial",
        });
      }
      if (toDt.getTime() - fromDt.getTime() > MAX_RANGE_MS) {
        return reply.status(400).send({
          error: "Período máximo de 730 dias (cerca de 2 anos)",
        });
      }
    }

    let sellerIds: string[] | undefined;
    if (auth.role === "MANAGER" || isTeamLeaderAuth(auth)) {
      const sellers = await prisma.seller.findMany({
        where: sellerScopeWhere(auth),
        select: { id: true },
      });
      sellerIds = sellers.map((s) => s.id);
    }

    return buildHomeIndicator({
      organizationId: auth.organizationId,
      key: q.data.key,
      sellerIds,
      establishmentId: q.data.establishmentId,
      from: q.data.from,
      to: q.data.to,
      limit: q.data.limit,
    });
  });

  /* --- Relatório PDF --- */
  app.get("/reports/customers.pdf", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const situationEnum = z.enum([
      "blocked",
      "ok",
      "inactive",
      "no_quarter_positivacao",
    ]);
    const q = z
      .object({
        sellerId: z.string().optional(),
        customerId: z.string().optional(),
        situation: situationEnum.optional(),
        /** @deprecated use `situation` */
        creditStatus: z.enum(["blocked", "ok"]).optional(),
      })
      .passthrough()
      .safeParse(req.query);
    const filters = q.success ? q.data : {};
    const extras = readExtraParams(
      (q.success ? q.data : req.query) as Record<string, unknown>,
    );
    const pdf = await buildCustomersPdf({
      organizationId: auth.organizationId,
      sellerId: filters.sellerId,
      customerId: filters.customerId,
      situation: filters.situation,
      creditStatus: filters.creditStatus,
      extras,
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="relatorio-clientes.pdf"',
      )
      .send(pdf);
  });

  app.get("/reports/orders.pdf", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({
        sellerId: z.string().optional(),
        customerId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        status: z
          .enum(["DRAFT", "CONFIRMED", "CANCELLED", "PENDING_CREDIT_APPROVAL"])
          .optional(),
        situationId: z.string().optional(),
        romaneio: z
          .union([z.literal("1"), z.literal("true"), z.literal("0")])
          .optional(),
        includeProfitPercent: z
          .union([z.literal("1"), z.literal("true"), z.literal("0")])
          .optional(),
        /** Comma-separated or repeated query: orderIds=a,b or orderIds=a&orderIds=b */
        orderIds: z.union([z.string(), z.array(z.string())]).optional(),
      })
      .passthrough()
      .safeParse(req.query);
    const filters = q.success ? q.data : {};
    const extras = readExtraParams(
      (q.success ? q.data : req.query) as Record<string, unknown>,
    );
    const orderIdsRaw = filters.orderIds;
    const orderIds = orderIdsRaw
      ? (Array.isArray(orderIdsRaw) ? orderIdsRaw : orderIdsRaw.split(","))
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    const wantProfit =
      filters.includeProfitPercent === "1" ||
      filters.includeProfitPercent === "true";
    let includeProfitPercent = wantProfit;
    if (wantProfit) {
      const allowedProfit = await canReadEffectiveForUser(
        auth.organizationId,
        auth.sub,
        auth.role,
        "reports_profit_percent",
      );
      if (!allowedProfit) {
        return reply
          .status(403)
          .send({ error: "Sem permissão para incluir percentual de lucro" });
      }
    }
    const pdf = await buildOrdersPdf({
      organizationId: auth.organizationId,
      sellerId: filters.sellerId,
      customerId: filters.customerId,
      from: filters.from,
      to: filters.to,
      status: filters.status,
      situationId: filters.situationId,
      romaneio: filters.romaneio === "1" || filters.romaneio === "true",
      includeProfitPercent,
      orderIds: orderIds?.length ? orderIds : undefined,
      extras,
      scope: orderScopeWhere(auth),
    });
    const filename =
      filters.romaneio === "1" || filters.romaneio === "true"
        ? "relatorio-pedidos-romaneio.pdf"
        : "relatorio-pedidos.pdf";
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(pdf);
  });

  async function sendRouteRomaneioPdf(
    req: FastifyRequest,
    reply: FastifyReply,
    raw: {
      orderIds: string[];
      routeName?: string;
      driverName?: string;
    },
  ) {
    const auth = req.auth!;
    const requested = uniqueIdsPreserveOrder(raw.orderIds);
    if (requested.length === 0) {
      return reply.status(400).send({ error: "Selecione ao menos um pedido" });
    }
    const scoped = await prisma.order.findMany({
      where: { id: { in: requested }, ...orderScopeWhere(auth) },
      select: { id: true },
    });
    const allowed = new Set(scoped.map((o) => o.id));
    const orderIds = requested.filter((id) => allowed.has(id));
    if (orderIds.length === 0) {
      return reply
        .status(400)
        .send({ error: "Nenhum pedido encontrado para o romaneio" });
    }
    try {
      const pdf = await buildRouteRomaneioPdf({
        organizationId: auth.organizationId,
        orderIds,
        routeName: raw.routeName,
        driverName: raw.driverName,
      });
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", 'inline; filename="romaneio-rota.pdf"')
        .send(pdf);
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      return reply
        .status(err.statusCode ?? 500)
        .send({ error: err.message ?? "Falha ao gerar romaneio" });
    }
  }

  const routeRomaneioBody = z.object({
    orderIds: z.array(z.string()).min(1),
    routeName: z.string().max(120).optional(),
    driverName: z.string().max(120).optional(),
  });

  app.post("/reports/route-romaneio.pdf", async (req, reply) => {
    const body = routeRomaneioBody.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Selecione ao menos um pedido" });
    }
    return sendRouteRomaneioPdf(req, reply, body.data);
  });

  app.get("/reports/route-romaneio.pdf", async (req, reply) => {
    const q = z
      .object({
        orderIds: z.union([z.string(), z.array(z.string())]),
        routeName: z.string().max(120).optional(),
        driverName: z.string().max(120).optional(),
      })
      .safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: "Selecione ao menos um pedido" });
    }
    const orderIdsRaw = q.data.orderIds;
    const orderIds = (
      Array.isArray(orderIdsRaw) ? orderIdsRaw : orderIdsRaw.split(",")
    )
      .map((id) => id.trim())
      .filter(Boolean);
    return sendRouteRomaneioPdf(req, reply, {
      orderIds,
      routeName: q.data.routeName,
      driverName: q.data.driverName,
    });
  });

  app.get("/reports/order-items.pdf", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const q = z
      .object({
        sellerId: z.string().optional(),
        customerId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        status: z
          .enum(["DRAFT", "CONFIRMED", "CANCELLED", "PENDING_CREDIT_APPROVAL"])
          .optional(),
        situationId: z.string().optional(),
        groupItems: z
          .union([z.literal("1"), z.literal("true"), z.literal("0")])
          .optional(),
        /** Comma-separated or repeated query: orderIds=a,b or orderIds=a&orderIds=b */
        orderIds: z.union([z.string(), z.array(z.string())]).optional(),
      })
      .passthrough()
      .safeParse(req.query);
    const filters = q.success ? q.data : {};
    const extras = readExtraParams(
      (q.success ? q.data : req.query) as Record<string, unknown>,
    );
    const orderIdsRaw = filters.orderIds;
    const orderIds = orderIdsRaw
      ? (Array.isArray(orderIdsRaw) ? orderIdsRaw : orderIdsRaw.split(","))
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    const pdf = await buildOrderItemsPdf({
      organizationId: auth.organizationId,
      sellerId: filters.sellerId,
      customerId: filters.customerId,
      from: filters.from,
      to: filters.to,
      status: filters.status,
      situationId: filters.situationId,
      groupItems:
        filters.groupItems === "1" || filters.groupItems === "true",
      orderIds: orderIds?.length ? orderIds : undefined,
      extras,
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="relatorio-itens-pedidos.pdf"',
      )
      .send(pdf);
  });

  app.get("/reports/stock.pdf", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const q = z
      .object({
        supplierId: z.string().optional(),
        categoryId: z.string().optional(),
        q: z.string().optional(),
        productIds: z.string().optional(),
        stockValueBasis: z
          .enum(["none", "last_cost", "avg_sale", "default_sale"])
          .optional(),
      })
      .passthrough()
      .safeParse(req.query);
    const filters = q.success ? q.data : {};
    const extras = readExtraParams(
      (q.success ? q.data : req.query) as Record<string, unknown>,
    );
    const productIds = filters.productIds
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const pdf = await buildStockPdf({
      organizationId: auth.organizationId,
      supplierId: filters.supplierId,
      categoryId: filters.categoryId,
      q: filters.q,
      productIds: productIds?.length ? productIds : undefined,
      extras,
      stockValueBasis: filters.stockValueBasis,
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="relatorio-estoque.pdf"',
      )
      .send(pdf);
  });

  app.get("/reports/stock-count.pdf", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const q = z
      .object({
        supplierId: z.string().optional(),
        categoryId: z.string().optional(),
        q: z.string().optional(),
        productIds: z.string().optional(),
        stockSituation: z.enum(["with_stock", "all"]).optional(),
        sortBy: z.enum(["supplier", "name", "sku"]).optional(),
      })
      .passthrough()
      .safeParse(req.query);
    const filters = q.success ? q.data : {};
    const extras = readExtraParams(
      (q.success ? q.data : req.query) as Record<string, unknown>,
    );
    const productIds = filters.productIds
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const pdf = await buildStockCountPdf({
      organizationId: auth.organizationId,
      supplierId: filters.supplierId,
      categoryId: filters.categoryId,
      q: filters.q,
      productIds: productIds?.length ? productIds : undefined,
      extras,
      stockSituation: filters.stockSituation,
      sortBy: filters.sortBy,
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="lista-contagem-estoque.pdf"',
      )
      .send(pdf);
  });

  app.get("/reports/sales.pdf", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        sellerId: z.string().optional(),
        groupOrders: z
          .union([z.literal("1"), z.literal("true"), z.literal("0")])
          .optional(),
      })
      .safeParse(req.query);
    const filters = q.success ? q.data : {};
    const pdf = await buildSalesDetailedPdf({
      organizationId: auth.organizationId,
      sellerId: filters.sellerId,
      from: filters.from,
      to: filters.to,
      groupOrders:
        filters.groupOrders === "1" || filters.groupOrders === "true",
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="relatorio-vendas.pdf"',
      )
      .send(pdf);
  });

  const csvBodySchema = z.object({
    csvText: z.string().min(1, "CSV obrigatório."),
    columnMap: z.record(z.string(), z.string()).optional(),
    fieldDefaults: z.record(z.string(), z.string()).optional(),
  });

  const sendCsvTemplate = (
    reply: FastifyReply,
    filename: string,
    content: string,
  ) =>
    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(content);

  const importCsvError = (reply: FastifyReply, err: unknown) => {
    const message =
      err instanceof Error ? err.message : "Falha ao processar CSV.";
    return reply.status(400).send({ error: message });
  };

  app.get("/imports/products/template.csv", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { productCsvTemplate } = await import("@pedidos/shared");
    return sendCsvTemplate(reply, "produtos-modelo.csv", productCsvTemplate());
  });

  app.post("/imports/products/preview", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = csvBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message });
    }
    try {
      const { previewProductImport } = await import(
        "../services/imports/product-import.js"
      );
      return previewProductImport(
        auth.organizationId,
        body.data.csvText,
        body.data.columnMap,
      );
    } catch (err) {
      return importCsvError(reply, err);
    }
  });

  app.post("/imports/products/commit", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = csvBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message });
    }
    try {
      const { commitProductImport } = await import(
        "../services/imports/product-import.js"
      );
      const actor = await getActorAuditFields(auth.sub);
      return commitProductImport({
        organizationId: auth.organizationId,
        actorUserId: actor.userId,
        actorMatricula: actor.userMatricula,
        csvText: body.data.csvText,
        columnMap: body.data.columnMap,
      });
    } catch (err) {
      return importCsvError(reply, err);
    }
  });

  app.get("/imports/customers/template.csv", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { customerCsvTemplate } = await import("@pedidos/shared");
    return sendCsvTemplate(reply, "clientes-modelo.csv", customerCsvTemplate());
  });

  app.post("/imports/customers/preview", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = csvBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message });
    }
    try {
      const { previewCustomerImport } = await import(
        "../services/imports/customer-import.js"
      );
      return previewCustomerImport(
        auth.organizationId,
        body.data.csvText,
        body.data.columnMap,
        body.data.fieldDefaults,
      );
    } catch (err) {
      return importCsvError(reply, err);
    }
  });

  app.post("/imports/customers/commit", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = csvBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message });
    }
    try {
      const { commitCustomerImport } = await import(
        "../services/imports/customer-import.js"
      );
      const actor = await getActorAuditFields(auth.sub);
      return commitCustomerImport({
        organizationId: auth.organizationId,
        actorUserId: actor.userId,
        actorMatricula: actor.userMatricula,
        csvText: body.data.csvText,
        columnMap: body.data.columnMap,
        fieldDefaults: body.data.fieldDefaults,
      });
    } catch (err) {
      return importCsvError(reply, err);
    }
  });

  await app.register(fiscalRoutes, { prefix: "/fiscal" });
  await app.register(expeditionRoutes);
  await app.register(bankingAdminRoutes);
  await app.register(boletosAdminRoutes);
  const { establishmentRoutes } = await import("./establishments.js");
  await app.register(establishmentRoutes, { prefix: "/establishments" });
  const { aiIndicatorsRoutes } = await import("./ai-indicators.js");
  await app.register(aiIndicatorsRoutes, { prefix: "/ai" });
};
