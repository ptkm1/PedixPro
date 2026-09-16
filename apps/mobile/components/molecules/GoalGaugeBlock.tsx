import { displayMoney } from "@/components/atoms/formatMoney";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { ThemedText } from "@/components/atoms/ThemedText";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { useId, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

const WIDTH = 240;
const STROKE = 24;
const R = 92;
const CX = WIDTH / 2;
const CY = R + STROKE / 2;
const HEIGHT = R + STROKE;
const PAD = 10;
const SVG_W = WIDTH + PAD * 2;
const SVG_H = HEIGHT + 6;

type Props = {
  title: string;
  current: number;
  target: number;
  hideValues?: boolean;
  onPress?: () => void;
};

function pointOnArc(t: number) {
  const theta = Math.PI + t * Math.PI;
  return {
    x: CX + R * Math.cos(theta) + PAD,
    y: CY + R * Math.sin(theta) + 2,
  };
}

function SemiGauge({
  percent,
  trackColor,
  gradientFrom,
  gradientTo,
  textColor,
}: {
  percent: number;
  trackColor: string;
  gradientFrom: string;
  gradientTo: string;
  textColor: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const start = pointOnArc(0);
  const end = pointOnArc(1);
  const progress = pointOnArc(clamped / 100);
  const gradId = `goalBarGrad-${useId().replace(/:/g, "")}`;

  const trackPath = `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`;
  const progressPath =
    clamped <= 0
      ? null
      : `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${progress.x} ${progress.y}`;

  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.percentBehind} pointerEvents="none">
        <ThemedText style={[styles.percentText, { color: textColor }]}>
          {Math.round(clamped)}%
        </ThemedText>
      </View>
      <View style={styles.svgLayer} pointerEvents="none">
        <Svg width={SVG_W} height={SVG_H}>
          <Defs>
            {/* Gradiente horizontal só na tinta do stroke (dentro da barra) */}
            <LinearGradient
              id={gradId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <Stop offset="0%" stopColor={gradientFrom} />
              <Stop offset="100%" stopColor={gradientTo} />
            </LinearGradient>
          </Defs>

          <Path
            d={trackPath}
            stroke={trackColor}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
          />

          {progressPath ? (
            <Path
              d={progressPath}
              stroke={`url(#${gradId})`}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
            />
          ) : null}
        </Svg>
      </View>
    </View>
  );
}

export function GoalGaugeBlock({
  title,
  current,
  target,
  hideValues = false,
  onPress,
}: Props) {
  const { colors, isDark } = useTheme();
  const hasGoal = target > 0;
  const percent = useMemo(
    () => (hasGoal ? Math.min(100, (current / target) * 100) : 0),
    [current, hasGoal, target],
  );

  const displayTitle = title.replace(/\s*\(seed-seller-charts\)/gi, "").trim();

  // Como no print: azul mais profundo à esquerda → ciano claro à direita
  const gradientFrom = isDark ? "#0284c7" : "#2563eb";
  const gradientTo = colors.primary;

  const body = (
    <>
      <ThemedText variant="titleSm">Meta atingida</ThemedText>
      <ThemedText variant="bodySm" muted style={{ marginTop: 4 }}>
        {hasGoal
          ? `${displayTitle} · ${displayMoney(hideValues, current)} de ${displayMoney(hideValues, target)}`
          : "Nenhuma meta definida para o mês"}
      </ThemedText>
      <View style={styles.gaugeArea}>
        <SemiGauge
          percent={percent}
          trackColor={
            isDark
              ? colorWithAlpha(colors.primary, 0.14)
              : colorWithAlpha("#94a3b8", 0.55)
          }
          gradientFrom={gradientFrom}
          gradientTo={gradientTo}
          textColor={colors.text}
        />
      </View>
    </>
  );

  if (!onPress) {
    return (
      <GlassSurface style={styles.card} contentStyle={styles.cardPad}>
        {body}
      </GlassSurface>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
    >
      <GlassSurface style={styles.card} contentStyle={styles.cardPad}>
        {body}
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {},
  cardPad: {
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 18,
  },
  gaugeArea: {
    marginTop: 10,
    height: SVG_H,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  gaugeWrap: {
    width: SVG_W,
    height: SVG_H,
    position: "relative",
  },
  percentBehind: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 4,
    zIndex: 1,
    elevation: 1,
    alignItems: "center",
  },
  svgLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 2,
    elevation: 2,
  },
  percentText: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
});
