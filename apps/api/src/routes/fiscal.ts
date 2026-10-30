import type { Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth/org-roles.js";
import { prisma } from "../db.js";
import { sendZodError } from "../util/zod-reply.js";
import { certificateStatus, parsePfxMetadata } from "../fiscal/certificate.js";
import { parseLogoUpload } from "../fiscal/danfe-logo.js";
import { encryptBuffer, encryptSecret } from "../fiscal/encryption.js";
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  auditFromAuth,
} from "../services/audit-log.js";
import {
  cancelInboundInvoice,
  confirmInboundImport,
  importInboundNfeXml,
  listInboundPending,
  manifestInboundNfe,
  syncInboundDfe,
} from "../services/fiscal-inbound.js";
import { sendFiscalInvoiceEmail } from "../services/fiscal-invoice-email.js";
import {
  buildOutboundInvoiceFromOrder,
  cancelOutboundInvoice,
  consultOutboundInvoiceSituation,
  inutilizarNumeracao,
  listEligibleOutboundOrders,
  sendCartaCorrecao,
  transmitOutboundInvoice,
  updateOutboundInvoiceTransport,
} from "../services/fiscal-outbound.js";
import {
  importFiscalCatalogFromDir,
  resolveFiscalCatalogCode,
  searchFiscalCatalog,
} from "../services/fiscal/fiscal-catalog.js";
import { explainSefazRejection } from "../fiscal/sefaz-rejection-hints.js";
import { isFiscalCatalogType } from "@pedidos/shared";
import {
  enqueueFiscalTransmit,
  requeueFiscalTransmit,
} from "../services/fiscal-transmit-queue.js";
import {
  loadInvoiceForDanfe,
  sendDanfePdfReply,
} from "../services/nfe-danfe-load.js";
import {
  assertEstablishmentPermission,
  getEstablishmentInOrg,
  getPrimaryEstablishment,
  toSettingsPayload,
  updateEstablishment,
  EstablishmentError,
} from "../services/establishments.js";

const idParam = z.object({ id: z.string().min(1) });

function outboundInvoiceSearchWhere(
  organizationId: string,
  searchRaw?: string,
): Prisma.FiscalInvoiceWhereInput {
  const where: Prisma.FiscalInvoiceWhereInput = {
    organizationId,
    direction: "OUTBOUND",
  };
  const search = searchRaw?.trim();
  if (!search) return where;

  const digits = search.replace(/\D/g, "");
  const or: Prisma.FiscalInvoiceWhereInput[] = [
    {
      order: {
        customer: { name: { contains: search, mode: "insensitive" } },
      },
    },
    {
      order: {
        customer: { tradeName: { contains: search, mode: "insensitive" } },
      },
    },
    {
      order: {
        customer: { legalName: { contains: search, mode: "insensitive" } },
      },
    },
    { order: { id: { contains: search, mode: "insensitive" } } },
  ];

  if (digits) {
    const asNum = Number(digits);
    if (Number.isFinite(asNum) && digits.length <= 9) {
      or.push({ number: asNum });
      or.push({ order: { orderNumber: asNum } });
    }
    or.push({ accessKey: { contains: digits } });
  }

  where.OR = or;
  return where;
}


async function resolveFiscalEstablishment(
  organizationId: string,
  establishmentId?: string | null,
) {
  if (establishmentId?.trim()) {
    return getEstablishmentInOrg(organizationId, establishmentId.trim());
  }
  return getPrimaryEstablishment(organizationId);
}

export const fiscalRoutes: FastifyPluginAsync = async (app) => {
  app.get("/settings", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({ establishmentId: z.string().optional() })
      .safeParse(req.query);
    const establishmentId = q.success ? q.data.establishmentId : undefined;
    const config = await resolveFiscalEstablishment(
      auth.organizationId,
      establishmentId,
    );
    if (!config) {
      return {
        configured: false,
        autoStockOnInboundInvoice: false,
      };
    }
    try {
      assertEstablishmentPermission({
        role: auth.role,
        allowedEstablishmentIds: (
          await prisma.user.findUnique({
            where: { id: auth.sub },
            select: { allowedEstablishmentIds: true },
          })
        )?.allowedEstablishmentIds,
        establishmentId: config.id,
      });
    } catch (e) {
      if (e instanceof EstablishmentError) {
        return reply.status(e.httpStatus).send({ error: e.message, code: e.code });
      }
      throw e;
    }
    const cert = certificateStatus(config.certificateExpiresAt);
    return {
      ...toSettingsPayload(config),
      certificate: {
        uploaded: Boolean(config.certificatePfxEncrypted),
        cnpj: config.certificateCnpj,
        expiresAt: config.certificateExpiresAt,
        ...cert,
      },
    };
  });

  app.put("/settings", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = z
      .object({
        establishmentId: z.string().optional(),
        legalName: z.string().optional(),
        tradeName: z.string().optional(),
        cnpj: z.string().optional(),
        stateRegistration: z.string().optional(),
        municipalRegistration: z.string().optional(),
        taxRegime: z
          .enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"])
          .optional(),
        uf: z.string().max(2).optional(),
        cityIbge: z.string().optional(),
        street: z.string().optional(),
        addressNumber: z.string().optional(),
        complement: z.string().optional(),
        district: z.string().optional(),
        city: z.string().optional(),
        zipCode: z.string().optional(),
        nfeEnvironment: z.enum(["HOMOLOGATION", "PRODUCTION"]).optional(),
        nfeSeries: z.number().int().positive().optional(),
        contingencyEnabled: z.boolean().optional(),
        nfeAdditionalInfo: z.string().max(5000).nullable().optional(),
        autoStockOnInboundInvoice: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const { establishmentId, ...fields } = body.data;
    const target = await resolveFiscalEstablishment(
      auth.organizationId,
      establishmentId,
    );
    if (!target) {
      return reply.status(400).send({ error: "Estabelecimento não encontrado" });
    }
    try {
      const config = await updateEstablishment(
        auth.organizationId,
        target.id,
        fields,
      );
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.FISCAL_SETTINGS,
        entityType: AUDIT_ENTITY.FiscalConfig,
        entityId: config.id,
        metadata: { fields: Object.keys(fields) },
      });
      return config;
    } catch (e) {
      if (e instanceof EstablishmentError) {
        return reply.status(e.httpStatus).send({ error: e.message, code: e.code });
      }
      throw e;
    }
  });

  app.post("/certificate", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = z
      .object({
        establishmentId: z.string().optional(),
        pfxBase64: z.string().min(1),
        password: z.string().min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const target = await resolveFiscalEstablishment(
      auth.organizationId,
      body.data.establishmentId,
    );
    if (!target) {
      return reply.status(400).send({ error: "Estabelecimento não encontrado" });
    }

    let pfx: Buffer;
    try {
      pfx = Buffer.from(body.data.pfxBase64, "base64");
    } catch {
      return reply.status(400).send({ error: "Arquivo PFX inválido" });
    }

    const meta = parsePfxMetadata(pfx, body.data.password);

    let encryptedPfx: Buffer;
    let encryptedPassword: string;
    try {
      encryptedPfx = encryptBuffer(pfx);
      encryptedPassword = encryptSecret(body.data.password);
    } catch (e) {
      return reply.status(500).send({
        error:
          e instanceof Error ? e.message : "Falha ao criptografar certificado",
      });
    }

    await prisma.establishment.update({
      where: { id: target.id },
      data: {
        certificatePfxEncrypted: new Uint8Array(encryptedPfx),
        certificatePasswordEncrypted: encryptedPassword,
        certificateExpiresAt: meta.expiresAt,
        certificateCnpj: meta.cnpj,
        certificateLastAlertThreshold: null,
      },
    });

    await auditFromAuth(auth, {
      action: AUDIT_ACTION.FISCAL_CERTIFICATE,
      entityType: AUDIT_ENTITY.FiscalConfig,
      entityId: target.id,
      metadata: {
        certificateCnpj: meta.cnpj,
        expiresAt: meta.expiresAt ? meta.expiresAt.toISOString() : null,
      },
    });

    return { ok: true, certificate: meta, establishmentId: target.id };
  });

  app.get("/logo", async (req, reply) => {
    const auth = req.auth!;
    const q = z
      .object({ establishmentId: z.string().optional() })
      .safeParse(req.query);
    const config = await resolveFiscalEstablishment(
      auth.organizationId,
      q.success ? q.data.establishmentId : undefined,
    );
    if (!config?.danfeLogoBytes?.length) {
      return reply.status(404).send({ error: "Logo não configurada" });
    }
    return reply
      .header("Content-Type", config.danfeLogoMimeType ?? "image/png")
      .header("Cache-Control", "private, max-age=300")
      .send(Buffer.from(config.danfeLogoBytes));
  });

  app.post("/logo", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = z
      .object({
        establishmentId: z.string().optional(),
        imageBase64: z.string().min(1),
        mimeType: z.string().min(1),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }

    const target = await resolveFiscalEstablishment(
      auth.organizationId,
      body.data.establishmentId,
    );
    if (!target) {
      return reply.status(400).send({ error: "Estabelecimento não encontrado" });
    }

    const parsed = parseLogoUpload(body.data.imageBase64, body.data.mimeType);
    if (!parsed) {
      return reply.status(400).send({
        error: "Imagem inválida. Use PNG, JPEG, WebP ou GIF com até 512 KB.",
      });
    }

    await prisma.establishment.update({
      where: { id: target.id },
      data: {
        danfeLogoBytes: new Uint8Array(parsed.buffer),
        danfeLogoMimeType: parsed.mimeType,
      },
    });

    await auditFromAuth(auth, {
      action: AUDIT_ACTION.FISCAL_LOGO,
      entityType: AUDIT_ENTITY.FiscalConfig,
      entityId: target.id,
      metadata: { mimeType: parsed.mimeType, op: "upload" },
    });

    return { ok: true, mimeType: parsed.mimeType };
  });

  app.delete("/logo", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const q = z
      .object({ establishmentId: z.string().optional() })
      .safeParse(req.query);
    const target = await resolveFiscalEstablishment(
      auth.organizationId,
      q.success ? q.data.establishmentId : undefined,
    );
    if (!target) {
      return reply.status(400).send({ error: "Estabelecimento não encontrado" });
    }
    await prisma.establishment.update({
      where: { id: target.id },
      data: { danfeLogoBytes: null, danfeLogoMimeType: null },
    });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.FISCAL_LOGO,
      entityType: AUDIT_ENTITY.FiscalConfig,
      entityId: target.id,
      metadata: { op: "delete" },
    });
    return { ok: true };
  });

  /** Catálogo nacional (NCM, CFOP, CEST, CST, etc.) — busca paginada. */
  app.get("/catalog", async (req, reply) => {
    const auth = req.auth!;
    void auth;
    const q = z
      .object({
        type: z.string().min(1),
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
        context: z.string().optional(),
        relatedNcm: z.string().optional(),
        direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
        includeInactive: z
          .enum(["true", "false", "1", "0"])
          .optional()
          .transform((v) => v === "true" || v === "1"),
      })
      .safeParse(req.query);
    if (!q.success || !isFiscalCatalogType(q.data.type)) {
      return reply.status(400).send({ error: "Tipo de catálogo inválido" });
    }
    return searchFiscalCatalog({
      type: q.data.type,
      q: q.data.q,
      limit: q.data.limit,
      offset: q.data.offset,
      context: q.data.context,
      relatedNcm: q.data.relatedNcm,
      direction: q.data.direction,
      includeInactive: q.data.includeInactive,
    });
  });

  app.get("/catalog/resolve", async (req, reply) => {
    const auth = req.auth!;
    void auth;
    const q = z
      .object({
        type: z.string().min(1),
        code: z.string().min(1),
        includeInactive: z
          .enum(["true", "false", "1", "0"])
          .optional()
          .transform((v) => v === "true" || v === "1"),
      })
      .safeParse(req.query);
    if (!q.success || !isFiscalCatalogType(q.data.type)) {
      return reply.status(400).send({ error: "Parâmetros inválidos" });
    }
    const row = await resolveFiscalCatalogCode({
      type: q.data.type,
      code: q.data.code,
      includeInactive: q.data.includeInactive ?? true,
    });
    if (!row) return reply.status(404).send({ error: "Código não encontrado" });
    return row;
  });

  /** Explica rejeição SEFAZ (cStat + orientação conhecida). */
  app.get("/sefaz-rejection", async (req) => {
    const q = z
      .object({
        reason: z.string().optional(),
        cStat: z.string().optional(),
      })
      .safeParse(req.query);
    return explainSefazRejection(
      q.success ? q.data.reason : undefined,
      q.success ? q.data.cStat : undefined,
    );
  });

  /** Reimporta tabelas oficiais do diretório data/fiscal-catalog (admin). */
  app.post("/catalog/import", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const result = await importFiscalCatalogFromDir();
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.FISCAL_LOGO,
      entityType: AUDIT_ENTITY.FiscalConfig,
      entityId: auth.organizationId,
      metadata: { op: "catalog-import", ...result },
    });
    return result;
  });

  /**
   * Garante operação fiscal da org a partir de um CFOP do catálogo nacional.
   * Usado pelo combobox de CFOP no cadastro de produto.
   */
  app.post("/operations/ensure-cfop", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = z
      .object({
        cfop: z.string().min(4).max(5),
        direction: z.enum(["INBOUND", "OUTBOUND"]).default("OUTBOUND"),
      })
      .safeParse(req.body);
    if (!body.success)
      return reply.status(400).send({ error: "Dados inválidos" });

    const catalog = await resolveFiscalCatalogCode({
      type: "CFOP",
      code: body.data.cfop,
    });
    if (!catalog) {
      return reply
        .status(400)
        .send({ error: "CFOP não encontrado no catálogo fiscal" });
    }

    const existing = await prisma.fiscalOperation.findFirst({
      where: {
        organizationId: auth.organizationId,
        direction: body.data.direction,
        cfop: catalog.code,
      },
    });
    if (existing) {
      if (!existing.active) {
        return prisma.fiscalOperation.update({
          where: { id: existing.id },
          data: { active: true, description: catalog.description },
        });
      }
      return existing;
    }

    return prisma.fiscalOperation.create({
      data: {
        organizationId: auth.organizationId,
        direction: body.data.direction,
        cfop: catalog.code,
        description: catalog.description,
        nature: catalog.description,
        active: true,
      },
    });
  });

  app.get("/ncm", async (req) => {
    const auth = req.auth!;
    return prisma.fiscalNcm.findMany({
      where: { organizationId: auth.organizationId },
      orderBy: { code: "asc" },
    });
  });

  app.post("/ncm", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = z
      .object({
        code: z.string().min(8).max(8),
        description: z.string().min(1),
        cest: z.string().optional(),
        defaultCstIcms: z.string().optional(),
        defaultCsosn: z.string().optional(),
        icmsRate: z.number().optional(),
        pisRate: z.number().optional(),
        cofinsRate: z.number().optional(),
        fcpRate: z.number().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    return prisma.fiscalNcm.create({
      data: { organizationId: auth.organizationId, ...body.data },
    });
  });

  app.patch("/ncm/:id", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        description: z.string().optional(),
        cest: z.string().nullable().optional(),
        defaultCstIcms: z.string().nullable().optional(),
        defaultCsosn: z.string().nullable().optional(),
        icmsRate: z.number().nullable().optional(),
        pisRate: z.number().nullable().optional(),
        cofinsRate: z.number().nullable().optional(),
        fcpRate: z.number().nullable().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    const row = await prisma.fiscalNcm.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!row) return reply.status(404).send({ error: "Não encontrado" });
    return prisma.fiscalNcm.update({ where: { id }, data: body.data });
  });

  app.get("/operations", async (req) => {
    const auth = req.auth!;
    const q = z
      .object({ direction: z.enum(["INBOUND", "OUTBOUND"]).optional() })
      .safeParse(req.query);
    return prisma.fiscalOperation.findMany({
      where: {
        organizationId: auth.organizationId,
        direction: q.success ? q.data.direction : undefined,
      },
      orderBy: { cfop: "asc" },
    });
  });

  app.post("/operations", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = z
      .object({
        direction: z.enum(["INBOUND", "OUTBOUND"]),
        cfop: z.string().length(4),
        description: z.string().min(1),
        nature: z.string().optional(),
        defaultCstIcms: z.string().optional(),
        defaultCsosn: z.string().optional(),
        movesStock: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    return prisma.fiscalOperation.create({
      data: { organizationId: auth.organizationId, ...body.data },
    });
  });

  app.patch("/operations/:id", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        description: z.string().optional(),
        nature: z.string().nullable().optional(),
        defaultCstIcms: z.string().nullable().optional(),
        defaultCsosn: z.string().nullable().optional(),
        movesStock: z.boolean().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    const row = await prisma.fiscalOperation.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!row) return reply.status(404).send({ error: "Não encontrado" });
    return prisma.fiscalOperation.update({ where: { id }, data: body.data });
  });

  app.get("/outbound/orders", async (req) => {
    const auth = req.auth!;
    return listEligibleOutboundOrders(auth.organizationId);
  });

  app.post("/outbound/from-order/:orderId", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { orderId } = z.object({ orderId: z.string() }).parse(req.params);
    const result = await buildOutboundInvoiceFromOrder(
      auth.organizationId,
      orderId,
    );
    if (!result.ok) {
      const summary = result.issues.map((i) => i.message).join("; ");
      return reply.status(400).send({ error: summary, issues: result.issues });
    }
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.NFE_EMIT,
      entityType: AUDIT_ENTITY.FiscalInvoice,
      entityId: result.invoice.id,
      metadata: { orderId, status: result.invoice.status },
    });
    return result.invoice;
  });

  app.post("/outbound/invoices/:id/transmit", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ async: z.boolean().optional() })
      .safeParse(req.body ?? {});
    const qAsync =
      typeof req.query === "object" &&
      req.query &&
      "async" in req.query &&
      String((req.query as { async?: string }).async) === "1";
    const useAsync = (body.success && body.data.async) || qAsync;

    if (useAsync) {
      const queued = await enqueueFiscalTransmit(auth.organizationId, id);
      if (!queued.ok) return reply.status(400).send({ error: queued.error });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.NFE_TRANSMIT,
        entityType: AUDIT_ENTITY.FiscalInvoice,
        entityId: id,
        metadata: { async: true, jobId: queued.job.id },
      });
      return reply.status(202).send({
        queued: true,
        job: queued.job,
        alreadyQueued: queued.alreadyQueued ?? false,
      });
    }

    const result = await transmitOutboundInvoice(auth.organizationId, id);
    if (!result.ok) return reply.status(400).send({ error: result.error });
    if ("pending" in result && result.pending) {
      const queued = await enqueueFiscalTransmit(auth.organizationId, id);
      if (queued.ok) {
        await prisma.fiscalTransmitJob.update({
          where: { id: queued.job.id },
          data: {
            sefazReceipt: result.sefazReceipt,
            nextRunAt: new Date(Date.now() + 30_000),
            status: "PENDING",
          },
        });
      }
    }
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.NFE_TRANSMIT,
      entityType: AUDIT_ENTITY.FiscalInvoice,
      entityId: id,
      metadata: {
        status: result.invoice.status,
        accessKey: result.invoice.accessKey,
        number: result.invoice.number,
        pending: "pending" in result ? result.pending : false,
      },
    });
    return result.invoice;
  });

  app.patch("/outbound/invoices/:id/transport", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        modFrete: z.string().min(1).max(1).optional(),
        freightAmount: z.number().nonnegative().nullable().optional(),
        volumeQty: z.number().nonnegative().nullable().optional(),
        grossWeightKg: z.number().nonnegative().nullable().optional(),
        netWeightKg: z.number().nonnegative().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Dados de transporte inválidos" });
    }
    const result = await updateOutboundInvoiceTransport(
      auth.organizationId,
      id,
      body.data,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });
    return result.invoice;
  });

  app.post("/outbound/invoices/:id/email", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ to: z.string().email().optional() })
      .safeParse(req.body ?? {});
    const result = await sendFiscalInvoiceEmail(
      auth.organizationId,
      id,
      body.success ? body.data.to : undefined,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.NFE_EMAIL,
      entityType: AUDIT_ENTITY.FiscalInvoice,
      entityId: id,
      metadata: { to: result.to },
    });
    return { ok: true, to: result.to };
  });

  app.post("/outbound/invoices/:id/requeue", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const result = await requeueFiscalTransmit(auth.organizationId, id);
    if (!result.ok) return reply.status(400).send({ error: result.error });
    return result.job;
  });

  app.get("/outbound/invoices", async (req) => {
    const auth = req.auth!;
    const q = z.object({ q: z.string().optional() }).safeParse(req.query);
    const search = q.success ? q.data.q : undefined;
    return prisma.fiscalInvoice.findMany({
      where: outboundInvoiceSearchWhere(auth.organizationId, search),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        direction: true,
        status: true,
        accessKey: true,
        number: true,
        series: true,
        totalAmount: true,
        issuedAt: true,
        stockApplied: true,
        rejectionReason: true,
        protocol: true,
        modFrete: true,
        documentModel: true,
        tpEmis: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: { name: true, tradeName: true, legalName: true },
            },
          },
        },
        items: {
          select: {
            id: true,
            description: true,
            quantity: true,
            productId: true,
          },
        },
        transmitJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            attempts: true,
            lastError: true,
            nextRunAt: true,
          },
        },
      },
    });
  });

  app.get("/outbound/invoices/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const row = await prisma.fiscalInvoice.findFirst({
      where: { id, organizationId: auth.organizationId, direction: "OUTBOUND" },
      include: {
        items: { include: { product: true } },
        order: { include: { customer: true } },
        events: { orderBy: { createdAt: "desc" } },
        transmitJobs: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });
    if (!row) return reply.status(404).send({ error: "Não encontrado" });
    return row;
  });

  app.get("/invoices/:id/danfe.pdf", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const invoice = await loadInvoiceForDanfe(auth.organizationId, id);
    if (!invoice) return reply.status(404).send({ error: "Não encontrado" });
    return sendDanfePdfReply(reply, invoice);
  });

  /** XML autorizado, assinado ou do último evento de cancelamento/CC-e. */
  app.get("/invoices/:id/xml", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const kind = z
      .enum(["authorized", "signed", "cancel"])
      .catch("authorized")
      .parse(
        typeof req.query === "object" && req.query && "kind" in req.query
          ? (req.query as { kind?: string }).kind
          : "authorized",
      );

    const invoice = await prisma.fiscalInvoice.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: {
        events: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!invoice) return reply.status(404).send({ error: "Não encontrado" });

    let xml: string | null = null;
    let filename = `nfe-${invoice.number ?? id.slice(0, 8)}.xml`;

    if (kind === "signed") {
      xml = invoice.xmlSigned;
      filename = `nfe-assinada-${invoice.number ?? id.slice(0, 8)}.xml`;
    } else if (kind === "cancel") {
      const cancelEv = invoice.events.find(
        (e) => e.eventType === "NFeCancelamento" && e.success,
      );
      xml = cancelEv?.requestPayload ?? cancelEv?.responsePayload ?? null;
      filename = `nfe-cancelamento-${invoice.number ?? id.slice(0, 8)}.xml`;
    } else {
      xml = invoice.xmlAuthorized ?? invoice.xmlSigned;
      filename = `nfe-autorizada-${invoice.number ?? id.slice(0, 8)}.xml`;
    }

    if (!xml?.trim()) {
      return reply.status(404).send({
        error:
          kind === "cancel"
            ? "XML de cancelamento não disponível"
            : "XML não disponível para esta nota",
      });
    }

    reply.header("Content-Type", "application/xml; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(xml);
  });

  app.post("/outbound/invoices/:id/cancel", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ justification: z.string().min(15) })
      .safeParse(req.body);
    if (!body.success)
      return reply
        .status(400)
        .send({ error: "Justificativa obrigatória (mín. 15 caracteres)" });
    const result = await cancelOutboundInvoice(
      auth.organizationId,
      id,
      body.data.justification,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.NFE_CANCEL,
      entityType: AUDIT_ENTITY.FiscalInvoice,
      entityId: id,
      metadata: {
        direction: "OUTBOUND",
        justification: body.data.justification,
      },
    });
    return result.invoice;
  });

  app.post("/outbound/invoices/:id/cce", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ correctionText: z.string().min(15).max(1000) })
      .safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({
        error: "Texto da CC-e obrigatório (15 a 1000 caracteres)",
      });
    }
    const result = await sendCartaCorrecao(
      auth.organizationId,
      id,
      body.data.correctionText,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.NFE_CCE,
      entityType: AUDIT_ENTITY.FiscalInvoice,
      entityId: id,
      metadata: { nSeqEvento: result.nSeqEvento },
    });
    return result;
  });

  app.post("/outbound/invoices/:id/consult", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const result = await consultOutboundInvoiceSituation(
      auth.organizationId,
      id,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.NFE_CONSULTA,
      entityType: AUDIT_ENTITY.FiscalInvoice,
      entityId: id,
      metadata: {
        cStat: result.cStat,
        xMotivo: result.xMotivo,
        nProt: result.nProt,
      },
    });
    return result;
  });

  app.get("/outbound/invoices/:id/consult", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const result = await consultOutboundInvoiceSituation(
      auth.organizationId,
      id,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });
    return result;
  });

  app.post("/outbound/inutilizar", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = z
      .object({
        numberStart: z.number().int().positive(),
        numberEnd: z.number().int().positive(),
        justification: z.string().min(15),
        series: z.number().int().positive().optional(),
        year: z.number().int().min(2000).max(2100).optional(),
        establishmentId: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({
        error:
          "Informe número inicial/final e justificativa (mín. 15 caracteres)",
      });
    }
    const result = await inutilizarNumeracao({
      organizationId: auth.organizationId,
      ...body.data,
    });
    if (!result.ok) return reply.status(400).send({ error: result.error });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.NFE_INUTILIZACAO,
      entityType: AUDIT_ENTITY.FiscalConfig,
      entityId: auth.organizationId,
      metadata: {
        numberStart: body.data.numberStart,
        numberEnd: body.data.numberEnd,
        series: body.data.series,
        year: body.data.year,
        cStat: result.cStat,
        xMotivo: result.xMotivo,
      },
    });
    return {
      ok: true,
      cStat: result.cStat,
      xMotivo: result.xMotivo,
    };
  });

  app.get("/inbound/pending", async (req) => {
    const auth = req.auth!;
    return listInboundPending(auth.organizationId);
  });

  app.get("/inbound/invoices", async (req) => {
    const auth = req.auth!;
    return prisma.fiscalInvoice.findMany({
      where: { organizationId: auth.organizationId, direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
      include: { supplier: true, items: { include: { product: true } } },
    });
  });

  app.post("/inbound/import-xml", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = z.object({ xml: z.string().min(10) }).safeParse(req.body);
    if (!body.success)
      return reply.status(400).send({ error: "XML obrigatório" });
    const result = await importInboundNfeXml(
      auth.organizationId,
      body.data.xml,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.NFE_IMPORT,
      entityType: AUDIT_ENTITY.FiscalInvoice,
      entityId: result.invoice.id,
      metadata: { direction: "INBOUND", status: result.invoice.status },
    });
    return result.invoice;
  });

  app.post("/inbound/invoices/:id/confirm-import", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ productMappings: z.record(z.string(), z.string()).default({}) })
      .safeParse(req.body);
    if (!body.success) {
        return sendZodError(reply, body.error, req);
      }
    const result = await confirmInboundImport(
      auth.organizationId,
      id,
      body.data.productMappings,
      auth.sub,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.NFE_CONFIRM_IMPORT,
      entityType: AUDIT_ENTITY.FiscalInvoice,
      entityId: id,
      metadata: { mappingCount: Object.keys(body.data.productMappings).length },
    });
    return result;
  });

  app.post("/inbound/invoices/:id/cancel", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ justification: z.string().min(15) })
      .safeParse(req.body);
    if (!body.success)
      return reply
        .status(400)
        .send({ error: "Justificativa obrigatória (mín. 15 caracteres)" });
    const result = await cancelInboundInvoice(
      auth.organizationId,
      id,
      body.data.justification,
      auth.sub,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });
    await auditFromAuth(auth, {
      action: AUDIT_ACTION.NFE_CANCEL,
      entityType: AUDIT_ENTITY.FiscalInvoice,
      entityId: id,
      metadata: {
        direction: "INBOUND",
        justification: body.data.justification,
      },
    });
    return result.invoice;
  });

  app.post("/inbound/sync", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = z
      .object({ ultNsu: z.string().optional() })
      .safeParse(req.body ?? {});
    const result = await syncInboundDfe(
      auth.organizationId,
      body.success ? body.data.ultNsu : undefined,
    );
    if (!result.ok)
      return reply.status(400).send({
        error: result.error,
        cStat: "cStat" in result ? result.cStat : undefined,
        ultNSU: "ultNSU" in result ? result.ultNSU : undefined,
      });
    return result;
  });

  app.post("/inbound/:accessKey/manifest", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const { accessKey } = z
      .object({ accessKey: z.string().length(44) })
      .parse(req.params);
    const body = z
      .object({
        type: z.enum([
          "CIENCIA",
          "CONFIRMACAO",
          "DESCONHECIMENTO",
          "NAO_REALIZADA",
        ]),
        justification: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success)
      return reply.status(400).send({ error: "Tipo de manifestação inválido" });
    const result = await manifestInboundNfe(
      auth.organizationId,
      accessKey,
      body.data.type,
      body.data.justification,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });
    return result;
  });
};
