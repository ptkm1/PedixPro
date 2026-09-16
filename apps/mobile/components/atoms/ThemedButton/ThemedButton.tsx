import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive";

type Props = PressableProps & {
  children: ReactNode;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  style?: StyleProp<ViewStyle>;
  loading?: boolean;
  loadingLabel?: string;
};

export function ThemedButton({
  children,
  variant = "primary",
  size = "md",
  style,
  disabled,
  loading,
  loadingLabel,
  ...rest
}: Props) {
  const { colors } = useTheme();
  const padV = size === "sm" ? 8 : size === "lg" ? 14 : 11;
  const padH = size === "sm" ? 12 : size === "lg" ? 20 : 16;
  const busy = Boolean(loading);
  const isDisabled = Boolean(disabled || busy);

  const bg =
    variant === "primary"
      ? colorWithAlpha(colors.primary, 0.88)
      : variant === "secondary"
        ? colors.glassFill
        : variant === "destructive"
          ? colors.danger
          : "transparent";

  const borderColor =
    variant === "outline"
      ? colors.glassBorder
      : variant === "ghost"
        ? "transparent"
        : variant === "primary"
          ? colorWithAlpha(colors.primary, 0.65)
          : variant === "secondary"
            ? colors.glassBorder
            : bg;

  const textColor =
    variant === "primary" || variant === "destructive"
      ? colors.primaryForeground
      : variant === "secondary"
        ? colors.text
        : variant === "outline"
          ? colors.primary
          : colors.text;

  const spinnerColor =
    variant === "primary" || variant === "destructive"
      ? colors.primaryForeground
      : colors.primary;

  const label =
    busy && loadingLabel
      ? loadingLabel
      : typeof children === "string"
        ? children
        : null;

  const fontSize = size === "sm" ? 14 : 16;

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor:
            variant === "outline" || variant === "ghost" ? colors.glassFill : bg,
          borderWidth: 1.5,
          borderColor,
          borderRadius: 16,
          paddingVertical: padV,
          paddingHorizontal: padH,
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: variant === "primary" ? colors.primary : "transparent",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: variant === "primary" ? 0.45 : 0,
          shadowRadius: 10,
        },
        style,
      ]}
      {...rest}
    >
      {busy ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator color={spinnerColor} size="small" />
          {label ? (
            <Text style={{ color: textColor, fontWeight: "600", fontSize }}>
              {label}
            </Text>
          ) : typeof children !== "string" ? (
            children
          ) : null}
        </View>
      ) : typeof children === "string" ? (
        <Text style={{ color: textColor, fontWeight: "600", fontSize }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
