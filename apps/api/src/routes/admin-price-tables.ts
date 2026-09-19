import {
  priceTableCsvTemplate,
  type PriceAdjustmentKind,
  type PriceAdjustmentMode,
} from "@pedidos/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  AUDIT_ACTION,
  AUDIT_ENTITY,
  auditFromAuth,
} from "../services/audit-log.js";
import {
  bulkUpdateTableItems,
  createPriceTable,
  deletePriceTable,
  deleteTableItem,
  duplicatePriceTable,
  getPriceTable,
  importTableCsv,
  listPriceTables,
  listTableCatalog,
  PriceTableServiceError,
  replaceQtyTiers,
  updatePriceTable,
  upsertTableItem,
} from "../services/price-tables.js";
import { sendZodError } from "../util/zod-reply.js";

const idParam = z.object({ id: z.string().min(1) });

function parseOptionalDate(raw: string | null | undefined): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (day) {
    return new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const tableWriteSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  adjustmentKind: z.enum(["DISCOUNT", "SURCHARGE"]).optional(),
  adjustmentMode: z.enum(["PERCENT", "AMOUNT"]).optional(),
  adjustmentValue: z.number().min(0).optional(),
  priority: z.number().int().optional(),
  customerId: z.string().nullable().optional(),
  sellerId: z.string().nullable().optional(),
  regionId: z.string().nullable().optional(),
});

function replyPriceTableError(
  reply: { status: (c: number) => { send: (b: unknown) => unknown } },
  err: unknown,
) {
  if (err instanceof PriceTableServiceError) {
    return reply.status(err.httpStatus).send({ error: err.message });
  }
  throw err;
}

export const priceTablesAdminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/price-tables", async (req) => {
    const auth = req.auth!;
    return listPriceTables(auth.organizationId);
  });

  app.get("/price-tables/csv-template", async (_req, reply) => {
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header(
      "content-disposition",
      'attachment; filename="tabela-preco.csv"',
    );
    return priceTableCsvTemplate();
  });

  app.get("/price-tables/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    try {
      return await getPriceTable(auth.organizationId, id);
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });

  app.get("/price-tables/:id/catalog", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const q = z.object({ q: z.string().optional() }).safeParse(req.query);
    try {
      return await listTableCatalog(
        auth.organizationId,
        id,
        q.success ? q.data.q : undefined,
      );
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });

  app.post("/price-tables", async (req, reply) => {
    const auth = req.auth!;
    const body = tableWriteSchema
      .extend({ name: z.string().min(1) })
      .safeParse(req.body);
    if (!body.success) return sendZodError(reply, body.error, req);
    try {
      const created = await createPriceTable(auth.organizationId, {
        ...body.data,
        validFrom: parseOptionalDate(body.data.validFrom ?? undefined) ?? null,
        validTo: parseOptionalDate(body.data.validTo ?? undefined) ?? null,
        adjustmentKind: body.data.adjustmentKind as PriceAdjustmentKind | undefined,
        adjustmentMode: body.data.adjustmentMode as PriceAdjustmentMode | undefined,
      });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.CREATE,
        entityType: AUDIT_ENTITY.PriceTable,
        entityId: created.id,
        metadata: { name: created.name },
      });
      return created;
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });

  app.patch("/price-tables/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = tableWriteSchema.safeParse(req.body);
    if (!body.success) return sendZodError(reply, body.error, req);
    try {
      const updated = await updatePriceTable(auth.organizationId, id, {
        ...body.data,
        validFrom: parseOptionalDate(body.data.validFrom),
        validTo: parseOptionalDate(body.data.validTo),
        adjustmentKind: body.data.adjustmentKind as PriceAdjustmentKind | undefined,
        adjustmentMode: body.data.adjustmentMode as PriceAdjustmentMode | undefined,
      });
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.UPDATE,
        entityType: AUDIT_ENTITY.PriceTable,
        entityId: id,
        metadata: { fields: Object.keys(body.data) },
      });
      return updated;
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });

  app.delete("/price-tables/:id", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    try {
      const existing = await deletePriceTable(auth.organizationId, id);
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.DELETE,
        entityType: AUDIT_ENTITY.PriceTable,
        entityId: id,
        metadata: { name: existing.name },
      });
      return reply.status(204).send();
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });

  app.post("/price-tables/:id/duplicate", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    try {
      const created = await duplicatePriceTable(auth.organizationId, id);
      await auditFromAuth(auth, {
        action: AUDIT_ACTION.CREATE,
        entityType: AUDIT_ENTITY.PriceTable,
        entityId: created.id,
        metadata: { duplicatedFrom: id, name: created.name },
      });
      return created;
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });

  app.post("/price-tables/:id/items", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        productId: z.string().min(1),
        price: z.number().nonnegative().nullable().optional(),
        useCustomPrice: z.boolean().optional(),
        minPrice: z.number().nonnegative().nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return sendZodError(reply, body.error, req);
    try {
      return await upsertTableItem(auth.organizationId, id, body.data);
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });

  app.delete("/price-tables/:tableId/items/:productId", async (req, reply) => {
    const auth = req.auth!;
    const p = z
      .object({ tableId: z.string(), productId: z.string() })
      .parse(req.params);
    try {
      await deleteTableItem(auth.organizationId, p.tableId, p.productId);
      return reply.status(204).send();
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });

  app.put("/price-tables/:id/items/:productId/qty-tiers", async (req, reply) => {
    const auth = req.auth!;
    const p = z
      .object({ id: z.string().min(1), productId: z.string().min(1) })
      .parse(req.params);
    const body = z
      .object({
        tiers: z.array(
          z.object({
            minQuantity: z.number().int().positive(),
            price: z.number().nonnegative(),
          }),
        ),
      })
      .safeParse(req.body);
    if (!body.success) return sendZodError(reply, body.error, req);
    try {
      return await replaceQtyTiers(
        auth.organizationId,
        p.id,
        p.productId,
        body.data.tiers,
      );
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });

  app.post("/price-tables/:id/items/bulk", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        productIds: z.array(z.string().min(1)).min(1),
        action: z.enum(["apply_percent", "set_price", "clear_custom"]),
        value: z.number().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return sendZodError(reply, body.error, req);
    try {
      return await bulkUpdateTableItems(auth.organizationId, id, body.data);
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });

  app.post("/price-tables/:id/import", async (req, reply) => {
    const auth = req.auth!;
    const { id } = idParam.parse(req.params);
    const body = z.object({ csvText: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return sendZodError(reply, body.error, req);
    try {
      return await importTableCsv(auth.organizationId, id, body.data.csvText);
    } catch (e) {
      return replyPriceTableError(reply, e);
    }
  });
};
