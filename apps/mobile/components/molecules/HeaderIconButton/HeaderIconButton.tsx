import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  badge?: number;
  accessibilityLabel?: string;
  disabled?: boolean;
};

export function HeaderIconButton({
  children,
  onPress,
  badge,
  accessibilityLabel,
  disabled,
}: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        {
          backgroundColor: colors.glassFill,
          borderColor: colors.glassBorder,
        },
        disabled ? styles.disabled : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      {children}
      {badge != null && badge > 0 ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
            },
          ]}
        >
          <Text
            style={{
              color: colors.primaryForeground,
              fontSize: 10,
              fontWeight: "700",
            }}
          >
            {badge > 9 ? "9+" : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  disabled: {
    opacity: 0.45,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
