import { ProductCatalogTile } from "@/components/organisms/ProductCatalogTile";
import type { CatalogTileProduct } from "@/components/organisms/ProductCatalogTile/catalog-tile.types";
import type { CatalogViewMode } from "@/hooks/useCatalogViewMode";
import { useTheme } from "@/lib/theme";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  title: string;
  products: CatalogTileProduct[];
  viewMode: CatalogViewMode;
  tileWidth: number;
  listTileWidth: number;
  catalogGap?: number;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  onProductPress: (p: CatalogTileProduct) => void;
  onQtyChange?: (p: CatalogTileProduct, qty: number) => void;
  qtyByProductId?: Record<string, number>;
  defaultExpanded?: boolean;
};

export function CollapsibleCatalogSection({
  title,
  products,
  viewMode,
  tileWidth,
  listTileWidth,
  catalogGap = 10,
  favoriteIds,
  onToggleFavorite,
  onProductPress,
  onQtyChange,
  qtyByProductId,
  defaultExpanded = true,
}: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!products.length) return null;

  return (
    <View>
      <Pressable
        style={styles.headerBtn}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
      >
        <Text style={[styles.headerLabel, { color: colors.textSecondary }]}>
          {title}
        </Text>
        {expanded ? (
          <ChevronUp size={20} color={colors.textSecondary} />
        ) : (
          <ChevronDown size={20} color={colors.textSecondary} />
        )}
      </Pressable>
      {expanded ? (
        viewMode === "list" ? (
          <View style={styles.list}>
            {products.map((p) => (
              <ProductCatalogTile
                key={p.id}
                variant="list"
                tileWidth={listTileWidth}
                product={p}
                favorite={favoriteIds.has(p.id)}
                onToggleFavorite={() => onToggleFavorite(p.id)}
                onAddPress={() => onProductPress(p)}
                onQtyChange={
                  onQtyChange ? (qty) => onQtyChange(p, qty) : undefined
                }
                qtyInCart={qtyByProductId?.[p.id]}
              />
            ))}
          </View>
        ) : (
          <View style={[styles.grid, { gap: catalogGap }]}>
            {products.map((p) => (
              <ProductCatalogTile
                key={p.id}
                variant="grid"
                tileWidth={tileWidth}
                product={p}
                favorite={favoriteIds.has(p.id)}
                onToggleFavorite={() => onToggleFavorite(p.id)}
                onAddPress={() => onProductPress(p)}
                onQtyChange={
                  onQtyChange ? (qty) => onQtyChange(p, qty) : undefined
                }
                qtyInCart={qtyByProductId?.[p.id]}
              />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 4,
  },
  headerLabel: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  list: { gap: 10, marginBottom: 4 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 4,
  },
});
