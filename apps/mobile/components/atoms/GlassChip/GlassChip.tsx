import { ThemedText } from "@/components/atoms/ThemedText";
import { useTheme } from "@/lib/theme";
import { radiiPx } from "@pedidos/design-tokens";
import type { ReactNode } from "react";
import {
    Pressable,
    StyleSheet,
    type StyleProp,
    type ViewStyle,
} from "react-native";

type Props = {
  label: ReactNode;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * Chip único do app (períodos, filtros, tema).
 * Ativo: fill chipActive + texto chipTextActive.
 * Inativo light: fill cinza suave + borda visível (estilo Top fornecedores).
 */
export function GlassChip({
  label,
  active = false,
  onPress,
  style,
  accessibilityLabel,
}: Props) {
  const { colors, isDark } = useTheme();

  const backgroundColor = active
    ? colors.chipActive
    : isDark
      ? colors.chip
      : "rgba(100, 116, 139, 0.14)";

  const borderColor = active
    ? colors.primary
    : isDark
      ? colors.border
      : "rgba(15, 23, 42, 0.12)";

  const textColor = active ? colors.chipTextActive : colors.chipText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={
        accessibilityLabel ?? (typeof label === "string" ? label : undefined)
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor,
          borderColor,
          opacity: pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {typeof label === "string" ? (
        <ThemedText
          variant="caption"
          style={[styles.label, { color: textColor }]}
        >
          {label}
        </ThemedText>
      ) : (
        label
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: radiiPx.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  label: {
    fontWeight: "600",
  },
});
