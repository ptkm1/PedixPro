import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "../../../lib/theme";

export type ProductCatalogTileStylesParams = {
  variant: "rail" | "grid" | "list";
  tileWidth: number;
  imgHeight: number;
  badgeBackgroundColor?: string;
  disabled?: boolean;
  highlighted?: boolean;
};

export function useProductCatalogTileStyles(
  params: ProductCatalogTileStylesParams,
) {
  const { colors } = useTheme();
  const {
    variant,
    tileWidth,
    imgHeight,
    badgeBackgroundColor = colors.primary,
    disabled = false,
    highlighted = false,
  } = params;

  return useMemo(
    () =>
      StyleSheet.create({
        card: {
          width: tileWidth,
          backgroundColor: colors.card,
          borderRadius: 14,
          borderWidth: highlighted ? 1.5 : 1,
          borderColor: highlighted ? colors.primary : colors.border,
          overflow: "hidden",
          marginBottom: variant === "list" ? 10 : 2,
          opacity: disabled ? 0.55 : 1,
        },
        favBtn: {
          position: "absolute",
          top: variant === "list" ? 10 : 6,
          right: variant === "list" ? 10 : 6,
          zIndex: 2,
          padding: 6,
          borderRadius: 20,
          backgroundColor: colors.background,
        },
        mainTap: {
          flexDirection: variant === "list" ? "row" : "column",
          alignItems: variant === "list" ? "center" : "stretch",
          paddingHorizontal: variant === "list" ? 10 : 10,
          paddingBottom: variant === "list" ? 10 : 10,
          paddingTop: variant === "list" ? 10 : 8,
          gap: variant === "list" ? 12 : 0,
        },
        imgBox: {
          width: variant === "list" ? 56 : "100%",
          height: variant === "list" ? 56 : imgHeight,
          borderRadius: 10,
          overflow: "hidden",
          backgroundColor: colors.surfaceMuted,
          marginBottom: variant === "list" ? 0 : 8,
        },
        img: { width: "100%", height: "100%" },
        imgPh: { flex: 1, alignItems: "center", justifyContent: "center" },
        highlightChip: {
          position: "absolute",
          top: 6,
          left: 6,
          paddingHorizontal: 7,
          paddingVertical: 3,
          borderRadius: 6,
        },
        highlightChipTxt: {
          color: "#fff",
          fontWeight: "800",
          fontSize: 10,
          letterSpacing: 0.2,
        },
        badge: {
          position: "absolute",
          bottom: 8,
          right: 8,
          backgroundColor: badgeBackgroundColor,
          minWidth: 26,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 10,
          alignItems: "center",
        },
        badgeTxt: {
          color: colors.chipTextActive,
          fontWeight: "800",
          fontSize: 13,
        },
        catalogStrike: {
          fontSize: 11,
          color: colors.textMuted,
          textDecorationLine: "line-through",
          marginBottom: 1,
        },
        body: {
          flex: variant === "list" ? 1 : undefined,
          paddingRight: 0,
        },
        trailing: {
          ...(variant === "list" && {
            minWidth: 96,
            alignItems: "flex-end",
            justifyContent: "flex-end",
            alignSelf: "stretch",
          }),
        },
        name: {
          fontSize: variant === "list" ? 14 : 12,
          fontWeight: "700",
          color: colors.text,
          lineHeight: variant === "list" ? 20 : 18,
          minHeight: variant === "list" ? undefined : 36,
        },
        catLine: {
          marginTop: 2,
          fontSize: 11,
          fontWeight: "600",
          color: colors.link,
        },
        metaLine: {
          marginTop: 4,
          fontSize: 11,
          fontWeight: "600",
          color: colors.textMuted,
        },
        stockLine: { marginTop: 2, fontSize: 11, fontWeight: "700" },
        price: {
          marginTop: 6,
          fontSize: variant === "list" ? 14 : 12,
          fontWeight: "800",
          color: colors.success,
        },
        noPrice: {
          marginTop: 6,
          fontSize: 13,
          fontWeight: "600",
          color: colors.textMuted,
        },
        listFloatingHighlightChip: {
          top: 8,
          left: 8,
          // Reserva o selo ao espaço da miniatura: nunca alcança o título.
          maxWidth: 76,
          zIndex: 3,
        },
        qtyEditor: {
          paddingHorizontal: variant === "list" ? 10 : 8,
          paddingBottom: 10,
          paddingTop: 2,
          alignItems: variant === "list" ? "flex-end" : "center",
        },
      }),
    [
      colors,
      variant,
      tileWidth,
      imgHeight,
      badgeBackgroundColor,
      disabled,
      highlighted,
    ],
  );
}
