import { BlurTargetProvider } from "@/lib/blur-target";
import { useTheme } from "@/lib/theme";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

export type SafeScreenVariant = "stack" | "tab" | "topOnly";

type Props = {
  children: ReactNode;
  variant?: SafeScreenVariant;
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  flat?: boolean;
};

const VARIANT_EDGES: Record<SafeScreenVariant, readonly Edge[]> = {
  stack: ["top", "right", "bottom", "left"],
  tab: ["top", "right", "left"],
  topOnly: ["top", "right", "left"],
};

const DARK_COLORS = ["#061420", "#0a1f32", "#071828", "#050f18"] as const;
const DARK_LOCATIONS = [0, 0.35, 0.7, 1] as const;

/** Cinza neutro — sem wash azul. */
const LIGHT_BASE_COLORS = ["#F3F3F4", "#EBEBED", "#E2E2E5", "#D8D8DC"] as const;
const LIGHT_BASE_LOCATIONS = [0, 0.32, 0.68, 1] as const;

const LIGHT_WASH_A_COLORS = [
  "rgba(255,255,255,0.7)",
  "rgba(255,255,255,0)",
  "rgba(0,0,0,0.035)",
] as const;
const LIGHT_WASH_A_LOCATIONS = [0, 0.45, 1] as const;

const LIGHT_WASH_B_COLORS = [
  "rgba(0,0,0,0.015)",
  "rgba(0,0,0,0)",
  "rgba(0,0,0,0.05)",
] as const;
const LIGHT_WASH_B_LOCATIONS = [0, 0.5, 1] as const;

function Atmosphere({ isDark }: { isDark: boolean }) {
  if (isDark) {
    return (
      <LinearGradient
        colors={[...DARK_COLORS]}
        locations={[...DARK_LOCATIONS]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <LinearGradient
        colors={[...LIGHT_BASE_COLORS]}
        locations={[...LIGHT_BASE_LOCATIONS]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[...LIGHT_WASH_A_COLORS]}
        locations={[...LIGHT_WASH_A_LOCATIONS]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[...LIGHT_WASH_B_COLORS]}
        locations={[...LIGHT_WASH_B_LOCATIONS]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

/**
 * Fundo atmosférico em gradiente suave — sem círculos chapados.
 * BlurTargetProvider alimenta GlassSurface no Android.
 */
export function SafeScreen({
  children,
  variant = "stack",
  edges,
  style,
  backgroundColor,
  flat = false,
}: Props) {
  const { colors, isDark } = useTheme();
  const resolvedEdges = edges ?? VARIANT_EDGES[variant];
  const solid = backgroundColor ?? colors.background;
  const showAtmosphere = !flat && !backgroundColor;

  return (
    <View style={[styles.fill, { backgroundColor: solid }]}>
      {/* Camada VISÍVEL — o BlurTargetView no Android às vezes não pinta o fundo. */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {showAtmosphere ? (
          <Atmosphere isDark={isDark} />
        ) : (
          <View
            style={[StyleSheet.absoluteFillObject, { backgroundColor: solid }]}
          />
        )}
      </View>
      <BlurTargetProvider
        backdrop={
          showAtmosphere ? (
            <Atmosphere isDark={isDark} />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: solid },
              ]}
            />
          )
        }
      >
        <View style={[styles.fill, { backgroundColor: "transparent" }]}>
          <SafeAreaView
            edges={resolvedEdges}
            style={[styles.fill, { backgroundColor: "transparent" }, style]}
          >
            {children}
          </SafeAreaView>
        </View>
      </BlurTargetProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
