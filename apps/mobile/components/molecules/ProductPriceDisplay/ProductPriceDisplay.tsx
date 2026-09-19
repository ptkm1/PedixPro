import { fmtMoney } from "@/components/atoms/formatMoney";
import { ProductPriceTablesSheet } from "@/components/molecules/ProductPriceTablesSheet";
import { useTheme } from "@/lib/theme";
import {
  filterValidCatalogPrices,
  formatProductPriceWithUnit,
  resolveCatalogPriceDisplay,
  type CatalogPriceDisplayMode,
  type CatalogProductPrice,
} from "@pedidos/shared";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type ProductPriceDisplayProps = {
  productName: string;
  mode: CatalogPriceDisplayMode;
  prices?: ReadonlyArray<CatalogProductPrice | null | undefined>;
  /** Fallback (legado / sem prices[]): preço efetivo já resolvido. */
  fallbackPrice?: number | null;
  catalogUnitPrice?: number | null;
  hasActivePromotion?: boolean;
  attributes?: Record<string, unknown> | null;
  /** list = alinhado à direita no trailing do tile */
  align?: "start" | "end";
  compact?: boolean;
};

export function ProductPriceDisplay(props: ProductPriceDisplayProps) {
  const {
    productName,
    mode,
    prices,
    fallbackPrice,
    catalogUnitPrice,
    hasActivePromotion,
    attributes,
    align = "start",
    compact = false,
  } = props;
  const { colors } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const valid = filterValidCatalogPrices(prices ?? []);
  const display = resolveCatalogPriceDisplay(valid, mode, fallbackPrice ?? null);

  const alignStyle = {
    color: colors.success,
    textAlign: (align === "end" ? "right" : "left") as "left" | "right",
  };
  const mutedAlignStyle = {
    color: colors.textMuted,
    textAlign: (align === "end" ? "right" : "left") as "left" | "right",
  };
  const linkAlignStyle = {
    color: colors.link,
    textAlign: (align === "end" ? "right" : "left") as "left" | "right",
  };

  let body: ReactNode;
  if (display.kind === "empty") {
    body = (
      <Text style={[styles.muted, compact && styles.priceCompact, mutedAlignStyle]}>
        Sem preço
      </Text>
    );
  } else if (display.kind === "single") {
    const priceText =
      attributes != null
        ? formatProductPriceWithUnit(display.price, attributes)
        : `R$ ${fmtMoney(display.price)}`;
    // Strike de promoção só quando não há prices[] de tabela (fallback legado).
    const showCatalogStrike =
      valid.length === 0 &&
      Boolean(hasActivePromotion) &&
      typeof catalogUnitPrice === "number" &&
      catalogUnitPrice > display.price;
    body = (
      <View style={align === "end" ? styles.alignEnd : undefined}>
        {showCatalogStrike ? (
          <Text style={[styles.strike, { color: colors.textMuted }]}>
            R$ {fmtMoney(catalogUnitPrice!)}
          </Text>
        ) : null}
        <Text style={[styles.price, compact && styles.priceCompact, alignStyle]}>
          {priceText}
        </Text>
      </View>
    );
  } else if (display.kind === "list") {
    body = (
      <View style={align === "end" ? styles.alignEnd : undefined}>
        {display.prices.map((row) => (
          <Text
            key={row.priceTableId}
            style={[styles.price, compact && styles.priceCompact, alignStyle]}
            numberOfLines={1}
          >
            {row.priceTableName}: R$ {fmtMoney(row.price)}
          </Text>
        ))}
      </View>
    );
  } else {
    body = (
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          setSheetOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Ver ${display.tableCount} tabelas de preço`}
        style={align === "end" ? styles.alignEnd : undefined}
        hitSlop={8}
      >
        <Text style={[styles.price, compact && styles.priceCompact, alignStyle]}>
          A partir de R$ {fmtMoney(display.fromPrice)}
        </Text>
        <Text style={[styles.link, linkAlignStyle]}>
          Ver {display.tableCount} tabelas ›
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      {body}
      <ProductPriceTablesSheet
        visible={sheetOpen}
        productName={productName}
        prices={valid}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
  },
  alignEnd: {
    alignItems: "flex-end",
  },
  price: {
    fontSize: 14,
    fontWeight: "800",
  },
  priceCompact: {
    fontSize: 12,
  },
  muted: {
    fontSize: 13,
    fontWeight: "600",
  },
  link: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
  },
  strike: {
    fontSize: 11,
    textDecorationLine: "line-through",
    marginBottom: 1,
  },
});
