import { displayMoney } from "@/components/atoms/formatMoney";
import { ThemedText } from "@/components/atoms/ThemedText";
import { useTheme } from "@/lib/theme";
import { radiiPx } from "@pedidos/design-tokens";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

/** Mesmo modelo do preview web: M left A r r 0 0 1 right (arco superior). */
const WIDTH = 240;
const STROKE = 26;
const R = 92;
const CX = WIDTH / 2;
/** Baseline do gauge (pontas esquerda/direita). */
const CY = R + STROKE / 2;
const HEIGHT = R + STROKE;

type Props = {
  title: string;
  current: number;
  target: number;
  hideValues?: boolean;
  onPress?: () => void;
};

function pointOnArc(t: number) {
  // t=0 esquerda, t=0.5 topo, t=1 direita — arco superior.
  // θ: π → 3π/2 → 2π (com y↓, sin(3π/2)=-1 = cima).
  const theta = Math.PI + t * Math.PI;
  return {
    x: CX + R * Math.cos(theta),
    y: CY + R * Math.sin(theta),
  };
}

function SemiGauge({
  percent,
  trackColor,
  fillColor,
  textColor,
}: {
  percent: number;
  trackColor: string;
  fillColor: string;
  textColor: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const start = pointOnArc(0);
  const end = pointOnArc(1);
  const progress = pointOnArc(clamped / 100);

  // Igual ao preview web: large-arc=0, sweep=1 → semi-círculo de cima.
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
        <Svg width={WIDTH} height={HEIGHT}>
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
              stroke={fillColor}
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
  const { colors } = useTheme();
  const hasGoal = target > 0;
  const percent = useMemo(
    () => (hasGoal ? Math.min(100, (current / target) * 100) : 0),
    [current, hasGoal, target],
  );

  const body = (
    <>
      <ThemedText variant="titleSm">Meta atingida</ThemedText>
      <ThemedText variant="bodySm" muted style={{ marginTop: 4 }}>
        {hasGoal
          ? `${title} · ${displayMoney(hideValues, current)} de ${displayMoney(hideValues, target)}`
          : "Nenhuma meta definida para o mês"}
      </ThemedText>
      <View style={styles.gaugeArea}>
        <SemiGauge
          percent={percent}
          trackColor={colors.border}
          fillColor={colors.primary}
          textColor={colors.text}
        />
      </View>
    </>
  );

  // View evita clip do Pressable no Android; o toque fica só no wrapper.
  if (!onPress) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.94 : 1,
        },
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radiiPx.lg,
    borderWidth: 1,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 20,
  },
  gaugeArea: {
    marginTop: 16,
    height: HEIGHT + 8,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  gaugeWrap: {
    width: WIDTH,
    height: HEIGHT,
    position: "relative",
    overflow: "visible",
  },
  percentBehind: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 10,
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
