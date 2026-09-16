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

/**
 * Fundo atmosférico em gradiente suave — sem círculos chapados.
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

  return (
    <View style={[styles.fill, { backgroundColor: solid }]}>
      {!flat && !backgroundColor && isDark ? (
        <LinearGradient
          colors={["#061420", "#0a1f32", "#071828", "#050f18"]}
          locations={[0, 0.35, 0.7, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
      <SafeAreaView
        edges={resolvedEdges}
        style={[styles.fill, { backgroundColor: "transparent" }, style]}
      >
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
