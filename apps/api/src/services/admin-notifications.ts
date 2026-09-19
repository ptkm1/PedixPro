import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import {
  escapeHtml,
  readEmailOutboundConfig,
  sendTransactionalHtmlEmail,
} from "./email-send.js";
import { notifyUsers } from "./notify.js";
import { canWriteEffective } from "./role-permissions.js";

type OrderNotifyPayload = {
  id: string;
  totalAmount: unknown;
  sellerId?: string | null;
  seller: {
    user: { name: string };
    managerUserId?: string | null;
  } | null;
  customer: { name: string } | null;
};

function sellerDisplayName(order: OrderNotifyPayload): string {
  return order.seller?.user.name?.trim() || "VENDA DIRETA";
}

async function notifyAdminsCreditPendingEmail(params: {
  adminEmails: string[];
  order: OrderNotifyPayload;
}): Promise<void> {
  const cfg = readEmailOutboundConfig();
  if (!cfg || !params.adminEmails.length) return;

  const total = decToNum(params.order.totalAmount);
  const cust = params.order.customer?.name ?? "Cliente sem nome";
  const seller = sellerDisplayName(params.order);
  const subject = "[PedixPro] Pedido aguardando aprovação de crédito";
  const webBase = (process.env.WEB_APP_ORIGIN ?? "").replace(/\/$/, "");
  const detailPath = `/pedidos/${params.order.id}`;
  const detailLink =
    webBase.length > 0
      ? `<p><a href="${escapeHtml(webBase + detailPath)}">Abrir pedido no painel</a></p>`
      : `<p><small>ID do pedido (cole no painel): <code>${escapeHtml(params.order.id)}</code></small></p>`;

  const html = `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b">
  <p><strong>${escapeHtml(seller)}</strong> · ${escapeHtml(cust)} · <strong>R$ ${escapeHtml(total.toFixed(2))}</strong></p>
  <p>Aprove ou recuse em <strong>Pedidos</strong> no painel admin.</p>
  ${detailLink}
</body></html>`.trim();

  const result = await sendTransactionalHtmlEmail({
    cfg,
    to: params.adminEmails,
    subject,
    html,
  });

  if (!result.ok) {
    console.warn(
      "[email] Falha ao notificar admins (crédito):",
      result.message,
    );
  }
}

/** Alerta in-app + push para admins (e gestor do vendedor) quando há crédito pendente. */
export async function notifyAdminsCreditPending(params: {
  organizationId: string;
  order: OrderNotifyPayload;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { organizationId: params.organizationId, role: "ADMIN" },
    select: { id: true, email: true },
  });

  const managerId = params.order.seller?.managerUserId ?? null;
  const userIds = [
    ...admins.map((a) => a.id),
    ...(managerId ? [managerId] : []),
  ];

  if (!userIds.length) return;

  const total = decToNum(params.order.totalAmount);
  const cust = params.order.customer?.name ?? "Cliente sem nome";
  const seller = sellerDisplayName(params.order);
  const title = "Pedido aguardando crédito";
  const body = `${seller} · ${cust} · R$ ${total.toFixed(2)} — aprove em Pedidos.`;

  await notifyUsers({
    userIds,
    title,
    body,
    type: "CREDIT_PENDING",
    data: {
      orderId: params.order.id,
      sellerId: params.order.sellerId ?? undefined,
      href: `/pedidos/${params.order.id}`,
    },
  });

  const emails = admins.map((a) => a.email);
  try {
    await notifyAdminsCreditPendingEmail({
      adminEmails: emails,
      order: params.order,
    });
  } catch (e) {
    console.warn("[email] Exceção ao enviar notificação de crédito:", e);
  }
}

/** Venda confirmada → gestor do vendedor (+ admins da org). */
export async function notifySaleConfirmed(params: {
  organizationId: string;
  order: OrderNotifyPayload;
}): Promise<void> {
  const sellerRow = params.order.sellerId
    ? await prisma.seller.findFirst({
        where: {
          id: params.order.sellerId,
          organizationId: params.organizationId,
        },
        select: { managerUserId: true },
      })
    : null;

  const admins = await prisma.user.findMany({
    where: { organizationId: params.organizationId, role: "ADMIN" },
    select: { id: true },
  });

  const userIds = [
    ...admins.map((a) => a.id),
    ...(sellerRow?.managerUserId ? [sellerRow.managerUserId] : []),
    ...(params.order.seller?.managerUserId
      ? [params.order.seller.managerUserId]
      : []),
  ];

  if (!userIds.length) return;

  const total = decToNum(params.order.totalAmount);
  const cust = params.order.customer?.name ?? "Cliente sem nome";
  const seller = sellerDisplayName(params.order);

  await notifyUsers({
    userIds,
    title: "Nova venda confirmada",
    body: `${seller} · ${cust} · R$ ${total.toFixed(2)}`,
    type: "SALE_CONFIRMED",
    data: {
      orderId: params.order.id,
      sellerId: params.order.sellerId ?? undefined,
      href: `/pedidos/${params.order.id}`,
    },
  });
}

/** Cadastro de cliente pelo vendedor aguardando validação → admins + gestores com permissão. */
export async function notifyAdminsCustomerPendingApproval(params: {
  organizationId: string;
  customer: { id: string; name: string };
}): Promise<void> {
  const staff = await prisma.user.findMany({
    where: {
      organizationId: params.organizationId,
      role: { in: ["ADMIN", "MANAGER"] },
    },
    select: { id: true, role: true },
  });

  const managerCanApprove = await canWriteEffective(
    params.organizationId,
    "MANAGER",
    "customers",
  );

  const userIds = staff
    .filter((u) => u.role === "ADMIN" || managerCanApprove)
    .map((u) => u.id);

  if (!userIds.length) return;

  const name = params.customer.name.trim() || "Cliente sem nome";

  await notifyUsers({
    userIds,
    title: "Cliente aguardando validação",
    body: `Novo cliente aguardando validação: ${name}`,
    type: "CUSTOMER_PENDING_APPROVAL",
    data: {
      customerId: params.customer.id,
      href: "/clientes#pendentes",
    },
  });
}

/** Meta mensal criada/alterada → utilizadores dos vendedores no escopo. */
export async function notifySellerGoalUpdated(params: {
  organizationId: string;
  goalId: string;
  year: number;
  month: number;
  targetAmount: number;
  title?: string;
  /** Destinatários (userIds). Se vazio, não notifica. */
  userIds: string[];
  sellerId?: string | null;
  scope?: string;
}): Promise<void> {
  if (params.userIds.length === 0) return;

  const label = params.title?.trim() || "Meta do mês";
  const period = `${String(params.month).padStart(2, "0")}/${params.year}`;

  await notifyUsers({
    userIds: params.userIds,
    title: "Meta atualizada",
    body: `${label} · ${period} · R$ ${params.targetAmount.toFixed(2)}`,
    type: "GOAL_UPDATED",
    data: {
      ...(params.sellerId ? { sellerId: params.sellerId } : {}),
      ...(params.scope ? { scope: params.scope } : {}),
      goalId: params.goalId,
      href: "/commission",
    },
  });
}
