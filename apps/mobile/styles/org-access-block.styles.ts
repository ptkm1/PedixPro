import { useTheme } from "@/lib/theme";
import { radiiPx } from "@pedidos/design-tokens";
import { useMemo } from "react";
import { StyleSheet } from "react-native";

export function useOrgAccessBlockStyles() {
  const { colors } = useTheme();

  return useMemo(
    () =>
      StyleSheet.create({
        title: { fontSize: 22, fontWeight: "700", color: colors.text },
        body: { fontSize: 16, color: colors.textSecondary, lineHeight: 24 },
        btn: {
          marginTop: 8,
          backgroundColor: colors.primary,
          paddingVertical: 14,
          borderRadius: radiiPx.lg,
          alignItems: "center",
        },
        btnText: {
          color: colors.primaryForeground,
          fontWeight: "600",
          fontSize: 16,
        },
      }),
    [colors],
  );
}
