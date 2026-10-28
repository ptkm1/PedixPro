import { orderStatusFromSituation, orderStatusLabel } from "@pedidos/shared";

export function orderStageName(order: {
  status?: string;
  situation?: { name?: string; code?: string; mapsToCancel?: boolean } | null;
}): string {
  if (order.situation?.name) return order.situation.name;
  if (order.status) return orderStatusLabel(order.status);
  return "—";
}

export function orderStatusBadgeLabel(
  status: string,
  situation?: { name?: string; code?: string } | null,
): string {
  if (situation?.name) return situation.name;
  if (status === "PENDING_CREDIT_APPROVAL") return "Liberação";
  if (status === "CONFIRMED") return "OK";
  if (status === "DRAFT") return "Rascunho";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

export function orderStatusDetailLabel(
  status: string,
  situation?: { name?: string; code?: string } | null,
): string {
  if (situation?.name) return situation.name;
  if (status === "PENDING_CREDIT_APPROVAL") return "Aguardando liberação";
  if (status === "CONFIRMED") return "Confirmada";
  if (status === "DRAFT") return "Rascunho";
  if (status === "CANCELLED") return "Cancelado";
  return status;
}

export function orderIsConfirmed(order: {
  status?: string;
  situation?: { code?: string; mapsToCancel?: boolean } | null;
}): boolean {
  if (order.situation?.code) {
    return (
      orderStatusFromSituation(
        order.situation.code,
        order.situation.mapsToCancel,
      ) === "CONFIRMED"
    );
  }
  return order.status === "CONFIRMED";
}
