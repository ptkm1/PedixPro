import { FormSection } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import { canRead } from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Percent, Target, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const CARDS: Array<{
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  disabled?: boolean;
  disabledHint?: string;
}> = [
  {
    to: "/comissao/faixas",
    title: "Comissões",
    description:
      "Faixas progressivas por faturamento MTD — globais ou por vendedor.",
    icon: Percent,
    disabled: true,
    disabledHint: "Em breve",
  },
  {
    to: "/comissao/metas",
    title: "Metas",
    description:
      "Metas mensais por vendedor, equipe ou todos — exibidas no app do vendedor.",
    icon: Target,
  },
];

type Criterion = "EMITTED" | "INVOICED" | "SETTLED";

type CommissionSettings = {
  criterion: Criterion;
  criterionLabel: string;
  options: Array<{
    value: Criterion;
    title: string;
    shortLabel: string;
    description: string;
  }>;
};

export function CommissionHubPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const canPayableReport = Boolean(
    user &&
      canRead(user.role, "reports_commissions_payable", user.permissions),
  );

  const settingsQ = useQuery({
    queryKey: ["admin", "commission-settings"],
    queryFn: () =>
      apiFetch<CommissionSettings>("/admin/commission-settings"),
  });

  const save = useMutation({
    mutationFn: (criterion: Criterion) =>
      apiFetch<CommissionSettings>("/admin/commission-settings", {
        method: "PATCH",
        body: JSON.stringify({ criterion }),
      }),
    onSuccess: (data) => {
      void qc.setQueryData(["admin", "commission-settings"], data);
      setSaveMsg("Critério salvo para esta empresa.");
    },
    onError: (err) => {
      setSaveMsg(
        err instanceof Error ? err.message : "Não foi possível salvar.",
      );
    },
  });

  const current = settingsQ.data?.criterion;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <nav className="text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Início
          </Link>
          <span className="mx-1.5">›</span>
          <Link to="/configuracoes" className="hover:text-foreground">
            Configurações
          </Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground">Comissões</span>
        </nav>
        <h1 className="text-2xl font-semibold text-foreground">Comissões</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Defina quando a comissão entra no relatório Comissões a Pagar, além
          das faixas e metas dos vendedores.
        </p>
      </div>

      <FormSection title="QUANDO CONSIDERAR A COMISSÃO A PAGAR?">
        {settingsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : settingsQ.isError ? (
          <p className="text-sm text-destructive">
            {settingsQ.error instanceof Error
              ? settingsQ.error.message
              : "Não foi possível carregar o critério."}
          </p>
        ) : (
          <div
            className="grid gap-3"
            role="radiogroup"
            aria-label="Quando considerar a comissão a pagar"
          >
            {(settingsQ.data?.options ?? []).map((opt) => {
              const selected = current === opt.value;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card",
                  )}
                >
                  <input
                    type="radio"
                    name="commissionPayableCriterion"
                    className="mt-1"
                    value={opt.value}
                    checked={selected}
                    onChange={() => {
                      setSaveMsg(null);
                      save.mutate(opt.value);
                    }}
                  />
                  <span>
                    <span className="block font-semibold tracking-wide text-foreground">
                      {opt.title}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {opt.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {save.isPending ? (
          <p className="text-xs text-muted-foreground">Salvando…</p>
        ) : saveMsg ? (
          <p className="text-xs text-muted-foreground">{saveMsg}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Pedidos já considerados não entram de novo se o critério mudar.
        </p>
      </FormSection>

      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => {
          const Icon = c.icon;
          const content = (
            <>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {c.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {c.description}
                </p>
                {c.disabled && c.disabledHint ? (
                  <p className="mt-2 text-xs font-medium text-muted-foreground">
                    {c.disabledHint}
                  </p>
                ) : null}
              </div>
            </>
          );

          if (c.disabled) {
            return (
              <div
                key={c.to}
                aria-disabled="true"
                className="surface-card flex cursor-not-allowed gap-4 p-5 opacity-50"
              >
                {content}
              </div>
            );
          }

          return (
            <Link
              key={c.to}
              to={c.to}
              className="group surface-card flex gap-4 p-5 transition hover:border-primary/40 hover:shadow-md"
            >
              {content}
            </Link>
          );
        })}
      </div>

      {canPayableReport ? (
        <div>
          <Button asChild variant="outline">
            <Link to="/relatorios/comissoes/a-pagar">
              Abrir relatório Comissões a Pagar
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
