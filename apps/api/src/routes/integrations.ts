import rateLimit from "@fastify/rate-limit";
import { isValidCnpj } from "@pedidos/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { fetchCep } from "../services/cep/brasilapi.js";
import {
  fetchCnpj,
  isCnpjProviderConfigured,
  readCnpjProvider,
} from "../services/cnpj/index.js";
import {
  fetchIbgeMunicipios,
  fetchIbgeUfs,
} from "../services/ibge/brasilapi.js";
import { enrichCepWithIbge } from "../services/ibge/municipio-resolver.js";
import { sendZodError } from "../util/zod-reply.js";

const digitsParam = z.object({
  digits: z.string().regex(/^\d{14}$/, "Informe exatamente 14 dígitos"),
});

const cepParam = z.object({
  digits: z.string().regex(/^\d{8}$/, "Informe exatamente 8 dígitos"),
});

const ufParam = z.object({
  uf: z.string().regex(/^[A-Za-z]{2}$/, "UF inválida"),
});

/** Rotas públicas (sem JWT): proxy consulta CNPJ via provedor configurável. */
export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    max: 10,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
  });

  app.get("/cnpj/:digits", async (req, reply) => {
    const parsed = digitsParam.safeParse(req.params);
    if (!parsed.success) {
      return sendZodError(reply, parsed.error, req, "CNPJ inválido");
    }

    if (!isValidCnpj(parsed.data.digits)) {
      return reply
        .status(400)
        .send({ error: "CNPJ inválido (dígitos verificadores incorretos)." });
    }

    const provider = readCnpjProvider();
    if (!isCnpjProviderConfigured(provider)) {
      app.log.error(
        { provider },
        "integrations/cnpj: provedor não configurado",
      );
      return reply
        .status(503)
        .send({ error: "Consulta de CNPJ temporariamente indisponível." });
    }

    try {
      const data = await fetchCnpj(parsed.data.digits);
      return data;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Falha ao consultar CNPJ.";
      const lower = msg.toLowerCase();
      if (
        lower.includes("não encontrado") ||
        lower.includes("nao encontrado")
      ) {
        return reply.status(404).send({ error: msg });
      }
      app.log.warn({ err, provider }, "integrations/cnpj falhou");
      return reply.status(502).send({ error: msg });
    }
  });

  app.get("/cep/:digits", async (req, reply) => {
    const parsed = cepParam.safeParse(req.params);
    if (!parsed.success) {
      return sendZodError(reply, parsed.error, req, "CEP inválido");
    }
    try {
      const data = await fetchCep(parsed.data.digits);
      return await enrichCepWithIbge(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Falha ao consultar CEP.";
      if (msg.includes("não encontrado")) {
        return reply.status(404).send({ error: msg });
      }
      return reply.status(502).send({ error: msg });
    }
  });

  app.get("/ibge/ufs", async (_req, reply) => {
    try {
      return await fetchIbgeUfs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao listar UFs.";
      return reply.status(502).send({ error: msg });
    }
  });

  app.get("/ibge/municipios/:uf", async (req, reply) => {
    const parsed = ufParam.safeParse(req.params);
    if (!parsed.success) {
      return sendZodError(reply, parsed.error, req, "UF inválida");
    }
    try {
      return await fetchIbgeMunicipios(parsed.data.uf);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Falha ao listar municípios.";
      return reply.status(502).send({ error: msg });
    }
  });
};
