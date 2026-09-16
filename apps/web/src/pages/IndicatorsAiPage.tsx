import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { notifyError, notifySuccess } from "@/lib/app-notifications";
import { apiFetch } from "@/lib/api";
import { getErrorMessage } from "@/lib/api-error";
import { isWebAdmin } from "@/lib/staff";
import { cn } from "@/lib/utils";
import type { AiIndicatorsStatus } from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Lightbulb,
  ListChecks,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

const SECTION_ICON: Record<string, typeof Sparkles> = {
  resumo: Sparkles,
  alertas: AlertTriangle,
  oportunidades: Lightbulb,
  acoes: ListChecks,
};

export function IndicatorsAiPage() {
  const { user } = useAuth();
  const admin = isWebAdmin(user?.role);
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ["ai-indicators-status"],
    queryFn: () => apiFetch<AiIndicatorsStatus>("/admin/ai/indicators/status"),
    enabled: admin,
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch<{ aiIndicatorsEnabled: boolean }>(
        "/admin/ai/indicators/settings",
        {
          method: "PATCH",
          body: JSON.stringify({ enabled }),
        },
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ai-indicators-status"] });
      notifySuccess("Preferência de IA atualizada.");
    },
    onError: (err) => notifyError(getErrorMessage(err), "Falha ao salvar"),
  });

  const generate = useMutation({
    mutationFn: () =>
      apiFetch<{ latest: AiIndicatorsStatus["latest"] }>(
        "/admin/ai/indicators/generate",
        { method: "POST", body: "{}" },
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ai-indicators-status"] });
      notifySuccess("Análise gerada.");
    },
    onError: (err) => notifyError(getErrorMessage(err), "Falha ao gerar"),
  });

  if (!admin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Indicadores IA</h1>
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem acessar a análise por IA.
        </p>
      </div>
    );
  }

  const status = statusQ.data;
  const latest = status?.latest;
  const busy = generate.isPending || toggle.isPending;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <nav className="text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Início
          </Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground">Indicadores IA</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Indicadores IA
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Análise assistida por IA sobre vendas e operação. Os números vêm
              do Pedix; a IA só interpreta e sugere ações.
            </p>
          </div>
          <Button
            type="button"
            disabled={!status?.canGenerate || busy}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Gerando…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Gerar análise
              </>
            )}
          </Button>
        </div>
      </div>

      {statusQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : statusQ.isError ? (
        <p className="text-sm text-destructive">
          {getErrorMessage(statusQ.error)}
        </p>
      ) : status ? (
        <div className="space-y-6">
          <div className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Usar análise por IA</p>
              <p className="text-xs text-muted-foreground">
                Toggle da organização. Também exige plano com IA e chave no
                servidor.
                {status.reason ? ` ${status.reason}` : null}
              </p>
              <p className="text-xs text-muted-foreground">
                Modelo: {status.model} · Uso na última hora:{" "}
                {status.usageLastHour}/{status.maxPerHour}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={status.orgEnabled}
                disabled={!status.planAllowed || !status.globallyEnabled || busy}
                onCheckedChange={(v) => toggle.mutate(v === true)}
              />
              <span className="text-sm text-muted-foreground">
                {status.orgEnabled ? "Ativo" : "Inativo"}
              </span>
            </div>
          </div>

          {!status.planAllowed ? (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
              Seu plano atual não inclui Indicadores IA. Faça upgrade para o
              plano Business (ou o plano que incluir <code>reports_ai</code>).
            </div>
          ) : null}

          {!status.globallyEnabled ? (
            <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Servidor sem IA habilitada. Configure{" "}
              <code>OPENAI_API_KEY</code> e{" "}
              <code>AI_INDICATORS_ENABLED=true</code> no ambiente da API.
            </div>
          ) : null}

          {latest ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {latest.payload.periodLabel} · gerado em{" "}
                  {new Date(latest.generatedAt).toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {latest.totalTokens} tokens
                  {latest.estimatedCostUsd != null
                    ? ` · ~US$ ${latest.estimatedCostUsd.toFixed(4)}`
                    : ""}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {latest.payload.sections.map((section) => {
                  const Icon = SECTION_ICON[section.id] ?? Sparkles;
                  return (
                    <div key={section.id} className="surface-card space-y-3 p-4">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-primary" />
                        <h2 className="text-sm font-semibold">{section.title}</h2>
                      </div>
                      <ul className="space-y-2">
                        {section.items.map((item, idx) => (
                          <li
                            key={`${section.id}-${idx}`}
                            className={cn(
                              "text-sm text-foreground",
                              item.severity === "crit" && "text-destructive",
                              item.severity === "warn" &&
                                "text-amber-700 dark:text-amber-200",
                            )}
                          >
                            {item.href ? (
                              <Link
                                to={item.href}
                                className="underline-offset-2 hover:underline"
                              >
                                {item.text}
                              </Link>
                            ) : (
                              item.text
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="surface-card p-6 text-sm text-muted-foreground">
              Nenhuma análise ainda. Ative o toggle e clique em{" "}
              <strong>Gerar análise</strong>.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
