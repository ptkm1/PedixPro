import type { AiIndicatorsPayload } from "@pedidos/shared";
import { AI_INDICATOR_SECTION_IDS } from "@pedidos/shared";
import { z } from "zod";

const itemSchema = z.object({
  text: z.string().min(1).max(500),
  severity: z.enum(["info", "warn", "crit"]).optional(),
  href: z.string().max(200).optional(),
});

const sectionSchema = z.object({
  id: z.enum(AI_INDICATOR_SECTION_IDS),
  title: z.string().min(1).max(120),
  items: z.array(itemSchema).min(1).max(8),
});

export const aiIndicatorsPayloadSchema = z.object({
  periodLabel: z.string().min(1).max(120),
  sections: z.array(sectionSchema).min(1).max(6),
});

export function parseAiIndicatorsPayload(raw: unknown): AiIndicatorsPayload {
  return aiIndicatorsPayloadSchema.parse(raw);
}

export const AI_INDICATORS_SYSTEM_PROMPT = `Você é um analista comercial para distribuidoras no Brasil (Pedix Pro).
Recebe APENAS métricas agregadas já calculadas pelo sistema.
Regras:
- Use somente os números fornecidos; NÃO invente faturamento, quantidades ou nomes.
- Responda SOMENTE JSON válido no schema pedido.
- Textos em português do Brasil, objetivos e acionáveis.
- href só com caminhos internos: /, /clientes, /pedidos, /vendas, /estoque, /vendedores, /relatorios, /insights
- severity: info | warn | crit (use crit só para queda forte ou risco operacional).
- Seções obrigatórias: resumo, alertas, oportunidades, acoes (pode omitir uma se não houver conteúdo).`;

export function buildAiIndicatorsUserPrompt(metricsJson: string): string {
  return `Com base nestas métricas agregadas da organização, gere a análise.

Schema JSON:
{
  "periodLabel": "string",
  "sections": [
    {
      "id": "resumo" | "alertas" | "oportunidades" | "acoes",
      "title": "string",
      "items": [{ "text": "string", "severity"?: "info"|"warn"|"crit", "href"?: "/caminho" }]
    }
  ]
}

Métricas:
${metricsJson}`;
}
