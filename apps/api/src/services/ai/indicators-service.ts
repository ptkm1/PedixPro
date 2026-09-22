import type {
  AiIndicatorsLatest,
  AiIndicatorsPayload,
  AiIndicatorsStatus,
} from "@pedidos/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { orgHasPlanFeature } from "../billing/entitlements.js";
import { buildDistributorInsights } from "../distributor-insights.js";
import { decToNum } from "../../util/money.js";
import {
  AI_INDICATORS_SYSTEM_PROMPT,
  buildAiIndicatorsUserPrompt,
  parseAiIndicatorsPayload,
} from "./indicators-prompt.js";
import {
  evaluateQuotaGate,
  readCooldownMinutes,
  readMaxCompletionTokens,
  readMaxPerDay,
  readMaxPerHour,
  readMaxPerMonth,
  startOfUtcDay,
  startOfUtcMonth,
} from "./indicators-quotas.js";
import {
  estimateOpenAiCostUsd,
  isAiIndicatorsGloballyEnabled,
  openAiChatJson,
  readOpenAiModel,
} from "./openai-client.js";

function toLatest(
  row: {
    payload: unknown;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: Prisma.Decimal | null;
    generatedAt: Date;
  },
): AiIndicatorsLatest {
  return {
    payload: row.payload as AiIndicatorsPayload,
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    estimatedCostUsd:
      row.estimatedCostUsd != null ? decToNum(row.estimatedCostUsd) : null,
    generatedAt: row.generatedAt.toISOString(),
  };
}

async function countUsageSince(
  organizationId: string,
  since: Date,
): Promise<number> {
  return prisma.aiUsageEvent.count({
    where: {
      organizationId,
      kind: "indicators_generate",
      createdAt: { gte: since },
    },
  });
}

export async function getAiIndicatorsStatus(
  organizationId: string,
): Promise<AiIndicatorsStatus> {
  const globallyEnabled = isAiIndicatorsGloballyEnabled();
  const planAllowed = await orgHasPlanFeature(organizationId, "reports_ai");
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { aiIndicatorsEnabled: true },
  });
  const orgEnabled = Boolean(org?.aiIndicatorsEnabled);
  const now = new Date();
  const [usageLastHour, usageToday, usageThisMonth, latestRow] =
    await Promise.all([
      countUsageSince(organizationId, new Date(now.getTime() - 60 * 60 * 1000)),
      countUsageSince(organizationId, startOfUtcDay(now)),
      countUsageSince(organizationId, startOfUtcMonth(now)),
      prisma.organizationAiIndicator.findUnique({
        where: { organizationId },
      }),
    ]);

  const maxPerHour = readMaxPerHour();
  const maxPerDay = readMaxPerDay();
  const maxPerMonth = readMaxPerMonth();
  const cooldownMinutes = readCooldownMinutes();

  let reason: string | null = null;
  let canGenerate = true;
  let cooldownRemainingSeconds = 0;

  if (!globallyEnabled) {
    canGenerate = false;
    reason =
      "Indicadores IA estão desligados no servidor (AI_INDICATORS_ENABLED / OPENAI_API_KEY).";
  } else if (!planAllowed) {
    canGenerate = false;
    reason = "Seu plano não inclui análise por IA (reports_ai).";
  } else if (!orgEnabled) {
    canGenerate = false;
    reason = "Ative Indicadores IA nas configurações da organização.";
  } else {
    const gate = evaluateQuotaGate({
      usageLastHour,
      usageToday,
      usageThisMonth,
      lastGeneratedAt: latestRow?.generatedAt ?? null,
      now,
    });
    if (!gate.ok) {
      canGenerate = false;
      reason = gate.reason;
      cooldownRemainingSeconds = gate.cooldownRemainingSeconds;
    }
  }

  return {
    globallyEnabled,
    planAllowed,
    orgEnabled,
    canGenerate,
    reason,
    model: readOpenAiModel(),
    latest: latestRow ? toLatest(latestRow) : null,
    usageLastHour,
    usageToday,
    usageThisMonth,
    maxPerHour,
    maxPerDay,
    maxPerMonth,
    cooldownMinutes,
    cooldownRemainingSeconds,
  };
}

export async function setAiIndicatorsEnabled(
  organizationId: string,
  enabled: boolean,
): Promise<{ aiIndicatorsEnabled: boolean }> {
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { aiIndicatorsEnabled: enabled },
    select: { aiIndicatorsEnabled: true },
  });
  return { aiIndicatorsEnabled: updated.aiIndicatorsEnabled };
}

export async function getLatestAiIndicators(
  organizationId: string,
): Promise<AiIndicatorsLatest | null> {
  const row = await prisma.organizationAiIndicator.findUnique({
    where: { organizationId },
  });
  return row ? toLatest(row) : null;
}

/** Monta métricas agregadas (sem PII) para o prompt. */
async function buildMetricsSnapshot(organizationId: string) {
  const insights = await buildDistributorInsights(organizationId);
  return {
    generatedAt: insights.generatedAt,
    hints: insights.hints,
    today: {
      label: insights.today.label,
      sellersTop: insights.today.sellers.slice(0, 5).map((s) => ({
        name: s.name,
        orderCount: s.orderCount,
        totalAmount: s.totalAmount,
      })),
      productsTop: insights.today.products.slice(0, 5).map((p) => ({
        productName: p.productName,
        quantity: p.quantity,
        totalAmount: p.totalAmount,
      })),
      suppliersTop: insights.today.suppliers.slice(0, 5).map((s) => ({
        tradeName: s.tradeName,
        quantity: s.quantity,
        totalAmount: s.totalAmount,
      })),
    },
    sellersWithoutPositivacaoTodayCount:
      insights.sellersWithoutPositivacaoToday.length,
    sellersWithoutCustomersCount: insights.sellersWithoutCustomers.length,
    sellersPortfolioAttention: insights.sellersPortfolioAttention
      .slice(0, 5)
      .map((s) => ({
        name: s.name,
        staleCustomersCount: s.staleCustomersCount,
        assignedCustomersCount: s.assignedCustomersCount,
        worstCustomerDays: s.worstCustomerDays,
      })),
    stagnantProductsCount: insights.stagnantProducts.length,
    stagnantProductsSample: insights.stagnantProducts.slice(0, 5).map((p) => ({
      name: p.name,
      daysSinceLastSale: p.daysSinceLastSale,
      neverSold: p.neverSold,
    })),
    churnCustomersCount: insights.churnCustomers.length,
    churnCustomersSample: insights.churnCustomers.slice(0, 5).map((c) => ({
      // só iniciais / nome comercial agregado — sem documento
      name: c.name,
      daysSinceLastPurchase: c.daysSinceLastPurchase,
      sellerName: c.sellerName,
    })),
  };
}

export async function generateAiIndicators(params: {
  organizationId: string;
  userId: string;
}): Promise<AiIndicatorsLatest> {
  const status = await getAiIndicatorsStatus(params.organizationId);
  if (!status.canGenerate) {
    throw new Error(status.reason || "Não é possível gerar Indicadores IA.");
  }

  const metrics = await buildMetricsSnapshot(params.organizationId);
  const userPrompt = buildAiIndicatorsUserPrompt(JSON.stringify(metrics));

  let rawContent: string;
  let model: string;
  let usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  try {
    const chat = await openAiChatJson({
      system: AI_INDICATORS_SYSTEM_PROMPT,
      user: userPrompt,
      maxCompletionTokens: readMaxCompletionTokens(),
    });
    rawContent = chat.content;
    model = chat.model;
    usage = chat.usage;
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "AI_INDICATORS_FAILED",
        organizationId: params.organizationId,
        reason: e instanceof Error ? e.message : "unknown",
      }),
    );
    throw e;
  }

  let payload: AiIndicatorsPayload;
  try {
    const parsedJson = JSON.parse(rawContent) as unknown;
    payload = parseAiIndicatorsPayload(parsedJson);
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "AI_INDICATORS_FAILED",
        organizationId: params.organizationId,
        reason: "invalid_json_schema",
      }),
    );
    throw new Error(
      e instanceof Error
        ? `Resposta da IA inválida: ${e.message}`
        : "Resposta da IA inválida.",
    );
  }

  const estimatedCostUsd = estimateOpenAiCostUsd(model, usage);
  const costDec = new Prisma.Decimal(estimatedCostUsd);

  const [row] = await prisma.$transaction([
    prisma.organizationAiIndicator.upsert({
      where: { organizationId: params.organizationId },
      create: {
        organizationId: params.organizationId,
        payload,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: costDec,
        generatedByUserId: params.userId,
        generatedAt: new Date(),
      },
      update: {
        payload,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: costDec,
        generatedByUserId: params.userId,
        generatedAt: new Date(),
      },
    }),
    prisma.aiUsageEvent.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        kind: "indicators_generate",
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: costDec,
      },
    }),
  ]);

  return toLatest(row);
}
