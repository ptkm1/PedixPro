import { ScrollView, Text, View } from "react-native";
import { ProductCatalogTile } from "../ProductCatalogTile";
import type { CatalogTileProduct } from "../ProductCatalogTile/catalog-tile.types";
import { useHorizontalProductRailStyles } from "./HorizontalProductRail.styles";

export function HorizontalProductRail(props: {
  title: string;
  products: CatalogTileProduct[];
  tileWidth: number;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  onProductPress: (p: CatalogTileProduct) => void;
  onQtyChange?: (p: CatalogTileProduct, qty: number) => void;
  qtyByProductId?: Record<string, number>;
  badgeBackgroundColor?: string;
}) {
  const {
    title,
    products,
    tileWidth,
    favoriteIds,
    onToggleFavorite,
    onProductPress,
    onQtyChange,
    qtyByProductId,
    badgeBackgroundColor,
  } = props;

  const styles = useHorizontalProductRailStyles({ cellWidth: tileWidth });

  if (!products.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {products.map((p) => (
          <View key={p.id} style={styles.cell}>
            <ProductCatalogTile
              variant="rail"
              tileWidth={tileWidth}
              product={p}
              favorite={favoriteIds.has(p.id)}
              onToggleFavorite={() => onToggleFavorite(p.id)}
              onAddPress={() => onProductPress(p)}
              onQtyChange={
                onQtyChange ? (qty) => onQtyChange(p, qty) : undefined
              }
              qtyInCart={qtyByProductId?.[p.id]}
              badgeBackgroundColor={badgeBackgroundColor}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
