import { Building2, Landmark, Receipt, Ticket, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

const CARDS: Array<{
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    to: "/financeiro/despesas-fixas",
    title: "Despesas fixas",
    description:
      "Templates recorrentes (aluguel, impostos, etc.) com dia do mês e valor.",
    icon: Landmark,
  },
  {
    to: "/financeiro/contas-a-pagar",
    title: "Contas a pagar",
    description:
      "Lançamentos com fornecedor, vencimento, descontos, juros e status.",
    icon: Receipt,
  },
  {
    to: "/emissao-boletos",
    title: "Emissão de boletos",
    description:
      "Emita, consulte, cancele e reemita boletos de pedidos a prazo.",
    icon: Ticket,
  },
  {
    to: "/financeiro/integracoes-bancarias",
    title: "Integrações bancárias",
    description:
      "Conexões Itaú, BB e Santander (credenciais e webhook).",
    icon: Building2,
  },
];

export function FiscalHubPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <nav className="text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Início
          </Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground">Financeiro</span>
        </nav>
        <h1 className="text-2xl font-semibold text-foreground">Financeiro</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Despesas operacionais, contas a pagar e conciliação de boletos.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.to}
              to={c.to}
              className="group surface-card-glass flex gap-4 p-5 transition hover:border-primary/40 hover:shadow-md"
            >
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
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
