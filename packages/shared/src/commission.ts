export type SellerCommissionType =
  | "FIXED"
  | "BY_PRODUCT"
  | "BY_CATEGORY"
  | "BY_SUPPLIER";

export const SELLER_COMMISSION_TYPES: ReadonlyArray<{
  value: SellerCommissionType;
  label: string;
  description: string;
  /** Opção reservada para feature futura (fornecedor). */
  comingSoon?: boolean;
}> = [
  {
    value: "FIXED",
    label: "Comissão fixa",
    description: "Mesmo percentual em todas as vendas do vendedor.",
  },
  {
    value: "BY_PRODUCT",
    label: "Por produto",
    description: "Percentual definido no cadastro de cada produto.",
  },
  {
    value: "BY_CATEGORY",
    label: "Por grupo de produtos",
    description: "Percentual definido na categoria (grupo) do produto.",
  },
  {
    value: "BY_SUPPLIER",
    label: "Por fornecedor",
    description: "Comissão por fornecedor — disponível em breve.",
    comingSoon: true,
  },
];

export function sellerCommissionTypeLabel(type: SellerCommissionType): string {
  return SELLER_COMMISSION_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** Origem gravada no item do pedido (snapshot). */
export const COMMISSION_ORIGIN = {
  PRICE_TABLE: "COMISSAO_TABELA_PRECO",
  PRODUCT_SELLER: "COMISSAO_PRODUTO_VENDEDOR",
  PRODUCT: "COMISSAO_PRODUTO",
  GROUP: "COMISSAO_GRUPO",
  SELLER_RULE: "COMISSAO_REGRA_VENDEDOR",
  PROGRESSIVE: "COMISSAO_PROGRESSIVA",
  SELLER: "COMISSAO_VENDEDOR",
} as const;

export type CommissionOrigin =
  (typeof COMMISSION_ORIGIN)[keyof typeof COMMISSION_ORIGIN];

export const COMMISSION_ORIGIN_LABELS: Record<CommissionOrigin, string> = {
  COMISSAO_TABELA_PRECO: "Tabela de preço",
  COMISSAO_PRODUTO_VENDEDOR: "Produto + vendedor",
  COMISSAO_PRODUTO: "Produto",
  COMISSAO_GRUPO: "Grupo de produtos",
  COMISSAO_REGRA_VENDEDOR: "Regra do vendedor",
  COMISSAO_PROGRESSIVA: "Faixa progressiva",
  COMISSAO_VENDEDOR: "Vendedor",
};

export function commissionOriginLabel(
  origin: CommissionOrigin | null | undefined,
): string {
  if (!origin) return "—";
  return COMMISSION_ORIGIN_LABELS[origin] ?? origin;
}

export type CommissionFacts = {
  /** Exceção produto + tabela (prioridade 1). */
  priceTablePercent?: number | null;
  /** Exceção produto + vendedor (prioridade 2). */
  sellerProductPercent?: number | null;
  productDefaultPercent?: number | null;
  /** SellerCommissionRule já escolhida (produto > grupo > geral). */
  sellerRulePercent?: number | null;
  groupPercent?: number | null;
  progressivePercent?: number | null;
  sellerType: SellerCommissionType;
  sellerDefaultPercent: number;
};

export type ResolvedCommission = {
  percent: number;
  origin: CommissionOrigin;
};

/**
 * Prioridade:
 * 1. Comissão da tabela de preço do produto
 * 2. Comissão do vendedor neste produto
 * 3. Comissão padrão do produto (modo BY_PRODUCT)
 * 4. Fallback atual: regra do vendedor, grupo, faixa progressiva, % cadastro
 */
export function resolveCommissionFromFacts(
  facts: CommissionFacts,
): ResolvedCommission {
  if (facts.priceTablePercent != null) {
    return {
      percent: facts.priceTablePercent,
      origin: COMMISSION_ORIGIN.PRICE_TABLE,
    };
  }
  if (facts.sellerProductPercent != null) {
    return {
      percent: facts.sellerProductPercent,
      origin: COMMISSION_ORIGIN.PRODUCT_SELLER,
    };
  }
  if (facts.sellerRulePercent != null) {
    return {
      percent: facts.sellerRulePercent,
      origin: COMMISSION_ORIGIN.SELLER_RULE,
    };
  }
  switch (facts.sellerType) {
    case "BY_PRODUCT":
      if (facts.productDefaultPercent != null) {
        return {
          percent: facts.productDefaultPercent,
          origin: COMMISSION_ORIGIN.PRODUCT,
        };
      }
      return {
        percent: facts.sellerDefaultPercent,
        origin: COMMISSION_ORIGIN.SELLER,
      };
    case "BY_CATEGORY":
      if (facts.groupPercent != null) {
        return {
          percent: facts.groupPercent,
          origin: COMMISSION_ORIGIN.GROUP,
        };
      }
      return {
        percent: facts.sellerDefaultPercent,
        origin: COMMISSION_ORIGIN.SELLER,
      };
    case "FIXED":
      if (facts.progressivePercent != null) {
        return {
          percent: facts.progressivePercent,
          origin: COMMISSION_ORIGIN.PROGRESSIVE,
        };
      }
      return {
        percent: facts.sellerDefaultPercent,
        origin: COMMISSION_ORIGIN.SELLER,
      };
    case "BY_SUPPLIER":
    default:
      return {
        percent: facts.sellerDefaultPercent,
        origin: COMMISSION_ORIGIN.SELLER,
      };
  }
}

export type ProductCommissionSync = {
  productId: string;
  productDefaultPercent: number | null;
  groupPercent: number | null;
  sellerProductPercent: number | null;
  priceTablePercents: Array<{ priceTableId: string; percent: number }>;
};

export type CommissionSyncPayload = {
  sellerType: SellerCommissionType;
  sellerDefaultPercent: number;
  products: ProductCommissionSync[];
};

export function pickPriceTableCommissionPercent(
  rows: Array<{ priceTableId: string; percent: number }>,
  priceTableId: string | null | undefined,
): number | null {
  if (!priceTableId) return null;
  const row = rows.find((r) => r.priceTableId === priceTableId);
  return row ? row.percent : null;
}

export function resolveSyncedProductCommission(params: {
  product: ProductCommissionSync;
  sellerType: SellerCommissionType;
  sellerDefaultPercent: number;
  priceTableId?: string | null;
  progressivePercent?: number | null;
  sellerRulePercent?: number | null;
}): ResolvedCommission {
  return resolveCommissionFromFacts({
    priceTablePercent: pickPriceTableCommissionPercent(
      params.product.priceTablePercents,
      params.priceTableId,
    ),
    sellerProductPercent: params.product.sellerProductPercent,
    productDefaultPercent: params.product.productDefaultPercent,
    sellerRulePercent: params.sellerRulePercent,
    groupPercent: params.product.groupPercent,
    progressivePercent: params.progressivePercent,
    sellerType: params.sellerType,
    sellerDefaultPercent: params.sellerDefaultPercent,
  });
}

export function roundCommissionMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function commissionAmountFromPercent(
  lineTotal: number,
  percent: number,
): number {
  return roundCommissionMoney((lineTotal * percent) / 100);
}
