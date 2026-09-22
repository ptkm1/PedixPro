/** Modo de exibição de preços no catálogo do app do vendedor (por org). */
export const CATALOG_PRICE_DISPLAY_MODES = ["ALL", "LOWEST", "HIGHEST"] as const;

export type CatalogPriceDisplayMode =
  (typeof CATALOG_PRICE_DISPLAY_MODES)[number];

/** Default para orgs existentes: um único valor (menor preço válido). */
export const DEFAULT_CATALOG_PRICE_DISPLAY_MODE: CatalogPriceDisplayMode =
  "LOWEST";

/** Até este total, no modo ALL as tabelas cabem no card; acima → resumo + sheet. */
export const CATALOG_PRICE_INLINE_MAX = 3;

export type CatalogProductPrice = {
  priceTableId: string;
  priceTableName: string;
  price: number;
};

export function isCatalogPriceDisplayMode(
  value: unknown,
): value is CatalogPriceDisplayMode {
  return (
    typeof value === "string" &&
    (CATALOG_PRICE_DISPLAY_MODES as readonly string[]).includes(value)
  );
}

export function parseCatalogPriceDisplayMode(
  value: unknown,
): CatalogPriceDisplayMode {
  return isCatalogPriceDisplayMode(value)
    ? value
    : DEFAULT_CATALOG_PRICE_DISPLAY_MODE;
}

/** Preço válido para exibição: número finito > 0. */
export function isValidCatalogPrice(price: unknown): price is number {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

/**
 * Filtra e ordena preços de catálogo (tabela ativa + preço > 0).
 * Ignora null/negativo/NaN e entradas sem nome/id.
 */
export function filterValidCatalogPrices(
  prices: ReadonlyArray<Partial<CatalogProductPrice> | null | undefined>,
): CatalogProductPrice[] {
  const out: CatalogProductPrice[] = [];
  for (const row of prices) {
    if (!row) continue;
    const id =
      typeof row.priceTableId === "string" ? row.priceTableId.trim() : "";
    const name =
      typeof row.priceTableName === "string" ? row.priceTableName.trim() : "";
    if (!id || !name) continue;
    if (!isValidCatalogPrice(row.price)) continue;
    out.push({
      priceTableId: id,
      priceTableName: name,
      price: row.price,
    });
  }
  out.sort((a, b) => {
    if (a.price !== b.price) return a.price - b.price;
    return a.priceTableName.localeCompare(b.priceTableName, "pt");
  });
  return out;
}

/** Um valor para modos LOWEST / HIGHEST; null se não houver preço válido. */
export function pickCatalogDisplayPrice(
  prices: ReadonlyArray<CatalogProductPrice>,
  mode: CatalogPriceDisplayMode,
): number | null {
  const valid = filterValidCatalogPrices(prices);
  if (!valid.length) return null;
  if (mode === "HIGHEST") return valid[valid.length - 1]!.price;
  // LOWEST e ALL (fallback de “a partir de” / card resumido)
  return valid[0]!.price;
}

/** Modo ALL com mais tabelas do que o card comporta inline. */
export function shouldCollapseCatalogPrices(
  prices: ReadonlyArray<CatalogProductPrice>,
  mode: CatalogPriceDisplayMode,
  inlineMax: number = CATALOG_PRICE_INLINE_MAX,
): boolean {
  if (mode !== "ALL") return false;
  return filterValidCatalogPrices(prices).length > inlineMax;
}

export type CatalogPriceDisplayKind =
  | { kind: "empty" }
  | { kind: "single"; price: number }
  | { kind: "list"; prices: CatalogProductPrice[] }
  | { kind: "collapsed"; fromPrice: number; tableCount: number };

/**
 * Decide o que o card do catálogo deve renderizar (só visualização).
 * Não altera preço de pedido / resolução de tabela do cliente.
 */
export function resolveCatalogPriceDisplay(
  prices: ReadonlyArray<Partial<CatalogProductPrice> | null | undefined>,
  mode: CatalogPriceDisplayMode | unknown,
  fallbackPrice?: number | null,
  inlineMax: number = CATALOG_PRICE_INLINE_MAX,
): CatalogPriceDisplayKind {
  const resolvedMode = parseCatalogPriceDisplayMode(mode);
  const valid = filterValidCatalogPrices(prices);

  if (!valid.length) {
    if (isValidCatalogPrice(fallbackPrice)) {
      return { kind: "single", price: fallbackPrice };
    }
    return { kind: "empty" };
  }

  if (resolvedMode === "LOWEST") {
    return { kind: "single", price: valid[0]!.price };
  }
  if (resolvedMode === "HIGHEST") {
    return { kind: "single", price: valid[valid.length - 1]!.price };
  }

  // ALL
  if (valid.length > inlineMax) {
    return {
      kind: "collapsed",
      fromPrice: valid[0]!.price,
      tableCount: valid.length,
    };
  }
  return { kind: "list", prices: valid };
}

export const CATALOG_PRICE_DISPLAY_MODE_LABELS: Record<
  CatalogPriceDisplayMode,
  string
> = {
  ALL: "Mostrar todas as tabelas",
  LOWEST: "Somente menor preço",
  HIGHEST: "Somente maior preço",
};
