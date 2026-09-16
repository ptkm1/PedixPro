import { useTheme } from "@/lib/theme";
import type { LucideIcon } from "lucide-react-native";
import { useId } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

type Props = {
  Icon: LucideIcon;
  size?: number;
  glowSize?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Ícone luminoso: aura cyan com fade longo (borda do radial some no fundo).
 */
export function GlowIcon({
  Icon,
  size = 18,
  glowSize = 36,
  color,
  strokeWidth = 2,
  style,
}: Props) {
  const { colors } = useTheme();
  const tint = color ?? colors.primary;
  const gradId = `iconGlow-${useId().replace(/:/g, "")}`;
  // Canvas maior que o box: o fim do círculo fica longe e quase transparente
  const canvas = Math.round(glowSize * 2);
  const c = canvas / 2;
  const shift = (canvas - glowSize) / 2;

  return (
    <View style={[styles.wrap, { width: glowSize, height: glowSize }, style]}>
      <Svg
        width={canvas}
        height={canvas}
        style={{ position: "absolute", left: -shift, top: -shift }}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" rx="50%" ry="50%">
            {/* Núcleo compacto */}
            <Stop offset="0%" stopColor={tint} stopOpacity={0.42} />
            <Stop offset="10%" stopColor={tint} stopOpacity={0.22} />
            <Stop offset="22%" stopColor={tint} stopOpacity={0.1} />
            {/* Cauda longa — opacidade cai cedo e some sem borda */}
            <Stop offset="38%" stopColor={tint} stopOpacity={0.04} />
            <Stop offset="55%" stopColor={tint} stopOpacity={0.015} />
            <Stop offset="72%" stopColor={tint} stopOpacity={0.005} />
            <Stop offset="88%" stopColor={tint} stopOpacity={0.001} />
            <Stop offset="100%" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={c} cy={c} r={c} fill={`url(#${gradId})`} />
      </Svg>
      <View
        style={[
          styles.icon,
          {
            shadowColor: tint,
            shadowOpacity: 0.85,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        <Icon color={tint} size={size} strokeWidth={strokeWidth} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  icon: {
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
