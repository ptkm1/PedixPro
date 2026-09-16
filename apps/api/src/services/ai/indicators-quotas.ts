/**
 * Quotas de custo/benefício para Indicadores IA.
 * Ajustáveis por env sem redeploy de lógica.
 */

function readPositiveInt(envKey: string, fallback: number): number {
  const raw = process.env[envKey]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** Intervalo mínimo entre gerações na mesma org (anti-spam). */
export function readCooldownMinutes(): number {
  return readPositiveInt("AI_INDICATORS_COOLDOWN_MINUTES", 15);
}

export function readMaxPerHour(): number {
  return readPositiveInt("AI_INDICATORS_MAX_PER_HOUR", 3);
}

export function readMaxPerDay(): number {
  return readPositiveInt("AI_INDICATORS_MAX_PER_DAY", 5);
}

export function readMaxPerMonth(): number {
  return readPositiveInt("AI_INDICATORS_MAX_PER_MONTH", 30);
}

/** Teto de tokens de saída por chamada (controla custo por request). */
export function readMaxCompletionTokens(): number {
  return readPositiveInt("AI_INDICATORS_MAX_COMPLETION_TOKENS", 1200);
}

export type AiIndicatorsQuotaSnapshot = {
  usageLastHour: number;
  usageToday: number;
  usageThisMonth: number;
  maxPerHour: number;
  maxPerDay: number;
  maxPerMonth: number;
  cooldownMinutes: number;
  /** Segundos restantes de cooldown; 0 se livre. */
  cooldownRemainingSeconds: number;
};

export function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function startOfUtcMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function evaluateQuotaGate(params: {
  usageLastHour: number;
  usageToday: number;
  usageThisMonth: number;
  lastGeneratedAt: Date | null;
  now?: Date;
}): { ok: true } | { ok: false; reason: string; cooldownRemainingSeconds: number } {
  const now = params.now ?? new Date();
  const cooldownMinutes = readCooldownMinutes();
  const maxPerHour = readMaxPerHour();
  const maxPerDay = readMaxPerDay();
  const maxPerMonth = readMaxPerMonth();

  let cooldownRemainingSeconds = 0;
  if (params.lastGeneratedAt && cooldownMinutes > 0) {
    const elapsedMs = now.getTime() - params.lastGeneratedAt.getTime();
    const needMs = cooldownMinutes * 60_000;
    if (elapsedMs < needMs) {
      cooldownRemainingSeconds = Math.ceil((needMs - elapsedMs) / 1000);
      const mins = Math.ceil(cooldownRemainingSeconds / 60);
      return {
        ok: false,
        cooldownRemainingSeconds,
        reason: `Aguarde ${mins} min antes de gerar de novo (intervalo mínimo entre análises).`,
      };
    }
  }

  if (maxPerHour > 0 && params.usageLastHour >= maxPerHour) {
    return {
      ok: false,
      cooldownRemainingSeconds: 0,
      reason: `Limite de ${maxPerHour} gerações por hora atingido. Tente mais tarde.`,
    };
  }
  if (maxPerDay > 0 && params.usageToday >= maxPerDay) {
    return {
      ok: false,
      cooldownRemainingSeconds: 0,
      reason: `Limite de ${maxPerDay} gerações por dia atingido. Tente amanhã.`,
    };
  }
  if (maxPerMonth > 0 && params.usageThisMonth >= maxPerMonth) {
    return {
      ok: false,
      cooldownRemainingSeconds: 0,
      reason: `Limite de ${maxPerMonth} gerações neste mês atingido.`,
    };
  }

  return { ok: true };
}
