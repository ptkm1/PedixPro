import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { stageBadgeClass } from "@/lib/order-kanban";
import { formatOrderCode } from "@/lib/order-code";
import { cn } from "@/lib/utils";
import {
    formatRelativeSaleDate,
    formatSaleItemCount,
    orderStatusLabel,
    paymentConditionLabel,
    situationCodeFromOrderStatus,
    type OrderStatus,
} from "@pedidos/shared";
import { Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export type RecentSaleOrder = {
  id: string;
  orderNumber?: number | null;
  status: string;
  totalAmount: unknown;
  createdAt: string;
  paymentCondition?: {
    id: string;
    name: string;
    days: number;
    sortOrder: number;
  } | null;
  customer: {
    name: string;
    city?: string | null;
    tradeName?: string | null;
  } | null;
  items: { id?: string; quantity?: number }[];
  seller?: { user: { name: string } };
};

type Props = {
  orders: RecentSaleOrder[];
  isLoading?: boolean;
  isFetching?: boolean;
  limit?: number;
  viewAllHref?: string;
  subtitle?: string;
  showSeller?: boolean;
};

function fmtMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function customerLabel(order: RecentSaleOrder): string {
  return (
    order.customer?.tradeName?.trim() ||
    order.customer?.name ||
    "Sem cliente"
  );
}

const headClass =
  "px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground";

type RecentSalesTableHeaderProps = Readonly<{ showSeller: boolean }>;

function RecentSalesTableHeader({
  showSeller,
}: RecentSalesTableHeaderProps) {
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className={headClass}>Pedido</TableHead>
        <TableHead className={headClass}>Cliente</TableHead>
        <TableHead className={cn("hidden md:table-cell", headClass)}>
          Cidade
        </TableHead>
        <TableHead className={cn("hidden lg:table-cell", headClass)}>
          Condição
        </TableHead>
        {showSeller ? (
          <TableHead className={cn("hidden lg:table-cell", headClass)}>
            Vendedor
          </TableHead>
        ) : null}
        <TableHead className={cn("hidden sm:table-cell", headClass)}>
          Itens
        </TableHead>
        <TableHead className={headClass}>Etapa</TableHead>
        <TableHead className={cn("text-right", headClass)}>Total</TableHead>
        <TableHead className={cn("hidden text-right sm:table-cell", headClass)}>
          Data
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

export function RecentSalesList({
  orders,
  isLoading = false,
  isFetching = false,
  limit = 8,
  viewAllHref = "/pedidos",
  subtitle = "Pedidos mais recentes da organização.",
  showSeller = true,
}: Props) {
  const navigate = useNavigate();
  const visible = orders.slice(0, limit);
  const isRefetching = isFetching && !isLoading;

  return (
    <section className="surface-card-glass relative mt-6 overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">
            Vendas recentes
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Link
          to={viewAllHref}
          className="shrink-0 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted"
        >
          Ver todas
        </Link>
      </div>

      {isLoading ? (
        <div className="px-2 py-2 sm:px-4">
          <Table>
            <RecentSalesTableHeader showSeller={showSeller} />
            <TableBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell className="px-3 py-3">
                    <Skeleton className="h-4 w-14" />
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <Skeleton className="h-4 w-36" />
                  </TableCell>
                  <TableCell className="hidden px-3 py-3 md:table-cell">
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell className="hidden px-3 py-3 lg:table-cell">
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  {showSeller ? (
                    <TableCell className="hidden px-3 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden px-3 py-3 sm:table-cell">
                    <Skeleton className="h-4 w-10" />
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <Skeleton className="h-5 w-20 rounded-md" />
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <Skeleton className="ml-auto h-4 w-20" />
                  </TableCell>
                  <TableCell className="hidden px-3 py-3 sm:table-cell">
                    <Skeleton className="ml-auto h-4 w-16" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground sm:px-6">
          Nenhuma venda registrada ainda.
        </p>
      ) : (
        <div className="px-2 py-1 sm:px-4 sm:py-2">
          <Table>
            <RecentSalesTableHeader showSeller={showSeller} />
            <TableBody>
              {visible.map((order) => {
                const confirmed = order.status === "CONFIRMED";
                const code = formatOrderCode(order);
                const city = order.customer?.city?.trim() || "—";
                const href = `/pedidos/${order.id}`;
                const stageCode = situationCodeFromOrderStatus(
                  order.status as OrderStatus,
                );

                return (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => navigate(href)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(href);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Pedido ${code}, ${customerLabel(order)}`}
                  >
                    <TableCell className="px-3 py-3 font-medium tabular-nums text-foreground">
                      {code}
                    </TableCell>
                    <TableCell className="max-w-48 truncate px-3 py-3 font-medium text-foreground">
                      {customerLabel(order)}
                    </TableCell>
                    <TableCell className="hidden max-w-36 truncate px-3 py-3 text-muted-foreground md:table-cell">
                      {city}
                    </TableCell>
                    <TableCell className="hidden max-w-40 truncate px-3 py-3 text-muted-foreground lg:table-cell">
                      {paymentConditionLabel(order.paymentCondition)}
                    </TableCell>
                    {showSeller ? (
                      <TableCell className="hidden max-w-36 truncate px-3 py-3 text-muted-foreground lg:table-cell">
                        {order.seller?.user.name ?? "—"}
                      </TableCell>
                    ) : null}
                    <TableCell className="hidden px-3 py-3 tabular-nums text-muted-foreground sm:table-cell">
                      {formatSaleItemCount(order.items.length)}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <Badge
                        variant="outline"
                        className={stageBadgeClass(stageCode)}
                      >
                        {orderStatusLabel(order.status)}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-3 py-3 text-right font-semibold tabular-nums",
                        confirmed ? "text-success" : "text-foreground",
                      )}
                    >
                      {fmtMoney(order.totalAmount)}
                    </TableCell>
                    <TableCell className="hidden px-3 py-3 text-right text-muted-foreground sm:table-cell">
                      {formatRelativeSaleDate(order.createdAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {isRefetching ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px]"
          aria-busy
          aria-label="Atualizando vendas"
        >
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : null}
    </section>
  );
}
