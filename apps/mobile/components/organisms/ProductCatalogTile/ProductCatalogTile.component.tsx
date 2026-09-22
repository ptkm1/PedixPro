import { ProductPriceDisplay } from "@/components/molecules/ProductPriceDisplay";
import { useOrderSyncMode } from "@/hooks/useOrderSyncMode";
import { useTheme } from "@/lib/theme";
import {
  formatProductStockLabel,
  formatProductUnitLabel,
  isProductSaleBlockedByStock,
  parseCatalogPriceDisplayMode,
} from "@pedidos/shared";
import { Heart, Package } from "lucide-react-native";
import { Image, Pressable, Text, View } from "react-native";
import type { CatalogTileProduct } from "./catalog-tile.types";
import { useProductCatalogTileStyles } from "./ProductCatalogTile.styles";

export function ProductCatalogTile(props: {
  variant: "rail" | "grid" | "list";
  tileWidth: number;
  product: CatalogTileProduct;
  favorite: boolean;
  onToggleFavorite: () => void;
  onAddPress: () => void;
  qtyInCart?: number;
  badgeBackgroundColor?: string;
  disabled?: boolean;
}) {
  const {
    variant,
    tileWidth,
    product,
    favorite,
    onToggleFavorite,
    onAddPress,
    qtyInCart,
    badgeBackgroundColor,
    disabled: disabledProp,
  } = props;

  const stockQty = product.stockQty ?? 0;
  const blocked = isProductSaleBlockedByStock(
    stockQty,
    product.blockSaleWhenOutOfStock ?? false,
  );
  const disabled = disabledProp ?? blocked;
  const isPromo =
    Boolean(product.hasActivePromotion) || Boolean(product.promotionLabel);
  const isFeatured = Boolean(product.featured);
  const isHighlighted =
    Boolean(product.highlighted) || isFeatured || isPromo;

  const imgHeight = variant === "rail" ? 104 : variant === "list" ? 88 : 128;
  const styles = useProductCatalogTileStyles({
    variant,
    tileWidth,
    imgHeight,
    badgeBackgroundColor,
    disabled,
    highlighted: isHighlighted,
  });
  const { colors } = useTheme();
  const { settings } = useOrderSyncMode();
  const priceMode = parseCatalogPriceDisplayMode(
    settings?.catalogPriceDisplayMode,
  );
  const uri = product.imageUrl?.trim();
  const unitLabel = formatProductUnitLabel(product.attributes);
  const stockLabel = formatProductStockLabel(stockQty);

  const priceNode = (
    <ProductPriceDisplay
      productName={product.name}
      mode={priceMode}
      prices={product.prices}
      fallbackPrice={product.effectiveUnitPrice}
      catalogUnitPrice={product.catalogUnitPrice}
      hasActivePromotion={isPromo}
      attributes={variant === "list" ? undefined : product.attributes}
      align={variant === "list" ? "end" : "start"}
      compact={variant !== "list"}
    />
  );

  const highlightLabel = isPromo ? "Promo" : isFeatured ? "Destaque" : null;

  return (
    <View style={styles.card}>
      {highlightLabel && variant === "list" ? (
        <View
          pointerEvents="none"
          style={[
            styles.highlightChip,
            styles.listFloatingHighlightChip,
            {
              backgroundColor: isPromo ? colors.danger : colors.primary,
            },
          ]}
        >
          <Text
            style={styles.highlightChipTxt}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {highlightLabel}
          </Text>
        </View>
      ) : null}
      <Pressable
        hitSlop={6}
        style={styles.favBtn}
        onPress={onToggleFavorite}
        accessibilityLabel={
          favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"
        }
      >
        <Heart
          size={16}
          color={favorite ? "#ef4444" : "#94a3b8"}
          fill={favorite ? "#fecaca" : "transparent"}
          strokeWidth={2}
        />
      </Pressable>
      <Pressable
        style={styles.mainTap}
        onPress={onAddPress}
        disabled={disabled}
      >
        <View style={styles.imgBox}>
          {uri ? (
            <Image
              source={{ uri }}
              style={styles.img}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={styles.imgPh}>
              <Package
                size={variant === "list" ? 28 : 36}
                color="#94a3b8"
                strokeWidth={2}
              />
            </View>
          )}
          {highlightLabel && variant !== "list" ? (
            <View
              style={[
                styles.highlightChip,
                {
                  backgroundColor: isPromo ? colors.danger : colors.primary,
                },
              ]}
            >
              <Text
                style={styles.highlightChipTxt}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {highlightLabel}
              </Text>
            </View>
          ) : null}
          {qtyInCart != null && qtyInCart > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>{qtyInCart}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={variant === "list" ? 2 : 2}>
            {product.name}
          </Text>
          {product.category ? (
            <Text style={styles.catLine} numberOfLines={1}>
              {product.category.name}
            </Text>
          ) : null}
          {unitLabel && variant !== "list" ? (
            <Text style={styles.metaLine} numberOfLines={1}>
              {unitLabel}
            </Text>
          ) : null}
          <Text
            style={[
              styles.stockLine,
              { color: blocked ? colors.danger : colors.textMuted },
            ]}
            numberOfLines={1}
          >
            {stockLabel}
          </Text>
        </View>
        {variant === "list" ? (
          <View style={styles.trailing}>{priceNode}</View>
        ) : (
          priceNode
        )}
      </Pressable>
    </View>
  );
}
