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
};

/**
 * Vidro suave: blur + tint leve + borda discreta.
 * Sem sombra forte nem gradiente marcado.
 */
export function GlassSurface({
  children,
  style,
  contentStyle,
  padded = true,
  radius = radiiPx["2xl"],
}: Props) {
  const { isDark } = useTheme();

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
          backgroundColor:
            Platform.OS === "android"
              ? colorWithAlpha(isDark ? "#0d2438" : "#ffffff", 0.55)
              : "transparent",
        },
        style,
      ]}
    >
      <BlurView
        intensity={Platform.OS === "ios" ? 55 : 40}
        tint={isDark ? "dark" : "light"}
        blurMethod={
          Platform.OS === "android" ? "dimezisBlurView" : undefined
        }
        style={StyleSheet.absoluteFillObject}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: tint }]}
      />
      {/* Filete bem fino no topo */}
      <View
        pointerEvents="none"
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
    overflow: "hidden",
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
