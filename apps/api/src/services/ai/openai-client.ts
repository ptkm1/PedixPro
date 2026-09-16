/**
 * Cliente OpenAI (Chat Completions) — só servidor.
 * Env: OPENAI_API_KEY, OPENAI_MODEL, AI_INDICATORS_ENABLED
 */

export function isAiIndicatorsGloballyEnabled(): boolean {
  const flag = process.env.AI_INDICATORS_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  // Precisa de chave; sem chave = desligado.
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function readOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export type OpenAiChatUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type OpenAiChatResult = {
  content: string;
  model: string;
  usage: OpenAiChatUsage;
};

const DEFAULT_TIMEOUT_MS = 25_000;

export async function openAiChatJson(params: {
  system: string;
  user: string;
  timeoutMs?: number;
}): Promise<OpenAiChatResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }
  if (!isAiIndicatorsGloballyEnabled()) {
    throw new Error("Indicadores IA estão desligados no servidor.");
  }

  const model = readOpenAiModel();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `OpenAI HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      );
    }

    const json = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenAI retornou resposta vazia.");

    return {
      content,
      model: json.model || model,
      usage: {
        promptTokens: Number(json.usage?.prompt_tokens ?? 0),
        completionTokens: Number(json.usage?.completion_tokens ?? 0),
        totalTokens: Number(json.usage?.total_tokens ?? 0),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Custo estimado USD (tabela aproximada gpt-4o-mini). */
export function estimateOpenAiCostUsd(
  model: string,
  usage: OpenAiChatUsage,
): number {
  const m = model.toLowerCase();
  // preços por 1M tokens (aprox. públicos; ajustáveis depois)
  let inPerM = 0.15;
  let outPerM = 0.6;
  if (m.includes("gpt-4o") && !m.includes("mini")) {
    inPerM = 2.5;
    outPerM = 10;
  }
  const cost =
    (usage.promptTokens / 1_000_000) * inPerM +
    (usage.completionTokens / 1_000_000) * outPerM;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
