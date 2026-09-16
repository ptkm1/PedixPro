import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth/org-roles.js";
import {
  generateAiIndicators,
  getAiIndicatorsStatus,
  getLatestAiIndicators,
  setAiIndicatorsEnabled,
} from "../services/ai/indicators-service.js";
import { sendZodError } from "../util/zod-reply.js";

/** Rotas admin: /ai/indicators/* — gate reports_ai via plan-gate. */
export const aiIndicatorsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/indicators/status", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    return getAiIndicatorsStatus(auth.organizationId);
  });

  app.get("/indicators/latest", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const latest = await getLatestAiIndicators(auth.organizationId);
    return { latest };
  });

  app.patch("/indicators/settings", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    const body = z
      .object({ enabled: z.boolean() })
      .safeParse(req.body);
    if (!body.success) {
      return sendZodError(reply, body.error, req, "Dados inválidos");
    }
    return setAiIndicatorsEnabled(auth.organizationId, body.data.enabled);
  });

  app.post("/indicators/generate", async (req, reply) => {
    const auth = req.auth!;
    if (!requireAdmin(reply, auth)) return;
    try {
      const latest = await generateAiIndicators({
        organizationId: auth.organizationId,
        userId: auth.sub,
      });
      return { latest };
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Falha ao gerar Indicadores IA.";
      const lower = msg.toLowerCase();
      const status =
        lower.includes("plano") ||
        lower.includes("ative") ||
        lower.includes("desligad") ||
        lower.includes("gerações por") ||
        lower.includes("aguarde") ||
        lower.includes("neste mês")
          ? 403
          : 502;
      return reply.status(status).send({ error: msg });
    }
  });
};
