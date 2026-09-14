import type { AccessPayload } from "../auth/jwt.js";
import { Prisma } from "@prisma/client";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { notifyAdminsCustomerPendingApproval } from "../services/admin-notifications.js";
import {
    AUDIT_ACTION,
    AUDIT_ENTITY,
    auditFromAuth,
} from "../services/audit-log.js";
import { buildAdminMobileRankingDashboard, buildSellerCommissionDashboard } from "../services/commission-dashboard.js";
import { teamMemberSellerIds } from "../auth/org-roles.js";
import { buildSellerCustomerCreditSnapshot } from "../services/credit.js";
import {
    createSaleOrder,
    findIdempotentSale,
    replySaleCreateError,
    sellerAllowedProductIds,
} from "../services/create-sale-order.js";
import {
    customerBodySchema,
    customerPatchSchema,
    parseCompleteCustomerBody,
    toCustomerPrismaData,
} from "../services/customer-validation.js";
import { nextCustomerCode } from "../services/customer-code.js";
import { isGoogleRoutesConfigured } from "../services/google-routes.js";
import { getWebPushPublicKey } from "../services/notify.js";
import {
    loadOrderForPdf,
    sendOrderPdf80mmReply,
    sendOrderPdfReply,
} from "../services/order-pdf-load.js";
import { resolveEffectiveUnitPrice } from "../services/price-resolve.js";
import { getProductStockLevels } from "../services/product-stock.js";
import { buildSalesByCustomerPdf } from "../services/reports/sales-by-customer-pdf.js";
import { buildSalesBySupplierPdf } from "../services/reports/sales-by-supplier-pdf.js";
import { buildSalesDetailedPdf } from "../services/reports/sales-pdf.js";
import { listSellerCatalogProductIds } from "../services/seller-product-catalog.js";
import {
    handleRegisterPushDevice,
    handleUnregisterPushDevice,
} from "../services/push-device-routes.js";
import { canReadEffective } from "../services/role-permissions.js";
import { buildRouteDirections } from "../services/route-directions.js";
import { greedyNearestRoute, haversineKm } from "../services/route-plan.js";
import { buildSalesBySupplier } from "../services/sales-by-supplier.js";
import {
    getCustomerRegistrationMode,
    getSellerShowUnassignedCustomers,
    sellerCustomerListWhere,
    sellerCustomerSellableWhere,
    mobileCustomerSellableWhere,
} from "../services/seller-customer-access.js";
import { recordSellerLocation } from "../services/seller-location-write.js";
import { decToNum } from "../util/money.js";
import {
    canAccessSellerApi,
    mobileOrderWhere,
    requireSellerActor,
} from "../util/mobile-seller-access.js";
import { resolveMobileReportSellerIds } from "../util/mobile-report-scope.js";
import { sendZodError } from "../util/zod-reply.js";

const idParam = z.object({ id: z.string().min(1) });

export const sellerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook(
    "preHandler",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.auth || !req.auth.organizationId?.trim()) {
        return reply.status(401).send({ error: "Não autorizado" });
      }
      if (!canAccessSellerApi(req.auth)) {
        return reply.status(403).send({ error: "Apenas vendedores" });
      }
    },
  );

  app.get("/", async () => ({ ok: true, scope: "seller" as const }));

  /** Marca da organização (somente leitura; escopo sempre `auth.organizationId`). */
  app.get("/organization/branding", async (req, reply) => {
    const auth = req.auth!;
    const org = await prisma.organization.findFirst({
      where: { id: auth.organizationId },
      select: {
        name: true,
        displayName: true,
        logoUrl: true,
        primaryColor: true,
      },
    });
    if (!org)
      return reply.status(404).send({ error: "Organização não encontrada" });
    return {
      displayName: org.displayName ?? org.name,
      logoUrl: org.logoUrl,
      primaryColor: org.primaryColor,
    };
  });

  /** Regras de sistema da org (sync de pedidos, etc.). */
  app.get("/organization/settings", async (req, reply) => {
    const auth = req.auth!;
    const org = await prisma.organization.findFirst({
      where: { id: auth.organizationId },
      select: {
        orderSyncMode: true,
        sellerShowUnassignedCustomers: true,
        customerRegistrationMode: true,
        sellerCanEditQueuedSales: true,
        autoInactivateCustomersAfterMonths: true,
      },
    });
    if (!org)
      return reply.status(404).send({ error: "Organização não encontrada" });
    return {
      orderSyncMode: org.orderSyncMode,
      sellerShowUnassignedCustomers: org.sellerShowUnassignedCustomers,
      customerRegistrationMode: org.customerRegistrationMode,
      sellerCanEditQueuedSales: org.sellerCanEditQueuedSales,
      autoInactivateCustomersAfterMonths:
        org.autoInactivateCustomersAfterMonths,
    };
  });

  app.get("/me", async (req) => {
    const auth = req.auth!;
    const user = await prisma.user.findUnique({
      where: { id: auth.sub },
      include: { seller: true },
    });
    return {
      id: user!.id,
      email: user!.email,
      name: user!.name,
      sellerId: auth.sellerId,
      commissionPercent: user!.seller
        ? decToNum(user!.seller.commissionPercent)
        : null,
    };
  });

  app.patch("/me", async (req, reply) => {
    const auth = req.auth!;
    const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    await prisma.user.update({
      where: { id: auth.sub },
      data: { name: body.data.name },
    });
    return { ok: true };
  });

  app.get("/commission-dashboard", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({
        year: z.coerce.number().int().min(2000).max(2100).optional(),
        month: z.coerce.number().int().min(1).max(12).optional(),
      })
      .safeParse(req.query);
    const ref =
      q.success && q.data.year != null && q.data.month != null
        ? new Date(q.data.year, q.data.month - 1, 12)
        : new Date();

    if (auth.role === "ADMIN") {
      return buildAdminMobileRankingDashboard(auth.organizationId, ref);
    }

    const sellerId = auth.sellerId;
    if (!sellerId) {
      return reply.status(403).send({
        error:
          "Comissão individual só está disponível para contas de vendedor.",
      });
    }

    const isTeamLeader = Boolean(auth.teamLeaderTeamId);
    const teamSellerIds = isTeamLeader
      ? await teamMemberSellerIds(auth.teamLeaderTeamId!)
      : undefined;

    return buildSellerCommissionDashboard(auth.organizationId, sellerId, ref, {
      rankingScope: isTeamLeader ? "team" : "none",
      teamSellerIds,
    });
  });

  app.get("/reports/sales-by-supplier", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
        scope: z.enum(["own", "team"]).optional(),
      })
      .safeParse(req.query);

    let sellerIds: string[] | undefined;
    try {
      ({ sellerIds } = await resolveMobileReportSellerIds(
        auth,
        q.success ? q.data.scope : undefined,
      ));
    } catch {
      return reply.status(403).send({ error: "Escopo de relatório inválido" });
    }

    return buildSalesBySupplier({
      organizationId: auth.organizationId,
      sellerIds,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      limit: q.success ? q.data.limit : undefined,
    });
  });

  const reportQuery = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    scope: z.enum(["own", "team"]).optional(),
  });

  async function resolveReportScope(
    auth: AccessPayload,
    scope: "own" | "team" | undefined,
    reply: FastifyReply,
  ) {
    try {
      return await resolveMobileReportSellerIds(auth, scope);
    } catch {
      void reply.status(403).send({ error: "Escopo de relatório inválido" });
      return null;
    }
  }

  /** Resumo de vendas (lista consolidada de pedidos confirmados). */
  app.get("/reports/sales-summary.pdf", async (req, reply) => {
    const auth = req.auth!;
    const q = reportQuery.safeParse(req.query);
    const resolved = await resolveReportScope(
      auth,
      q.success ? q.data.scope : undefined,
      reply,
    );
    if (!resolved) return;

    const pdf = await buildSalesDetailedPdf({
      organizationId: auth.organizationId,
      sellerIds: resolved.sellerIds,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      groupOrders: true,
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="resumo-vendas.pdf"',
      )
      .send(pdf);
  });

  /** Vendas agregadas por cliente. */
  app.get("/reports/sales-by-customer.pdf", async (req, reply) => {
    const auth = req.auth!;
    const q = reportQuery.safeParse(req.query);
    const resolved = await resolveReportScope(
      auth,
      q.success ? q.data.scope : undefined,
      reply,
    );
    if (!resolved) return;

    const pdf = await buildSalesByCustomerPdf({
      organizationId: auth.organizationId,
      sellerIds: resolved.sellerIds,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="vendas-por-cliente.pdf"',
      )
      .send(pdf);
  });

  /** Vendas por fornecedor. */
  app.get("/reports/sales-by-supplier.pdf", async (req, reply) => {
    const auth = req.auth!;
    const q = reportQuery.safeParse(req.query);
    const resolved = await resolveReportScope(
      auth,
      q.success ? q.data.scope : undefined,
      reply,
    );
    if (!resolved) return;

    const pdf = await buildSalesBySupplierPdf({
      organizationId: auth.organizationId,
      sellerIds: resolved.sellerIds,
      from: q.success ? q.data.from : undefined,
      to: q.success ? q.data.to : undefined,
      limit: 50,
    });
    return reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        'attachment; filename="vendas-por-fornecedor.pdf"',
      )
      .send(pdf);
  });

  app.get("/sales", async (req) => {
    const auth = req.auth!;
    return prisma.order.findMany({
      where: mobileOrderWhere(auth),
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        items: true,
        situation: {
          select: { id: true, code: true, name: true },
        },
      },
    });
  });

  app.get("/sales/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const order = await prisma.order.findFirst({
      where: {
        id,
        ...mobileOrderWhere(auth),
      },
      include: {
        customer: true,
        items: { include: { product: true } },
        situation: {
          select: { id: true, code: true, name: true },
        },
      },
    });
    if (!order) return reply.status(404).send({ error: "Não encontrado" });
    return order;
  });

  app.get("/sales/:id/pdf", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const order = await loadOrderForPdf({
      id,
      ...mobileOrderWhere(auth),
    });
    if (!order) return reply.status(404).send({ error: "Não encontrado" });
    return sendOrderPdfReply(reply, order);
  });

  app.get("/sales/:id/pdf-80mm", async (req, reply) => {
    const auth = req.auth!;
    const allowed = await canReadEffective(
      auth.organizationId,
      auth.role,
      "orders_print_80mm",
    );
    if (!allowed) {
      return reply
        .status(403)
        .send({ error: "Sem permissão para imprimir pedido em layout 80mm" });
    }
    const { id } = idParam.parse(req.params);
    const order = await loadOrderForPdf({
      id,
      ...mobileOrderWhere(auth),
    });
    if (!order) return reply.status(404).send({ error: "Não encontrado" });
    return sendOrderPdf80mmReply(reply, order);
  });

  app.get("/payment-conditions", async (req) => {
    const auth = req.auth!;
    let rows = await prisma.paymentCondition.findMany({
      where: { organizationId: auth.organizationId, active: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    if (rows.length === 0) {
      const defaults = [
        { code: "1", name: "A VISTA", days: 0, sortOrder: 1 },
        { code: "8", name: "BL 7 DIAS", days: 7, sortOrder: 2 },
        { code: "5", name: "BL 14 DIAS", days: 14, sortOrder: 3 },
        { code: "6", name: "BL 14/21 DIAS", days: 14, sortOrder: 4 },
        { code: "2", name: "BL 21 DIAS", days: 21, sortOrder: 5 },
        { code: "4", name: "BL 28 DIAS", days: 28, sortOrder: 6 },
        { code: "3", name: "BL 7/14 DIAS", days: 7, sortOrder: 7 },
        { code: "7", name: "BL 7/14/21 DIAS", days: 7, sortOrder: 8 },
      ];
      await prisma.paymentCondition.createMany({
        data: defaults.map((d) => ({
          organizationId: auth.organizationId,
          ...d,
        })),
        skipDuplicates: true,
      });
      rows = await prisma.paymentCondition.findMany({
        where: { organizationId: auth.organizationId, active: true },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      });
    }
    return rows;
  });

  app.post("/sales", async (req, reply) => {
    const auth = req.auth!;
    const sellerId = requireSellerActor(auth, reply);
    if (!sellerId) return;
    const body = z
      .object({
        customerId: z.string().min(1),
        paymentConditionId: z.string().min(1),
        establishmentId: z.string().min(1).optional(),
        operation: z.enum(["SALE"]).optional(),
        /** Idempotência — mesmo valor em replay devolve o mesmo pedido (offline queue). */
        clientMutationId: z.string().min(8).max(80).optional(),
        status: z.enum(["DRAFT", "CONFIRMED", "CANCELLED"]).optional(),
        notes: z.string().optional(),
        items: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number().int().positive(),
              /** Desconto extra do vendedor sobre o preço já promocional (limitado por produto/org). */
              discountPercent: z.number().min(0).max(100).optional(),
            }),
          )
          .min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const clientMutationId = body.data.clientMutationId?.trim();
    if (clientMutationId) {
      try {
        const dup = await findIdempotentSale({
          clientMutationId,
          organizationId: auth.organizationId,
          sellerId,
        });
        if (dup) return dup;
      } catch (e) {
        if (replySaleCreateError(reply, e)) return;
        throw e;
      }
    }

    const showUnassigned = await getSellerShowUnassignedCustomers(
      auth.organizationId,
    );
    const c = await prisma.customer.findFirst({
      where: {
        id: body.data.customerId,
        ...sellerCustomerSellableWhere(
          auth.organizationId,
          sellerId,
          showUnassigned,
        ),
      },
    });
    if (!c) {
      const pending = await prisma.customer.findFirst({
        where: {
          id: body.data.customerId,
          organizationId: auth.organizationId,
          sellerId,
          approvalStatus: { in: ["PENDING", "REJECTED"] },
        },
        select: { approvalStatus: true },
      });
      if (pending?.approvalStatus === "PENDING") {
        return reply.status(400).send({
          error: "Cliente aguardando validação do escritório",
        });
      }
      if (pending?.approvalStatus === "REJECTED") {
        return reply
          .status(400)
          .send({ error: "Cadastro do cliente foi rejeitado" });
      }
      return reply.status(400).send({ error: "Cliente inválido" });
    }

    try {
      return await createSaleOrder({
        organizationId: auth.organizationId,
        actorUserId: auth.sub,
        sellerId,
        customerId: body.data.customerId,
        paymentConditionId: body.data.paymentConditionId,
        establishmentId: body.data.establishmentId,
        items: body.data.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          discountPercent: i.discountPercent,
        })),
        notes: body.data.notes,
        status: body.data.status,
        operation: body.data.operation,
        clientMutationId,
        source: "seller",
        actorRole: auth.role,
        allowedProductIds: await sellerAllowedProductIds(
          sellerId,
          auth.organizationId,
        ),
      });
    } catch (e) {
      if (replySaleCreateError(reply, e)) return;
      throw e;
    }
  });

  app.get("/products", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({ customerId: z.string().optional() })
      .safeParse(req.query);
    const customerId = q.success ? q.data.customerId : undefined;

    const catalogIds =
      auth.role === "ADMIN"
        ? (
            await prisma.product.findMany({
              where: { organizationId: auth.organizationId },
              select: { id: true },
            })
          ).map((p) => p.id)
        : await listSellerCatalogProductIds(
            auth.organizationId,
            auth.sellerId!,
          );
    const products = catalogIds.length
      ? await prisma.product.findMany({
          where: {
            organizationId: auth.organizationId,
            id: { in: catalogIds },
          },
          include: {
            category: { select: { id: true, code: true, name: true } },
            supplier: {
              select: {
                id: true,
                code: true,
                tradeName: true,
                legalName: true,
                cnpj: true,
              },
            },
          },
        })
      : [];

    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { defaultMaxSellerDiscountPercent: true },
    });
    const defaultMaxSellerDisc = org
      ? decToNum(org.defaultMaxSellerDiscountPercent)
      : 50;

    let regionId: string | null = null;
    if (customerId) {
      if (auth.role === "ADMIN") {
        const cust = await prisma.customer.findFirst({
          where: { id: customerId, organizationId: auth.organizationId },
          select: { regionId: true },
        });
        regionId = cust?.regionId ?? null;
      } else {
        const showUnassigned = await getSellerShowUnassignedCustomers(
          auth.organizationId,
        );
        const cust = await prisma.customer.findFirst({
          where: {
            id: customerId,
            ...sellerCustomerSellableWhere(
              auth.organizationId,
              auth.sellerId!,
              showUnassigned,
            ),
          },
          select: { regionId: true },
        });
        regionId = cust?.regionId ?? null;
      }
    }

    const freqRows = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: {
          ...mobileOrderWhere(auth),
          status: { not: "CANCELLED" },
        },
      },
      _sum: { quantity: true },
    });
    const soldQtyMap = new Map<string, number>(
      freqRows.map((r) => [r.productId, r._sum.quantity ?? 0]),
    );

    const at = new Date();
    const out = [];
    for (const p of products) {
      const priced = await resolveEffectiveUnitPrice(
        auth.organizationId,
        p.id,
        {
          sellerId: auth.sellerId,
          customerId: customerId ?? null,
          regionId,
          quantity: 1,
          at,
        },
      );
      out.push({
        ...p,
        featured: Boolean(p.featured),
        catalogUnitPrice: priced.catalogUnitPrice,
        effectiveUnitPrice: priced.effectiveUnitPrice,
        promotionLabel: priced.promotionLabel,
        hasActivePromotion: Boolean(priced.promotionId),
        highlighted:
          Boolean(p.featured) || Boolean(priced.promotionId),
        soldQty: soldQtyMap.get(p.id) ?? 0,
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

    out.sort((a, b) => {
      const ha = a.highlighted ? 1 : 0;
      const hb = b.highlighted ? 1 : 0;
      if (hb !== ha) return hb - ha;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (a.hasActivePromotion !== b.hasActivePromotion)
        return a.hasActivePromotion ? -1 : 1;
      const dq = (b.soldQty ?? 0) - (a.soldQty ?? 0);
      if (dq !== 0) return dq;
      return a.name.localeCompare(b.name, "pt");
    });

    return out;
  });

  /** Estoque atual em lote — usado na pré-checagem antes de sincronizar a fila offline. */
  app.post("/products/stock-check", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        productIds: z.array(z.string().min(1)).min(1).max(500),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const products = await getProductStockLevels(
      auth.organizationId,
      body.data.productIds,
    );
    return { products };
  });

  app.get("/customers", async (req) => {
    const auth = req.auth!;
    if (auth.role === "ADMIN") {
      return prisma.customer.findMany({
        where: { organizationId: auth.organizationId },
        orderBy: { name: "asc" },
      });
    }
    const showUnassigned = await getSellerShowUnassignedCustomers(
      auth.organizationId,
    );
    return prisma.customer.findMany({
      where: sellerCustomerListWhere(
        auth.organizationId,
        auth.sellerId!,
        showUnassigned,
      ),
      orderBy: { name: "asc" },
    });
  });

  app.get("/customers/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    if (auth.role === "ADMIN") {
      const customer = await prisma.customer.findFirst({
        where: { id, organizationId: auth.organizationId },
      });
      if (!customer) return reply.status(404).send({ error: "Não encontrado" });
      return customer;
    }
    const showUnassigned = await getSellerShowUnassignedCustomers(
      auth.organizationId,
    );
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        ...sellerCustomerListWhere(
          auth.organizationId,
          auth.sellerId!,
          showUnassigned,
        ),
      },
    });
    if (!customer) return reply.status(404).send({ error: "Não encontrado" });
    return customer;
  });

  app.get("/customers/:id/credit", async (req, reply) => {
    const auth = req.auth!;
    const sellerId = requireSellerActor(auth, reply);
    if (!sellerId) return;
    const { id } = idParam.parse(req.params);
    const q = z
      .object({ previewAmount: z.coerce.number().nonnegative().optional() })
      .safeParse(req.query);
    try {
      return await buildSellerCustomerCreditSnapshot({
        organizationId: auth.organizationId,
        customerId: id,
        sellerId,
        previewAmount: q.success ? q.data.previewAmount : undefined,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "CLIENT_NOT_FOUND") {
        return reply.status(404).send({ error: "Não encontrado" });
      }
      throw e;
    }
  });

  app.post("/customers", async (req, reply) => {
    const auth = req.auth!;
    const sellerId = requireSellerActor(auth, reply);
    if (!sellerId) return;
    const body = customerBodySchema.safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const registrationMode = await getCustomerRegistrationMode(
      auth.organizationId,
    );
    const approvalStatus =
      registrationMode === "REQUIRE_APPROVAL" ? "PENDING" : "APPROVED";

    try {
      const created = await prisma.$transaction(async (tx) => {
        const code = await nextCustomerCode(tx, auth.organizationId);
        return tx.customer.create({
          data: {
            organizationId: auth.organizationId,
            code,
            sellerId,
            approvalStatus,
            ...(approvalStatus === "APPROVED"
              ? {
                  approvedAt: new Date(),
                  approvedByUserId: auth.sub,
                }
              : {}),
            ...toCustomerPrismaData(body.data),
          } as Prisma.CustomerUncheckedCreateInput,
        });
      });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.CREATE,
        entityType: AUDIT_ENTITY.Customer,
        entityId: created.id,
        metadata: {
          name: created.name,
          code: created.code,
          source: "seller",
          approvalStatus: created.approvalStatus,
        },
      });
      if (created.approvalStatus === "PENDING") {
        try {
          await notifyAdminsCustomerPendingApproval({
            organizationId: auth.organizationId,
            customer: { id: created.id, name: created.name },
          });
        } catch (e) {
          console.warn(
            "[notify] Falha ao alertar escritório (cliente pendente):",
            e,
          );
        }
      }
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
    const sellerId = requireSellerActor(auth, reply);
    if (!sellerId) return;
    const { id } = idParam.parse(req.params);
    const body = customerPatchSchema.safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existing = await prisma.customer.findFirst({
      where: {
        id,
        organizationId: auth.organizationId,
        sellerId,
      },
    });
    if (!existing) return reply.status(404).send({ error: "Não encontrado" });

    const merged = {
      name: body.data.name ?? existing.name,
      email: body.data.email !== undefined ? body.data.email : existing.email,
      phone: body.data.phone !== undefined ? body.data.phone : existing.phone,
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

    try {
      const updated = await prisma.customer.update({
        where: { id },
        data: toCustomerPrismaData(
          complete.data,
        ) as Prisma.CustomerUncheckedUpdateInput,
      });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.UPDATE,
        entityType: AUDIT_ENTITY.Customer,
        entityId: id,
        metadata: {
          name: updated.name,
          fields: Object.keys(body.data),
          source: "seller",
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

  type SellerVisitPayload = Prisma.SellerCustomerVisitGetPayload<{
    include: { customer: { select: { id: true; name: true } } };
  }>;

  function serializeSellerVisit(v: SellerVisitPayload) {
    const durationSeconds =
      v.checkedOutAt != null
        ? Math.round(
            (v.checkedOutAt.getTime() - v.checkedInAt.getTime()) / 1000,
          )
        : null;
    return {
      id: v.id,
      customerId: v.customerId,
      customerName: v.customer.name,
      checkedInAt: v.checkedInAt.toISOString(),
      checkedOutAt: v.checkedOutAt?.toISOString() ?? null,
      durationSeconds,
      secondsOpen:
        v.checkedOutAt == null
          ? Math.round((Date.now() - v.checkedInAt.getTime()) / 1000)
          : null,
      checkInLat: v.checkInLat != null ? decToNum(v.checkInLat) : null,
      checkInLng: v.checkInLng != null ? decToNum(v.checkInLng) : null,
      checkOutLat: v.checkOutLat != null ? decToNum(v.checkOutLat) : null,
      checkOutLng: v.checkOutLng != null ? decToNum(v.checkOutLng) : null,
      notes: v.notes,
    };
  }

  app.get("/route-plan/nearby", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({
        lat: z.coerce.number().gte(-90).lte(90),
        lng: z.coerce.number().gte(-180).lte(180),
        radiusKm: z.coerce.number().positive().max(500).optional(),
      })
      .safeParse(req.query);
    if (!q.success)
      return reply
        .status(400)
        .send({ error: "Informe lat e lng válidos na query" });

    const radiusKm = q.data.radiusKm ?? 80;
    const showUnassigned = await getSellerShowUnassignedCustomers(
      auth.organizationId,
    );

    const rows = await prisma.customer.findMany({
      where: {
        ...mobileCustomerSellableWhere(
          auth.organizationId,
          auth.sellerId,
          auth.role,
          showUnassigned,
        ),
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        addressNote: true,
        sellerId: true,
      },
    });

    const customers = rows
      .map((c) => {
        const plat = decToNum(c.latitude);
        const plng = decToNum(c.longitude);
        const distanceKm = haversineKm(q.data.lat, q.data.lng, plat, plng);
        return {
          id: c.id,
          name: c.name,
          latitude: plat,
          longitude: plng,
          addressNote: c.addressNote,
          distanceKm: Math.round(distanceKm * 100) / 100,
          assignedToMe: auth.sellerId != null && c.sellerId === auth.sellerId,
        };
      })
      .filter((x) => x.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      origin: { lat: q.data.lat, lng: q.data.lng },
      radiusKm,
      customers,
      roadRoutingConfigured: isGoogleRoutesConfigured(),
      disclaimerAirKm:
        "Distâncias em linha reta (km). Toque «Rota por estrada» para traçado pelas vias (Google Routes).",
    };
  });

  app.post("/route-plan/optimize-order", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        originLat: z.number().gte(-90).lte(90),
        originLng: z.number().gte(-180).lte(180),
        customerIds: z.array(z.string()).min(1).max(24),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const showUnassigned = await getSellerShowUnassignedCustomers(
      auth.organizationId,
    );
    const rows = await prisma.customer.findMany({
      where: {
        id: { in: body.data.customerIds },
        ...mobileCustomerSellableWhere(
          auth.organizationId,
          auth.sellerId,
          auth.role,
          showUnassigned,
        ),
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    });

    const missingCoords = body.data.customerIds.filter(
      (cid) => !rows.some((r) => r.id === cid),
    );
    if (missingCoords.length > 0) {
      return reply.status(400).send({
        error:
          "Todos os clientes precisam existir e ter latitude/longitude cadastradas.",
        missingCustomerIds: missingCoords,
      });
    }

    const stops = rows.map((r) => ({
      id: r.id,
      lat: decToNum(r.latitude),
      lng: decToNum(r.longitude),
    }));

    const route = greedyNearestRoute(
      body.data.originLat,
      body.data.originLng,
      stops,
    );

    const orderedCustomers = route.orderedIds.map((oid) => {
      const r = rows.find((x) => x.id === oid)!;
      return {
        id: r.id,
        name: r.name,
        latitude: decToNum(r.latitude),
        longitude: decToNum(r.longitude),
      };
    });

    return {
      heuristic: "nearest_neighbor_air_distance",
      orderedCustomerIds: route.orderedIds,
      legKm: route.legKm,
      totalKmApprox: route.totalKm,
      orderedCustomers,
    };
  });

  app.post("/route-plan/directions", async (req, reply) => {
    const auth = req.auth!;
    const body = z
      .object({
        originLat: z.number().gte(-90).lte(90),
        originLng: z.number().gte(-180).lte(180),
        customerIds: z.array(z.string()).min(1).max(24),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const showUnassigned = await getSellerShowUnassignedCustomers(
      auth.organizationId,
    );
    const rows = await prisma.customer.findMany({
      where: {
        id: { in: body.data.customerIds },
        ...mobileCustomerSellableWhere(
          auth.organizationId,
          auth.sellerId,
          auth.role,
          showUnassigned,
        ),
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    });

    const missingCoords = body.data.customerIds.filter(
      (cid) => !rows.some((r) => r.id === cid),
    );
    if (missingCoords.length > 0) {
      return reply.status(400).send({
        error:
          "Todos os clientes precisam existir e ter latitude/longitude cadastradas.",
        missingCustomerIds: missingCoords,
      });
    }

    const customers = rows.map((r) => ({
      id: r.id,
      name: r.name,
      latitude: decToNum(r.latitude),
      longitude: decToNum(r.longitude),
    }));

    const result = await buildRouteDirections(
      auth.organizationId,
      body.data.originLat,
      body.data.originLng,
      customers,
    );

    return {
      ...result,
      totalKmApprox: result.totalKm,
    };
  });

  app.get("/visits/active", async (req) => {
    const auth = req.auth!;
    if (!auth.sellerId) return null;
    const v = await prisma.sellerCustomerVisit.findFirst({
      where: { sellerId: auth.sellerId, checkedOutAt: null },
      orderBy: { checkedInAt: "desc" },
      include: { customer: { select: { id: true, name: true } } },
    });
    return v ? serializeSellerVisit(v) : null;
  });

  app.get("/visits/recent", async (req) => {
    const auth = req.auth!;
    if (!auth.sellerId) return [];
    const q = z
      .object({ limit: z.coerce.number().int().min(1).max(100).optional() })
      .safeParse(req.query);
    const limit = q.success ? (q.data.limit ?? 40) : 40;
    const rows = await prisma.sellerCustomerVisit.findMany({
      where: { sellerId: auth.sellerId },
      orderBy: { checkedInAt: "desc" },
      take: limit,
      include: { customer: { select: { id: true, name: true } } },
    });
    return rows.map(serializeSellerVisit);
  });

  app.post("/visits/check-in", async (req, reply) => {
    const auth = req.auth!;
    const sellerId = requireSellerActor(auth, reply);
    if (!sellerId) return;
    const body = z
      .object({
        customerId: z.string().min(1),
        latitude: z.number().gte(-90).lte(90).optional(),
        longitude: z.number().gte(-180).lte(180).optional(),
        notes: z.string().max(1000).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const existingOpen = await prisma.sellerCustomerVisit.findFirst({
      where: { sellerId, checkedOutAt: null },
    });
    if (existingOpen) {
      return reply.status(409).send({
        error:
          "Já existe uma visita em aberto. Faça check-out antes de iniciar outra.",
        activeVisitId: existingOpen.id,
      });
    }

    const showUnassigned = await getSellerShowUnassignedCustomers(
      auth.organizationId,
    );
    const cust = await prisma.customer.findFirst({
      where: {
        id: body.data.customerId,
        ...sellerCustomerSellableWhere(
          auth.organizationId,
          sellerId,
          showUnassigned,
        ),
      },
      select: { id: true },
    });
    if (!cust)
      return reply.status(404).send({ error: "Cliente não encontrado" });

    const visit = await prisma.sellerCustomerVisit.create({
      data: {
        organizationId: auth.organizationId,
        sellerId,
        customerId: body.data.customerId,
        notes: body.data.notes,
        checkInLat: body.data.latitude,
        checkInLng: body.data.longitude,
      },
      include: { customer: { select: { id: true, name: true } } },
    });

    return serializeSellerVisit(visit);
  });

  app.patch("/visits/:id/check-out", async (req, reply) => {
    const auth = req.auth!;
    const sellerId = requireSellerActor(auth, reply);
    if (!sellerId) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        latitude: z.number().gte(-90).lte(90).optional(),
        longitude: z.number().gte(-180).lte(180).optional(),
        notes: z.string().max(1000).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const visit = await prisma.sellerCustomerVisit.findFirst({
      where: {
        id,
        sellerId,
        organizationId: auth.organizationId,
      },
      include: { customer: { select: { id: true, name: true } } },
    });
    if (!visit) return reply.status(404).send({ error: "Não encontrado" });
    if (visit.checkedOutAt)
      return reply.status(400).send({ error: "Esta visita já foi encerrada" });

    const updated = await prisma.sellerCustomerVisit.update({
      where: { id },
      data: {
        checkedOutAt: new Date(),
        checkOutLat: body.data.latitude,
        checkOutLng: body.data.longitude,
        ...(body.data.notes !== undefined
          ? {
              notes: visit.notes
                ? `${visit.notes}\n---\n${body.data.notes}`
                : body.data.notes,
            }
          : {}),
      },
      include: { customer: { select: { id: true, name: true } } },
    });

    return serializeSellerVisit(updated);
  });

  app.post("/location", async (req, reply) => {
    const auth = req.auth!;
    const sellerId = requireSellerActor(auth, reply);
    if (!sellerId) return;
    const body = z
      .object({
        latitude: z.number().gte(-90).lte(90),
        longitude: z.number().gte(-180).lte(180),
        accuracyMeters: z.number().positive().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const result = await recordSellerLocation({
      sellerId,
      organizationId: auth.organizationId,
      latitude: body.data.latitude,
      longitude: body.data.longitude,
      accuracyMeters: body.data.accuracyMeters,
    });

    return { ok: true, recordedAt: result.recordedAt };
  });

  app.get("/notifications", async (req) => {
    const auth = req.auth!;
    return prisma.notification.findMany({
      where: { userId: auth.sub },
      orderBy: { createdAt: "desc" },
    });
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
};
