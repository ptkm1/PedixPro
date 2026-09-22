import { runFiscalTransmitJobs } from "./fiscal-transmit-queue.js";

/** Backoff quando Neon/Prisma reporta cota esgotada (evita spam a cada 10 min). */
const QUOTA_BACKOFF_MS = 3_600_000; // 1 h

/**
 * Detecta erro de cota Neon (ou mensagem equivalente via PrismaPg).
 * Ex.: "Your account or project has exceeded the quota. Upgrade your plan…"
 */
export function isDbQuotaExceededError(err: unknown): boolean {
  const messages: string[] = [];
  const walk = (v: unknown, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") {
      messages.push(v);
      return;
    }
    if (v instanceof Error) {
      messages.push(v.message, v.name);
      walk((v as Error & { cause?: unknown }).cause, depth + 1);
      return;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const k of ["message", "msg", "code", "name", "detail"]) {
        if (typeof o[k] === "string") messages.push(o[k] as string);
      }
      if (o.cause) walk(o.cause, depth + 1);
      if (o.meta) walk(o.meta, depth + 1);
    }
  };
  walk(err);
  const blob = messages.join("\n").toLowerCase();
  return (
    blob.includes("exceeded the quota") ||
    blob.includes("exceeded the compute time quota") ||
    blob.includes("compute time quota") ||
    blob.includes("upgrade your plan to increase limits")
  );
}

/**
 * Processa a fila de transmissão NF-e periodicamente.
 * Ativado com FISCAL_TRANSMIT_CRON=1.
 * Intervalo padrão 10 min (não 1 min) para o Neon Free conseguir scale-to-zero.
 * Override: FISCAL_TRANSMIT_CRON_MS (mín. 60_000).
 *
 * Em erro de cota Neon: sobe o intervalo para 1 h e loga warn (não error a cada tick),
 * até a cota voltar; depois restaura o intervalo configurado.
 */
export function scheduleFiscalTransmitCron(log?: {
  info: (o: unknown, msg?: string) => void;
  warn?: (o: unknown, msg?: string) => void;
  error: (o: unknown, msg?: string) => void;
}) {
  if (process.env.FISCAL_TRANSMIT_CRON?.trim() !== "1") return;

  const rawMs = Number(process.env.FISCAL_TRANSMIT_CRON_MS ?? 600_000);
  const configuredMs = Number.isFinite(rawMs)
    ? Math.max(60_000, Math.floor(rawMs))
    : 600_000;

  let intervalMs = configuredMs;
  let timer: ReturnType<typeof setInterval> | undefined;
  let quotaBackoffActive = false;

  const reschedule = (nextMs: number) => {
    if (timer) clearInterval(timer);
    intervalMs = nextMs;
    timer = setInterval(() => void tick(), intervalMs);
    if (typeof timer.unref === "function") timer.unref();
  };

  const tick = async () => {
    try {
      const result = await runFiscalTransmitJobs({ limit: 10 });
      if (quotaBackoffActive) {
        quotaBackoffActive = false;
        reschedule(configuredMs);
        log?.info(
          { intervalMs: configuredMs },
          "[fiscal-transmit] cota OK — intervalo restaurado",
        );
      }
      if (result.claimed > 0) {
        log?.info(result, "[fiscal-transmit] jobs processados");
      }
    } catch (err) {
      if (isDbQuotaExceededError(err)) {
        if (!quotaBackoffActive) {
          quotaBackoffActive = true;
          reschedule(QUOTA_BACKOFF_MS);
          (log?.warn ?? log?.error)?.(
            {
              intervalMs: QUOTA_BACKOFF_MS,
              hint: "Neon: Billing → Usage (compute hours/storage). Render: FISCAL_TRANSMIT_CRON=0 para pausar.",
            },
            "[fiscal-transmit] cota DB esgotada — backoff 1h (sem spam)",
          );
        }
        return;
      }
      log?.error(err, "[fiscal-transmit] falha no job agendado");
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  log?.info(
    { intervalMs },
    "[fiscal-transmit] cron ativo (FISCAL_TRANSMIT_CRON=1)",
  );
}
