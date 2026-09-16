import { runFiscalTransmitJobs } from "./fiscal-transmit-queue.js";

/**
 * Processa a fila de transmissão NF-e periodicamente.
 * Ativado com FISCAL_TRANSMIT_CRON=1.
 * Intervalo padrão 10 min (não 1 min) para o Neon Free conseguir scale-to-zero.
 * Override: FISCAL_TRANSMIT_CRON_MS (mín. 60_000).
 */
export function scheduleFiscalTransmitCron(log?: {
  info: (o: unknown, msg?: string) => void;
  error: (o: unknown, msg?: string) => void;
}) {
  if (process.env.FISCAL_TRANSMIT_CRON?.trim() !== "1") return;

  const rawMs = Number(process.env.FISCAL_TRANSMIT_CRON_MS ?? 600_000);
  const intervalMs = Number.isFinite(rawMs)
    ? Math.max(60_000, Math.floor(rawMs))
    : 600_000;

  const tick = async () => {
    try {
      const result = await runFiscalTransmitJobs({ limit: 10 });
      if (result.claimed > 0) {
        log?.info(result, "[fiscal-transmit] jobs processados");
      }
    } catch (err) {
      log?.error(err, "[fiscal-transmit] falha no job agendado");
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  log?.info(
    { intervalMs },
    "[fiscal-transmit] cron ativo (FISCAL_TRANSMIT_CRON=1)",
  );
}
