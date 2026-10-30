import {
  isLifecycleSituationCode,
  LIFECYCLE_SITUATION_CODES,
  orderStatusFromSituation,
  SYSTEM_SITUATION_CODES,
  type OrderStatus,
} from "@pedidos/shared";

export const KANBAN_COLUMN_PAGE_SIZE = 8;

export type KanbanSituation = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
  isSystem?: boolean;
  mapsToCancel?: boolean;
};

export type KanbanOrderLike = {
  id: string;
  status?: string;
  situationId?: string | null;
  situation?: {
    id?: string;
    code?: string;
    name?: string;
    sortOrder?: number;
    active?: boolean;
    mapsToCancel?: boolean;
  } | null;
};

export type KanbanColumn = {
  id: string;
  label: string;
  situationId: string;
  situationCode: string;
  mapsToCancel?: boolean;
};

export type KanbanMove =
  | { type: "situation"; situationId: string }
  | { type: "invalid" }
  | { type: "noop" };

export function situationColumnId(situationId: string): string {
  return `stage:${situationId}`;
}

/** Cor sólida da coluna Kanban (bolinha). Fonte única das cores de etapa. */
export function situationDotClass(
  code: string,
  mapsToCancel?: boolean,
): string {
  switch (code) {
    case SYSTEM_SITUATION_CODES.DELIVERED:
      return "bg-emerald-500";
    case SYSTEM_SITUATION_CODES.SENT:
      return "bg-sky-500";
    case SYSTEM_SITUATION_CODES.PACKED:
      return "bg-violet-500";
    case SYSTEM_SITUATION_CODES.PICKING:
      return "bg-amber-500";
    case SYSTEM_SITUATION_CODES.OPEN:
      return "bg-blue-500";
    case SYSTEM_SITUATION_CODES.CREDIT:
      return "bg-amber-500";
    case SYSTEM_SITUATION_CODES.DRAFT:
      return "bg-muted-foreground/50";
    case SYSTEM_SITUATION_CODES.CANCELLED:
      return "bg-destructive";
    default:
      return mapsToCancel ? "bg-destructive" : "bg-muted-foreground/50";
  }
}

/** Chip/badge com as mesmas cores da coluna Kanban (Aberto azul, separado roxo…). */
export function stageBadgeClass(code: string, mapsToCancel?: boolean): string {
  switch (code) {
    case SYSTEM_SITUATION_CODES.DELIVERED:
      return "border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case SYSTEM_SITUATION_CODES.SENT:
      return "border-transparent bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case SYSTEM_SITUATION_CODES.PACKED:
      return "border-transparent bg-violet-500/15 text-violet-800 dark:text-violet-300";
    case SYSTEM_SITUATION_CODES.PICKING:
      return "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case SYSTEM_SITUATION_CODES.OPEN:
      return "border-transparent bg-blue-500/15 text-blue-800 dark:text-blue-300";
    case SYSTEM_SITUATION_CODES.CREDIT:
      return "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case SYSTEM_SITUATION_CODES.DRAFT:
      return "border-transparent bg-muted text-muted-foreground";
    case SYSTEM_SITUATION_CODES.CANCELLED:
      return "border-transparent bg-destructive/15 text-destructive";
    default: {
      const status = orderStatusFromSituation(code, mapsToCancel);
      if (status === "CANCELLED" || mapsToCancel) {
        return "border-transparent bg-destructive/15 text-destructive";
      }
      if (status === "PENDING_CREDIT_APPROVAL") {
        return "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300";
      }
      return "border-transparent bg-muted text-muted-foreground";
    }
  }
}

/** @deprecated use stageBadgeClass — mantido para callers internos */
export function statusBadgeClass(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "CANCELLED":
      return "border-transparent bg-destructive/15 text-destructive";
    case "PENDING_CREDIT_APPROVAL":
      return "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

export function columnAccentClass(column: KanbanColumn): string {
  return situationDotClass(column.situationCode, column.mapsToCancel);
}

function situationIdOf(order: KanbanOrderLike): string | null {
  return order.situationId ?? order.situation?.id ?? null;
}

function catalogById(
  situations: KanbanSituation[],
): Map<string, KanbanSituation> {
  return new Map(situations.map((s) => [s.id, s]));
}

function bySort(a: KanbanSituation, b: KanbanSituation): number {
  return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);
}

function isLeadCode(code: string): boolean {
  return (
    code === LIFECYCLE_SITUATION_CODES.DRAFT ||
    code === LIFECYCLE_SITUATION_CODES.CREDIT
  );
}

function isTailCode(code: string): boolean {
  return (
    code === LIFECYCLE_SITUATION_CODES.DELIVERED ||
    code === LIFECYCLE_SITUATION_CODES.CANCELLED
  );
}

/** Colunas: Rascunho → crédito → etapas da org → Entregue → Cancelado. */
export function situationsForKanban(
  situations: KanbanSituation[],
  orders: KanbanOrderLike[],
): KanbanSituation[] {
  const byId = catalogById(situations);
  const usedIds = new Set<string>();
  for (const order of orders) {
    const id = situationIdOf(order);
    if (id) usedIds.add(id);
  }

  function pickByCode(code: string): KanbanSituation | undefined {
    return situations.find((s) => s.code === code);
  }

  const draft = pickByCode(LIFECYCLE_SITUATION_CODES.DRAFT);
  const credit = pickByCode(LIFECYCLE_SITUATION_CODES.CREDIT);
  const delivered = pickByCode(LIFECYCLE_SITUATION_CODES.DELIVERED);
  const cancelled = pickByCode(LIFECYCLE_SITUATION_CODES.CANCELLED);

  const middle: KanbanSituation[] = [];
  const seen = new Set<string>();

  const sorted = [...situations].sort(bySort);
  for (const s of sorted) {
    if (isLeadCode(s.code) || isTailCode(s.code) || s.mapsToCancel) continue;
    if (!s.active && !usedIds.has(s.id)) continue;
    middle.push(s);
    seen.add(s.id);
  }

  for (const id of usedIds) {
    if (seen.has(id)) continue;
    const s = byId.get(id);
    if (!s || isLeadCode(s.code) || isTailCode(s.code) || s.mapsToCancel) {
      continue;
    }
    middle.push(s);
    seen.add(id);
  }

  middle.sort(bySort);

  const out: KanbanSituation[] = [];
  if (draft) out.push(draft);
  if (credit && (credit.active || usedIds.has(credit.id))) out.push(credit);
  out.push(...middle);
  if (delivered) out.push(delivered);
  if (cancelled) out.push(cancelled);
  return out;
}

export function buildKanbanColumns(
  situations: KanbanSituation[],
  orders: KanbanOrderLike[] = [],
): KanbanColumn[] {
  return situationsForKanban(situations, orders).map((s) => ({
    id: situationColumnId(s.id),
    label: s.name,
    situationId: s.id,
    situationCode: s.code,
    mapsToCancel: s.mapsToCancel,
  }));
}

export function columnIdForOrder(
  order: KanbanOrderLike,
  columns: KanbanColumn[],
): string {
  const sitId = situationIdOf(order);
  if (sitId) {
    const match = columns.find((c) => c.situationId === sitId);
    if (match) return match.id;
  }

  const code = order.situation?.code;
  if (code === LIFECYCLE_SITUATION_CODES.CANCELLED || order.status === "CANCELLED") {
    const col = columns.find(
      (c) => c.situationCode === LIFECYCLE_SITUATION_CODES.CANCELLED,
    );
    if (col) return col.id;
  }
  if (code === LIFECYCLE_SITUATION_CODES.DRAFT || order.status === "DRAFT") {
    const col = columns.find(
      (c) => c.situationCode === LIFECYCLE_SITUATION_CODES.DRAFT,
    );
    if (col) return col.id;
  }
  if (
    code === LIFECYCLE_SITUATION_CODES.CREDIT ||
    order.status === "PENDING_CREDIT_APPROVAL"
  ) {
    const col = columns.find(
      (c) => c.situationCode === LIFECYCLE_SITUATION_CODES.CREDIT,
    );
    if (col) return col.id;
  }

  const open = columns.find(
    (c) => c.situationCode === SYSTEM_SITUATION_CODES.OPEN,
  );
  if (open) return open.id;
  return columns[0]?.id ?? situationColumnId("unknown");
}

export function groupOrdersByKanbanColumn<T extends KanbanOrderLike>(
  orders: T[],
  columns: KanbanColumn[],
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const col of columns) grouped[col.id] = [];
  for (const order of orders) {
    const key = columnIdForOrder(order, columns);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  }
  return grouped;
}

export function resolveKanbanMove(
  order: KanbanOrderLike,
  target: KanbanColumn,
  columns: KanbanColumn[],
): KanbanMove {
  const currentId = columnIdForOrder(order, columns);
  if (currentId === target.id) return { type: "noop" };
  if (!target.situationId) return { type: "invalid" };
  if (situationIdOf(order) === target.situationId) return { type: "noop" };
  return { type: "situation", situationId: target.situationId };
}

export function parseDraggedOrderId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("order:")) {
    const id = value.slice("order:".length).trim();
    return id.length > 0 ? id : null;
  }
  if (value.includes("/") || value.includes(":")) return null;
  return value;
}

export function columnTotal(orders: { totalAmount: unknown }[]): number {
  return orders.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0);
}

export function formatOrderMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function stageChangeHint(
  code: string,
  mapsToCancel?: boolean,
): string {
  const next = orderStatusFromSituation(code, mapsToCancel);
  if (next === "CANCELLED") {
    return " Pedidos cancelados podem estornar estoque se estavam confirmados.";
  }
  if (next === "CONFIRMED") {
    return " Confirmar o pedido pode baixar estoque.";
  }
  return "";
}

export function needsStageConfirmDialog(
  fromStatus: string | undefined,
  target: { code: string; mapsToCancel?: boolean },
): boolean {
  const to = orderStatusFromSituation(target.code, target.mapsToCancel);
  const from = (fromStatus ?? "DRAFT") as OrderStatus;
  if (to === from) return false;
  return to === "CONFIRMED" || to === "CANCELLED";
}

export function isLifecycleStageCode(code: string): boolean {
  return isLifecycleSituationCode(code);
}
