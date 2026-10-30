import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runCertificateExpiryAlerts } from "../services/cert-expiry-alerts.js";
import { reconcileOpenReceivables } from "../services/banking/receivable-service.js";
import { runCustomerInactivation } from "../services/customer-status.js";
import { runFiscalTransmitJobs } from "../services/fiscal-transmit-queue.js";
import { recheckActiveContingencies } from "../services/nfe-contingency.js";
import { runMorningBriefJob } from "../services/morning-brief.js";
import { runStockExpiryAlerts } from "../services/stock-expiry-alerts.js";

function readCronSecret(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const headerSecret = req.headers["x-cron-secret"];
  if (typeof headerSecret === "string" && headerSecret.trim()) {
    return headerSecret.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

function assertCronSecret(
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  provided: string | null,
): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    void reply.code(503).send({
      error: "CRON_SECRET não configurado no servidor",
    });
    return false;
  }
  if (!provided || provided !== expected) {
    void reply.code(401).send({ error: "Não autorizado" });
    return false;
  }
  return true;
}

export async function jobsRoutes(app: FastifyInstance) {
  app.post("/stock-expiry", async (req, reply) => {
    if (!assertCronSecret(reply, readCronSecret(req))) return;
    const body = z
      .object({ organizationId: z.string().optional() })
      .safeParse(req.body ?? {});
    const result = await runStockExpiryAlerts({
      organizationId: body.success ? body.data.organizationId : undefined,
    });
    return result;
  });

  app.post("/cert-expiry", async (req, reply) => {
    if (!assertCronSecret(reply, readCronSecret(req))) return;
    const body = z
      .object({ organizationId: z.string().optional() })
      .safeParse(req.body ?? {});
    const result = await runCertificateExpiryAlerts({
      organizationId: body.success ? body.data.organizationId : undefined,
    });
    return result;
  });

  app.post("/morning-brief", async (req, reply) => {
    if (!assertCronSecret(reply, readCronSecret(req))) return;
    const body = z
      .object({
        organizationId: z.string().optional(),
        notify: z.boolean().optional(),
      })
      .safeParse(req.body ?? {});
    const result = await runMorningBriefJob({
      organizationId: body.success ? body.data.organizationId : undefined,
      notify: body.success ? body.data.notify : undefined,
    });
    return result;
  });

  app.post("/fiscal-transmit", async (req, reply) => {
    if (!assertCronSecret(reply, readCronSecret(req))) return;
    const body = z
      .object({
        organizationId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .safeParse(req.body ?? {});
    const jobs = await runFiscalTransmitJobs({
      organizationId: body.success ? body.data.organizationId : undefined,
      limit: body.success ? body.data.limit : undefined,
    });
    const svc = await recheckActiveContingencies();
    return { ...jobs, contingency: svc };
  });

  app.post("/customer-inactivation", async (req, reply) => {
    if (!assertCronSecret(reply, readCronSecret(req))) return;
    const body = z
      .object({ organizationId: z.string().optional() })
      .safeParse(req.body ?? {});
    return runCustomerInactivation({
      organizationId: body.success ? body.data.organizationId : undefined,
    });
  });

  /** Reconciliação leve de boletos (overdue local; sync remoto opcional). */
  app.post("/banking-reconcile", async (req, reply) => {
    if (!assertCronSecret(reply, readCronSecret(req))) return;
    const body = z
      .object({
        organizationId: z.string().optional(),
        syncRemote: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .safeParse(req.body ?? {});
    return reconcileOpenReceivables({
      organizationId: body.success ? body.data.organizationId : undefined,
      syncRemote: body.success ? Boolean(body.data.syncRemote) : false,
      limit: body.success ? body.data.limit : undefined,
    });
  });
}
