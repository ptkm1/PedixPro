import { useBlurTarget } from "@/lib/blur-target";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { radiiPx } from "@pedidos/design-tokens";
import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import {
    Platform,
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from "react-native";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  padded?: boolean;
  radius?: number;
  /** Permite conteúdo (tooltip) sair do card; o vidro continua clipado. */
  overflowVisible?: boolean;
};

/**
 * Vidro suave: blur + tint leve + borda discreta.
 * Android: dimezisBlurView só com blurTarget do SafeScreen.
 */
export function GlassSurface({
  children,
  style,
  contentStyle,
  padded = true,
  radius = radiiPx["2xl"],
  overflowVisible = false,
}: Props) {
  const { isDark } = useTheme();
  const blurTarget = useBlurTarget();
  const androidBlur =
    Platform.OS === "android" && blurTarget
      ? ({
          blurMethod: "dimezisBlurViewSdk31Plus" as const,
          blurTarget,
        } as const)
      : Platform.OS === "android"
        ? ({ blurMethod: "none" as const } as const)
        : {};

  const tint = colorWithAlpha(
    isDark ? "#0d2438" : "#ffffff",
    isDark ? 0.45 : 0.55,
  );
  const rim = isDark
    ? "rgba(125, 211, 252, 0.18)"
    : "rgba(2, 68, 92, 0.12)";

  return (
    <View
      style={[
        styles.shell,
        {
          borderRadius: radius,
          borderColor: rim,
          overflow: overflowVisible ? "visible" : "hidden",
          backgroundColor:
            Platform.OS === "android"
              ? colorWithAlpha(isDark ? "#0d2438" : "#ffffff", 0.55)
              : "transparent",
        },
        style,
      ]}
    >
      {/* Camada de vidro sempre clipada no radius — evita “vazamento” nos cantos */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { borderRadius: radius, overflow: "hidden" },
        ]}
      >
        <BlurView
          intensity={Platform.OS === "ios" ? 55 : 40}
          tint={isDark ? "dark" : "light"}
          {...androidBlur}
          style={StyleSheet.absoluteFillObject}
        />
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: tint }]}
        />
        <View
          style={[
            styles.topEdge,
            {
              borderTopLeftRadius: radius,
              borderTopRightRadius: radius,
              backgroundColor: colorWithAlpha(
                isDark ? "#a5e8ff" : "#ffffff",
                isDark ? 0.22 : 0.5,
              ),
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.content,
          { padding: padded ? 14 : 0 },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 8,
    right: 8,
    height: StyleSheet.hairlineWidth,
    zIndex: 2,
    opacity: 0.7,
  },
  content: {
    position: "relative",
    zIndex: 3,
  },
});
