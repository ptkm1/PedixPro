import { describe, expect, it } from "vitest";
import {
  CATALOG_PRICE_INLINE_MAX,
  DEFAULT_CATALOG_PRICE_DISPLAY_MODE,
  filterValidCatalogPrices,
  parseCatalogPriceDisplayMode,
  pickCatalogDisplayPrice,
  resolveCatalogPriceDisplay,
  shouldCollapseCatalogPrices,
  type CatalogProductPrice,
} from "@pedidos/shared";

const tables = (
  prices: Array<{ name: string; price: number | null; id?: string }>,
): CatalogProductPrice[] =>
  prices.map((p, i) => ({
    priceTableId: p.id ?? `t${i + 1}`,
    priceTableName: p.name,
    price: p.price as number,
  }));

describe("catalog-price-display", () => {
  it("default mode is LOWEST (comportamento de 1 preço)", () => {
    expect(DEFAULT_CATALOG_PRICE_DISPLAY_MODE).toBe("LOWEST");
    expect(parseCatalogPriceDisplayMode(undefined)).toBe("LOWEST");
    expect(parseCatalogPriceDisplayMode("nope")).toBe("LOWEST");
  });

  it("1 tabela válida → single em qualquer modo", () => {
    const prices = tables([{ name: "Padrão", price: 48 }]);
    expect(resolveCatalogPriceDisplay(prices, "LOWEST")).toEqual({
      kind: "single",
      price: 48,
    });
    expect(resolveCatalogPriceDisplay(prices, "HIGHEST")).toEqual({
      kind: "single",
      price: 48,
    });
    expect(resolveCatalogPriceDisplay(prices, "ALL")).toEqual({
      kind: "list",
      prices: filterValidCatalogPrices(prices),
    });
  });

  it("3+ tabelas: LOWEST / HIGHEST escolhem min/max; ALL lista inline se ≤3", () => {
    const prices = tables([
      { name: "A", price: 10 },
      { name: "B", price: 30 },
      { name: "C", price: 20 },
    ]);
    expect(pickCatalogDisplayPrice(prices, "LOWEST")).toBe(10);
    expect(pickCatalogDisplayPrice(prices, "HIGHEST")).toBe(30);
    const all = resolveCatalogPriceDisplay(prices, "ALL");
    expect(all.kind).toBe("list");
    if (all.kind === "list") {
      expect(all.prices.map((p) => p.price)).toEqual([10, 20, 30]);
    }
  });

  it("10+ ALL → layout colapsado (A partir de + Ver N tabelas)", () => {
    const prices = tables(
      Array.from({ length: 10 }, (_, i) => ({
        name: `T${i + 1}`,
        price: (i + 1) * 5,
      })),
    );
    expect(shouldCollapseCatalogPrices(prices, "ALL")).toBe(true);
    expect(prices.length).toBeGreaterThan(CATALOG_PRICE_INLINE_MAX);
    const display = resolveCatalogPriceDisplay(prices, "ALL");
    expect(display).toEqual({
      kind: "collapsed",
      fromPrice: 5,
      tableCount: 10,
    });
  });

  it("ignora inativa/null/sem preço/negativo (filter)", () => {
    const raw = [
      { priceTableId: "1", priceTableName: "Ok", price: 12 },
      { priceTableId: "2", priceTableName: "Null", price: null as unknown as number },
      { priceTableId: "3", priceTableName: "Neg", price: -5 },
      { priceTableId: "4", priceTableName: "Zero", price: 0 },
      { priceTableId: "", priceTableName: "Sem id", price: 9 },
      { priceTableId: "5", priceTableName: "", price: 9 },
      undefined,
      null,
    ];
    const valid = filterValidCatalogPrices(raw);
    expect(valid).toHaveLength(1);
    expect(valid[0]!.price).toBe(12);
  });

  it("fallback para effectiveUnitPrice quando não há prices[] (offline legado)", () => {
    expect(resolveCatalogPriceDisplay([], "LOWEST", 48)).toEqual({
      kind: "single",
      price: 48,
    });
    expect(resolveCatalogPriceDisplay([], "ALL", null)).toEqual({
      kind: "empty",
    });
  });

  it("visual ≠ preço do pedido: modo só escolhe exibição, não muta a lista", () => {
    const prices = tables([
      { name: "Cliente", price: 40 },
      { name: "Global", price: 55 },
    ]);
    const orderPrice = 55; // resolução de pedido independente
    const display = resolveCatalogPriceDisplay(prices, "LOWEST");
    expect(display).toEqual({ kind: "single", price: 40 });
    expect(orderPrice).toBe(55);
    expect(prices.map((p) => p.price)).toEqual([40, 55]);
  });
});
