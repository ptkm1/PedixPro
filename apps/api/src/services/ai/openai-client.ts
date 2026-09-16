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
  maxCompletionTokens?: number;
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
        max_tokens: params.maxCompletionTokens ?? 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(friendlyOpenAiHttpError(res.status, body));
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

/** Mensagem amigável a partir do JSON de erro da OpenAI. */
export function friendlyOpenAiHttpError(status: number, body: string): string {
  let code: string | undefined;
  let apiMessage: string | undefined;
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: string; type?: string; message?: string };
    };
    code = parsed.error?.code || parsed.error?.type;
    apiMessage = parsed.error?.message;
  } catch {
    /* corpo não-JSON */
  }

  const lower = `${code ?? ""} ${apiMessage ?? ""} ${body}`.toLowerCase();
  if (
    status === 429 &&
    (lower.includes("insufficient_quota") ||
      lower.includes("no credits remaining") ||
      lower.includes("billing"))
  ) {
    return "A conta OpenAI está sem créditos. Adicione saldo em platform.openai.com (Billing) e tente de novo.";
  }
  if (status === 429) {
    return "Limite de requisições da OpenAI atingido. Aguarde um minuto e tente novamente.";
  }
  if (status === 401 || lower.includes("invalid_api_key")) {
    return "Chave OPENAI_API_KEY inválida. Verifique o valor em apps/api/.env.";
  }
  if (status === 400 && lower.includes("model")) {
    return "Modelo OpenAI inválido. Ajuste OPENAI_MODEL no .env da API.";
  }

  const snippet = (apiMessage || body).trim().slice(0, 180);
  return snippet
    ? `Falha na OpenAI (HTTP ${status}): ${snippet}`
    : `Falha na OpenAI (HTTP ${status}).`;
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
