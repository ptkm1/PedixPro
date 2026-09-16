/** Tipos e schema conceitual dos Indicadores IA (resposta tipada do LLM). */

export const AI_INDICATOR_SECTION_IDS = [
  "resumo",
  "alertas",
  "oportunidades",
  "acoes",
] as const;

export type AiIndicatorSectionId = (typeof AI_INDICATOR_SECTION_IDS)[number];

export type AiIndicatorSeverity = "info" | "warn" | "crit";

export type AiIndicatorItem = {
  text: string;
  severity?: AiIndicatorSeverity;
  href?: string;
};

export type AiIndicatorSection = {
  id: AiIndicatorSectionId;
  title: string;
  items: AiIndicatorItem[];
};

export type AiIndicatorsPayload = {
  periodLabel: string;
  sections: AiIndicatorSection[];
};

export type AiIndicatorsLatest = {
  payload: AiIndicatorsPayload;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  generatedAt: string;
};

export type AiIndicatorsStatus = {
  /** Kill switch + key configurada no servidor. */
  globallyEnabled: boolean;
  /** Org tem feature reports_ai no plano. */
  planAllowed: boolean;
  /** Toggle por organização. */
  orgEnabled: boolean;
  /** Pode chamar generate agora. */
  canGenerate: boolean;
  reason: string | null;
  model: string;
  latest: AiIndicatorsLatest | null;
  usageLastHour: number;
  usageToday: number;
  usageThisMonth: number;
  maxPerHour: number;
  maxPerDay: number;
  maxPerMonth: number;
  /** Intervalo mínimo entre gerações (minutos). */
  cooldownMinutes: number;
  /** Segundos restantes de cooldown; 0 se livre. */
  cooldownRemainingSeconds: number;
};
