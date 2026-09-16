import { ThemedText } from "@/components/atoms/ThemedText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { GlowIcon } from "@/components/atoms/GlowIcon";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import type { LucideIcon } from "lucide-react-native";
import { TrendingDown, TrendingUp } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

type Props = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: number; label?: string };
  onPress?: () => void;
  style?: object;
  compact?: boolean;
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  onPress,
  style,
  compact = false,
}: Props) {
  const { colors } = useTheme();
  const isPositive = trend ? trend.value >= 0 : true;

  const body = (
    <View style={[styles.inner, compact && styles.innerCompact]}>
      <View style={styles.row}>
        <View style={styles.body}>
          <ThemedText variant="bodySm" muted>
            {title}
          </ThemedText>
          <ThemedText
            variant="display"
            style={[
              { marginTop: compact ? 5 : 8 },
              compact && { fontSize: 22, lineHeight: 26 },
            ]}
          >
            {value}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="bodySm" muted style={{ marginTop: 4 }}>
              {subtitle}
            </ThemedText>
          ) : null}
          {trend ? (
            <View style={styles.trendRow}>
              {isPositive ? (
                <TrendingUp color={colors.primary} size={14} />
              ) : (
                <TrendingDown color={colors.danger} size={14} />
              )}
              <ThemedText
                variant="bodySm"
                style={{
                  color: isPositive ? colors.primary : colors.danger,
                  fontWeight: "600",
                }}
              >
                {isPositive ? "+" : ""}
                {trend.value}%
              </ThemedText>
              {trend.label ? (
                <ThemedText variant="caption" muted>
                  {trend.label}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
        </View>
        {Icon ? (
          <GlowIcon
            Icon={Icon}
            size={compact ? 15 : 16}
            glowSize={compact ? 28 : 36}
          />
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <GlassSurface style={[styles.card, style]} padded={false}>
        {body}
      </GlassSurface>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ flex: 1, minWidth: 0, opacity: pressed ? 0.92 : 1 }, style]}
    >
      <GlassSurface style={styles.card} padded={false}>
        {body}
      </GlassSurface>
    </Pressable>
  );
}

type ProgressProps = {
  title: string;
  current: number;
  target: number;
  formatValue?: (v: number) => string;
};

export function ProgressStat({
  title,
  current,
  target,
  formatValue = (v) => String(v),
}: ProgressProps) {
  const { colors } = useTheme();
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  return (
    <GlassSurface style={styles.card} padded={false}>
      <View style={styles.inner}>
        <View style={styles.progressHead}>
          <ThemedText variant="bodySm" muted>
            {title}
          </ThemedText>
          <ThemedText
            variant="bodySm"
            style={{ color: colors.primary, fontWeight: "600" }}
          >
            {pct.toFixed(1)}%
          </ThemedText>
        </View>
        <View style={{ marginTop: 12 }}>
          <View style={styles.progressValues}>
            <ThemedText variant="titleSm">{formatValue(current)}</ThemedText>
            <ThemedText variant="bodySm" muted>
              de {formatValue(target)}
            </ThemedText>
          </View>
          <View
            style={[
              styles.track,
              { backgroundColor: colorWithAlpha(colors.primary, 0.15) },
            ]}
          >
            <View
              style={[
                styles.fill,
                { width: `${pct}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
        </View>
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
  },
  inner: { padding: 16 },
  innerCompact: { padding: 12 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  body: { flex: 1, minWidth: 0 },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  progressHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressValues: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
});
