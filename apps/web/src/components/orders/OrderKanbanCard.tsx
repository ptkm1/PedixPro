import { Badge } from "@/components/ui/badge";
import { formatOrderCode } from "@/lib/order-code";
import { formatOrderMoney, stageBadgeClass } from "@/lib/order-kanban";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { Link } from "react-router-dom";

export type KanbanOrder = {
  id: string;
  orderNumber?: number | null;
  status?: string;
  situationId?: string | null;
  situation?: {
    id?: string;
    name: string;
    code?: string;
    mapsToCancel?: boolean;
  } | null;
  totalAmount: unknown;
  createdAt: string;
  seller: { user: { name: string } } | null;
  customer: {
    name: string;
    city?: string | null;
    tradeName?: string | null;
  } | null;
  items: { id: string }[];
};

type OrderKanbanCardProps = Readonly<{
  order: KanbanOrder;
  canDrag: boolean;
  isMoving: boolean;
  onDragBegin?: () => void;
  onDragFinish?: () => void;
}>;

export function OrderKanbanCard({
  order,
  canDrag,
  isMoving,
  onDragBegin,
  onDragFinish,
}: OrderKanbanCardProps) {
  const dragMoved = useRef(false);
  const code = formatOrderCode(order);
  const customerName =
    order.customer?.tradeName?.trim() || order.customer?.name || "—";
  const city = order.customer?.city?.trim();
  const stageName = order.situation?.name;

  return (
    <Link
      to={`/pedidos/${order.id}`}
      draggable={canDrag}
      onDragStart={(e) => {
        dragMoved.current = false;
        e.dataTransfer.setData("text/plain", `order:${order.id}`);
        e.dataTransfer.effectAllowed = "move";
        onDragBegin?.();
      }}
      onDrag={() => {
        dragMoved.current = true;
      }}
      onDragOver={(e) => {
        if (!canDrag) return;
        e.preventDefault();
      }}
      onDragEnd={() => {
        onDragFinish?.();
        window.setTimeout(() => {
          dragMoved.current = false;
        }, 0);
      }}
      onClick={(e) => {
        if (dragMoved.current) {
          e.preventDefault();
          dragMoved.current = false;
        }
      }}
      aria-label={`Pedido ${code}, ${customerName}`}
      className={cn(
        "surface-card block rounded-lg p-3 text-left no-underline shadow-none transition-shadow hover:shadow-sm",
        canDrag && "cursor-grab active:cursor-grabbing",
        isMoving && "opacity-60",
      )}
    >
      <p className="text-sm font-semibold tabular-nums text-foreground">
        Pedido {code}
      </p>
      <p className="mt-1.5 truncate text-sm font-medium text-foreground">
        {customerName}
      </p>
      {city ? (
        <p className="truncate text-xs text-muted-foreground">{city}</p>
      ) : null}
      <p className="mt-2 text-sm font-semibold tabular-nums text-foreground">
        {formatOrderMoney(order.totalAmount)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{new Date(order.createdAt).toLocaleDateString("pt-BR")}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">
          {order.seller?.user.name ?? "VENDA DIRETA"}
        </span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">
          {order.items.length} {order.items.length === 1 ? "item" : "itens"}
        </span>
      </div>
      {stageName ? (
        <Badge
          variant="outline"
          className={cn(
            "mt-2 font-normal",
            stageBadgeClass(
              order.situation?.code ?? "",
              order.situation?.mapsToCancel,
            ),
          )}
        >
          {stageName}
        </Badge>
      ) : null}
    </Link>
  );
}
