import { useBlurTarget } from "@/lib/blur-target";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { radiiPx } from "@pedidos/design-tokens";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
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

/** Fill sólido light — evita “furo” azul de Svg/SurfaceView no Android. */
const LIGHT_FILL = "#F7F8FA";

/**
 * Vidro suave: blur + tint leve + borda discreta.
 * Light: fill quase sólido (Android Svg não pode furar para o gradiente).
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
  const androidCanBlur = Platform.OS === "android" && Boolean(blurTarget);
  /** Blur nativo só onde não cria artefato (iOS; Android dark). */
  const useNativeBlur =
    Platform.OS === "ios" || (androidCanBlur && isDark);

  const androidBlur = useNativeBlur
    ? androidCanBlur
      ? ({
          blurMethod: "dimezisBlurViewSdk31Plus" as const,
          blurTarget,
          blurReductionFactor: isDark ? 3 : 1,
        } as const)
      : {}
    : Platform.OS === "android"
      ? ({ blurMethod: "none" as const } as const)
      : {};

  const tint = isDark
    ? colorWithAlpha("#0d2438", 0.45)
    : useNativeBlur
      ? colorWithAlpha("#FFFFFF", 0.28)
      : LIGHT_FILL;

  const rim = isDark
    ? "rgba(125, 211, 252, 0.22)"
    : "rgba(255, 255, 255, 0.98)";

  const shellFill = useNativeBlur
    ? "transparent"
    : isDark
      ? colorWithAlpha("#FFFFFF", 0.55)
      : LIGHT_FILL;

  const blurIntensity = Platform.OS === "ios" ? (isDark ? 55 : 72) : 48;
  const blurTint = isDark
    ? ("systemThinMaterialDark" as const)
    : ("systemUltraThinMaterialLight" as const);

  const useElevation = isDark || Platform.OS === "ios";

  return (
    <View
      style={[
        styles.shell,
        {
          borderRadius: radius,
          borderColor: rim,
          overflow: overflowVisible ? "visible" : "hidden",
          backgroundColor: shellFill,
          shadowColor: isDark ? "#000" : "#9CA3AF",
          shadowOpacity: useElevation ? (isDark ? 0.25 : 0.1) : 0,
          shadowRadius: isDark ? 10 : 14,
          shadowOffset: { width: 0, height: isDark ? 4 : 5 },
          elevation: useElevation && isDark ? 3 : 0,
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { borderRadius: radius, overflow: "hidden" },
        ]}
      >
        {useNativeBlur ? (
          <BlurView
            intensity={blurIntensity}
            tint={blurTint}
            {...androidBlur}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: tint }]}
        />
        {!isDark && useNativeBlur ? (
          <LinearGradient
            colors={[
              "rgba(255,255,255,0.55)",
              "rgba(255,255,255,0)",
              "rgba(0,0,0,0.03)",
            ]}
            locations={[0, 0.55, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
        <View
          style={[
            styles.topEdge,
            {
              borderTopLeftRadius: radius,
              borderTopRightRadius: radius,
              backgroundColor: colorWithAlpha(
                isDark ? "#a5e8ff" : "#ffffff",
                isDark ? 0.22 : 1,
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
    borderWidth: StyleSheet.hairlineWidth * 1.5,
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 10,
    right: 10,
    height: StyleSheet.hairlineWidth * 2,
    zIndex: 2,
  },
  content: {
    position: "relative",
    zIndex: 3,
    backgroundColor: "transparent",
  },
});
