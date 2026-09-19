import type { SellerMonthlyGoal, SellerMonthlyGoalScope } from "@prisma/client";
import { prisma } from "../db.js";
import { decToNum } from "../util/money.js";
import { sellerConfirmedRevenueInPeriod } from "./seller-metrics.js";

export type GoalScope = SellerMonthlyGoalScope;

export function buildGoalScopeKey(
  scope: GoalScope,
  sellerId?: string | null,
  teamId?: string | null,
): string {
  if (scope === "SELLER") {
    if (!sellerId) throw new Error("sellerId obrigatório para escopo SELLER");
    return `SELLER:${sellerId}`;
  }
  if (scope === "TEAM") {
    if (!teamId) throw new Error("teamId obrigatório para escopo TEAM");
    return `TEAM:${teamId}`;
  }
  return "ALL";
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Faturamento confirmado de um conjunto de vendedores no período. */
export async function sellersConfirmedRevenueInPeriod(
  organizationId: string,
  sellerIds: string[],
  start: Date,
  end: Date,
): Promise<number> {
  if (sellerIds.length === 0) return 0;
  const agg = await prisma.order.aggregate({
    where: {
      organizationId,
      sellerId: { in: sellerIds },
      status: "CONFIRMED",
      createdAt: { gte: start, lte: end },
    },
    _sum: { totalAmount: true },
  });
  return roundMoney(decToNum(agg._sum.totalAmount ?? 0));
}

export async function resolveGoalSellerIds(
  organizationId: string,
  goal: Pick<SellerMonthlyGoal, "scope" | "sellerId" | "teamId">,
): Promise<string[]> {
  if (goal.scope === "SELLER") {
    return goal.sellerId ? [goal.sellerId] : [];
  }
  if (goal.scope === "TEAM") {
    if (!goal.teamId) return [];
    const members = await prisma.seller.findMany({
      where: { organizationId, teamId: goal.teamId, active: true },
      select: { id: true },
    });
    return members.map((m) => m.id);
  }
  const sellers = await prisma.seller.findMany({
    where: { organizationId, active: true },
    select: { id: true },
  });
  return sellers.map((s) => s.id);
}

export async function goalAchievedAmount(
  organizationId: string,
  goal: Pick<SellerMonthlyGoal, "scope" | "sellerId" | "teamId">,
  start: Date,
  end: Date,
): Promise<number> {
  if (goal.scope === "SELLER" && goal.sellerId) {
    return sellerConfirmedRevenueInPeriod(
      organizationId,
      goal.sellerId,
      start,
      end,
    );
  }
  /** Meta ALL inclui vendas diretas (sellerId null) no faturamento geral. */
  if (goal.scope === "ALL") {
    const agg = await prisma.order.aggregate({
      where: {
        organizationId,
        status: "CONFIRMED",
        createdAt: { gte: start, lte: end },
      },
      _sum: { totalAmount: true },
    });
    return roundMoney(decToNum(agg._sum.totalAmount ?? 0));
  }
  const sellerIds = await resolveGoalSellerIds(organizationId, goal);
  return sellersConfirmedRevenueInPeriod(organizationId, sellerIds, start, end);
}

/**
 * Meta aplicável ao vendedor no mês: prioridade SELLER > TEAM > ALL.
 */
export async function resolveApplicableGoalForSeller(
  organizationId: string,
  sellerId: string,
  year: number,
  month: number,
): Promise<
  | (SellerMonthlyGoal & {
      team: { id: string; name: string } | null;
    })
  | null
> {
  const seller = await prisma.seller.findFirst({
    where: { id: sellerId, organizationId },
    select: { id: true, teamId: true },
  });
  if (!seller) return null;

  const scopeKeys = [`SELLER:${sellerId}`, "ALL"];
  if (seller.teamId) scopeKeys.splice(1, 0, `TEAM:${seller.teamId}`);

  const goals = await prisma.sellerMonthlyGoal.findMany({
    where: {
      organizationId,
      year,
      month,
      scopeKey: { in: scopeKeys },
    },
    include: { team: { select: { id: true, name: true } } },
  });

  const byKey = new Map(goals.map((g) => [g.scopeKey, g]));
  return (
    byKey.get(`SELLER:${sellerId}`) ??
    (seller.teamId ? byKey.get(`TEAM:${seller.teamId}`) : undefined) ??
    byKey.get("ALL") ??
    null
  );
}

export async function notifyUserIdsForGoal(
  organizationId: string,
  goal: Pick<SellerMonthlyGoal, "scope" | "sellerId" | "teamId">,
): Promise<string[]> {
  const sellerIds = await resolveGoalSellerIds(organizationId, goal);
  if (sellerIds.length === 0) return [];
  const sellers = await prisma.seller.findMany({
    where: { id: { in: sellerIds }, organizationId },
    select: { userId: true },
  });
  return [...new Set(sellers.map((s) => s.userId))];
}

export const goalInclude = {
  seller: { include: { user: { select: { name: true } } } },
  team: { select: { id: true, name: true, _count: { select: { members: true } } } },
} as const;
