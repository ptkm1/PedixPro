import {
  COMMISSION_ORIGIN,
  resolveCommissionFromFacts,
  resolveSyncedProductCommission,
  type CommissionFacts,
} from "@pedidos/shared";
import { describe, expect, it } from "vitest";

const byProduct: CommissionFacts["sellerType"] = "BY_PRODUCT";

function facts(
  overrides: Partial<CommissionFacts> &
    Pick<CommissionFacts, "sellerDefaultPercent">,
): CommissionFacts {
  return {
    sellerType: byProduct,
    ...overrides,
  };
}

describe("resolveCommissionFromFacts — exceções produto/tabela/vendedor", () => {
  it("TEST 1: padrão 10%, João sem exceção, tabela À Vista sem exceção → 10%", () => {
    const r = resolveCommissionFromFacts(
      facts({
        productDefaultPercent: 10,
        sellerProductPercent: null,
        priceTablePercent: null,
        sellerDefaultPercent: 0,
      }),
    );
    expect(r.percent).toBe(10);
    expect(r.origin).toBe(COMMISSION_ORIGIN.PRODUCT);
  });

  it("TEST 2: padrão 10%, Pedro 8%, tabela À Vista sem exceção → 8%", () => {
    const r = resolveCommissionFromFacts(
      facts({
        productDefaultPercent: 10,
        sellerProductPercent: 8,
        priceTablePercent: null,
        sellerDefaultPercent: 0,
      }),
    );
    expect(r.percent).toBe(8);
    expect(r.origin).toBe(COMMISSION_ORIGIN.PRODUCT_SELLER);
  });

  it("TEST 3: João 10%, Atacado 5% → tabela ganha (5%)", () => {
    const r = resolveCommissionFromFacts(
      facts({
        productDefaultPercent: 10,
        sellerProductPercent: 10,
        priceTablePercent: 5,
        sellerDefaultPercent: 0,
      }),
    );
    expect(r.percent).toBe(5);
    expect(r.origin).toBe(COMMISSION_ORIGIN.PRICE_TABLE);
  });

  it("TEST 4: Pedro 8%, Atacado 5% → 5%", () => {
    const r = resolveCommissionFromFacts(
      facts({
        productDefaultPercent: 10,
        sellerProductPercent: 8,
        priceTablePercent: 5,
        sellerDefaultPercent: 0,
      }),
    );
    expect(r.percent).toBe(5);
    expect(r.origin).toBe(COMMISSION_ORIGIN.PRICE_TABLE);
  });

  it("TEST 5: Pedro 8%, Distribuidor 4% → 4%", () => {
    const r = resolveSyncedProductCommission({
      product: {
        productId: "p1",
        productDefaultPercent: 10,
        groupPercent: null,
        sellerProductPercent: 8,
        priceTablePercents: [
          { priceTableId: "atacado", percent: 5 },
          { priceTableId: "distribuidor", percent: 4 },
        ],
      },
      sellerType: "BY_PRODUCT",
      sellerDefaultPercent: 0,
      priceTableId: "distribuidor",
    });
    expect(r.percent).toBe(4);
    expect(r.origin).toBe(COMMISSION_ORIGIN.PRICE_TABLE);
  });

  it("TEST 6: Pedro 8%, tabela A Prazo sem exceção → 8%", () => {
    const r = resolveSyncedProductCommission({
      product: {
        productId: "p1",
        productDefaultPercent: 10,
        groupPercent: null,
        sellerProductPercent: 8,
        priceTablePercents: [{ priceTableId: "atacado", percent: 5 }],
      },
      sellerType: "BY_PRODUCT",
      sellerDefaultPercent: 0,
      priceTableId: "a-prazo",
    });
    expect(r.percent).toBe(8);
    expect(r.origin).toBe(COMMISSION_ORIGIN.PRODUCT_SELLER);
  });

  it("mantém fallback de grupo quando não há produto/vendedor/tabela", () => {
    const r = resolveCommissionFromFacts({
      sellerType: "BY_CATEGORY",
      sellerDefaultPercent: 3,
      groupPercent: 7,
    });
    expect(r.percent).toBe(7);
    expect(r.origin).toBe(COMMISSION_ORIGIN.GROUP);
  });
});
