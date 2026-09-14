import { displayMoney } from "@/components/atoms/formatMoney";
import { ThemedText } from "@/components/atoms/ThemedText";
import type { SellerOrderListItem } from "@/hooks/screens/useSalesListScreen";
import { PERIOD_PRESET_LABELS, periodRange, type PeriodPreset } from "@/lib/period-presets";
import { useTheme } from "@/lib/theme";
import { radiiPx } from "@pedidos/design-tokens";
import { useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { BarChart, ruleTypes } from "react-native-gifted-charts";

const PRESETS: PeriodPreset[] = ["this_month", "last_month", "last_7_days", "last_90_days"];
const CHART_HEIGHT = 200;
const Y_AXIS_LABEL_WIDTH = 34;
const X_LABEL_WIDTH = 34;
const INITIAL_SPACING = 8;
const END_SPACING = 12;
/** Folga no topo para o tooltip ao tocar na barra. */
const TOOLTIP_OVERFLOW = 30;

type Props = {
  orders: SellerOrderListItem[];
  hideValues?: boolean;
};

type DailyBar = {
  value: number;
  label: string;
  fullLabel: string;
  frontColor: string;
};

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetweenInclusive(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

function formatYAxisValue(value: string, hideValues: boolean): string {
  if (hideValues) return "••••";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatAxisDay(cursor: Date, withMonth: boolean): string {
  const day = cursor.getUTCDate();
  if (!withMonth) return String(day);
  return `${day}/${cursor.getUTCMonth() + 1}`;
}

function formatFullDay(cursor: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(cursor)
    .replace(".", "");
}

function formatFullRange(from: Date, to: Date): string {
  return `${formatFullDay(from)} – ${formatFullDay(to)}`;
}

function pickLabelIndices(count: number, maxLabels: number): Set<number> {
  if (count <= 0) return new Set();
  if (count === 1) return new Set([0]);

  const budget = Math.max(2, Math.min(count, maxLabels));
  const lastIndex = Math.max(0, count - 2);
  if (budget === 2) return new Set([0, lastIndex]);

  const indices = new Set<number>([0, lastIndex]);
  const innerSlots = budget - 2;
  for (let i = 1; i <= innerSlots; i += 1) {
    indices.add(Math.round((i / (innerSlots + 1)) * lastIndex));
  }
  return indices;
}

export function SalesDailyBlock({ orders, hideValues = false }: Props) {
  const { colors } = useTheme();
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  /** Largura útil do chartWrap (já dentro do padding do card). */
  const [chartAreaWidth, setChartAreaWidth] = useState(0);
  const range = useMemo(() => periodRange(preset), [preset]);

  const onChartAreaLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    if (next > 0 && next !== chartAreaWidth) setChartAreaWidth(next);
  };

  // gifted-charts: actualContainerWidth = width + yAxisLabelWidth.
  // Medimos o chartWrap (já dentro do padding). 1px de folga evita overflow por arredondamento.
  const parentWidth = Math.max(0, chartAreaWidth - 1);
  const plotWidth = Math.max(120, parentWidth - Y_AXIS_LABEL_WIDTH);

  const { bars, total, orderCount, barWidth, spacing, chartMaxValue } = useMemo(() => {
    const from = startOfUtcDay(new Date(range.from));
    const to = startOfUtcDay(new Date(range.to));
    const amounts = new Map<string, number>();
    let totalAmount = 0;
    let confirmedOrders = 0;

    for (const order of orders) {
      if (order.status !== "CONFIRMED") continue;
      const createdDay = startOfUtcDay(new Date(order.createdAt));
      if (createdDay < from || createdDay > to) continue;
      const amount = Number(order.totalAmount);
      if (!Number.isFinite(amount)) continue;
      const key = dayKey(createdDay);
      amounts.set(key, (amounts.get(key) ?? 0) + amount);
      totalAmount += amount;
      confirmedOrders += 1;
    }

    const numberOfDays = daysBetweenInclusive(from, to);
    const bucketDays = numberOfDays > 40 ? 7 : 1;
    const withMonth = numberOfDays > 14 || bucketDays > 1;

    type Bucket = { from: Date; to: Date; value: number };
    const buckets: Bucket[] = [];
    let cursor = new Date(from);
    while (cursor <= to) {
      const bucketFrom = new Date(cursor);
      const bucketTo = startOfUtcDay(
        new Date(Math.min(addUtcDays(cursor, bucketDays - 1).getTime(), to.getTime())),
      );
      let value = 0;
      const walk = new Date(bucketFrom);
      while (walk <= bucketTo) {
        value += amounts.get(dayKey(walk)) ?? 0;
        walk.setUTCDate(walk.getUTCDate() + 1);
      }
      buckets.push({
        from: bucketFrom,
        to: bucketTo,
        value: Math.round(value * 100) / 100,
      });
      cursor = addUtcDays(bucketTo, 1);
    }

    const count = Math.max(1, buckets.length);
    // gifted-charts: totalWidth = initial + end + Σ (barWidth + spacing) — spacing também na última barra.
    const nextSpacing = count > 20 ? 2 : count > 10 ? 4 : 8;
    const usableWidth = Math.max(80, plotWidth - INITIAL_SPACING - END_SPACING);
    const nextBarWidth = Math.max(
      4,
      Math.min(26, (usableWidth - count * nextSpacing) / count),
    );

    const maxLabels = Math.max(3, Math.floor(usableWidth / (X_LABEL_WIDTH + 6)));
    const labelIndices = pickLabelIndices(count, maxLabels);

    const maxValue = Math.max(...buckets.map((b) => b.value), 0);
    const paddedMax = maxValue > 0 ? maxValue * 1.12 : undefined;

    const allBars: DailyBar[] = buckets.map((bucket, index) => ({
      value: bucket.value,
      label: labelIndices.has(index) ? formatAxisDay(bucket.from, withMonth) : "",
      fullLabel:
        bucketDays === 1
          ? formatFullDay(bucket.from)
          : formatFullRange(bucket.from, bucket.to),
      frontColor: colors.primary,
    }));

    return {
      bars: allBars,
      total: totalAmount,
      orderCount: confirmedOrders,
      barWidth: nextBarWidth,
      spacing: nextSpacing,
      chartMaxValue: paddedMax,
    };
  }, [colors.primary, orders, plotWidth, range.from, range.to]);

  const hasSales = bars.some((bar) => bar.value > 0);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ThemedText variant="titleSm">Vendas por dia</ThemedText>
      <ThemedText variant="bodySm" muted style={{ marginTop: 4 }}>
        {displayMoney(hideValues, total)} em {orderCount} pedido{orderCount === 1 ? "" : "s"}
      </ThemedText>
      <View style={styles.chips}>
        {PRESETS.map((item) => {
          const active = item === preset;
          return (
            <Pressable
              key={item}
              onPress={() => setPreset(item)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.chipActive : colors.chip,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <ThemedText
                variant="caption"
                style={{ fontWeight: "600", color: active ? colors.chipTextActive : colors.chipText }}
              >
                {PERIOD_PRESET_LABELS[item]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {hasSales ? (
        <View style={styles.chartWrap} onLayout={onChartAreaLayout}>
          {parentWidth > 0 ? (
            <BarChart
              data={bars}
              width={plotWidth}
              parentWidth={parentWidth}
              height={CHART_HEIGHT}
              maxValue={chartMaxValue}
              barWidth={barWidth}
              spacing={spacing}
              initialSpacing={INITIAL_SPACING}
              endSpacing={END_SPACING}
              noOfSections={4}
              roundedTop
              barBorderRadius={3}
              overflowTop={TOOLTIP_OVERFLOW}
              yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
              yAxisColor={colors.border}
              xAxisColor={colors.border}
              rulesColor={colors.border}
              rulesType={ruleTypes.DASHED}
              dashWidth={3}
              dashGap={3}
              xAxisThickness={1}
              yAxisThickness={0}
              disableScroll
              formatYLabel={(value) => formatYAxisValue(value, hideValues)}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 11 }}
              xAxisLabelTextStyle={{
                color: colors.textMuted,
                fontSize: 10,
                width: X_LABEL_WIDTH,
                textAlign: "center",
              }}
              labelsDistanceFromXaxis={8}
              xAxisLabelsVerticalShift={4}
              labelsExtraHeight={30}
              focusBarOnPress
              renderTooltip={(item: DailyBar) => (
                <View style={[styles.tooltip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <ThemedText variant="caption" style={{ fontWeight: "600" }}>
                    {item.fullLabel}
                  </ThemedText>
                  <ThemedText variant="caption" muted style={{ marginTop: 2 }}>
                    {displayMoney(hideValues, item.value)}
                  </ThemedText>
                </View>
              )}
            />
          ) : null}
        </View>
      ) : (
        <ThemedText variant="bodySm" muted style={{ marginTop: 16 }}>
          Sem vendas confirmadas no período.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radiiPx.lg, borderWidth: 1, padding: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderRadius: radiiPx.md, paddingHorizontal: 10, paddingVertical: 6 },
  chartWrap: {
    marginTop: 8,
    paddingTop: 4,
    width: "100%",
    alignSelf: "stretch",
    overflow: "visible",
  },
  tooltip: { borderWidth: 1, borderRadius: radiiPx.md, paddingHorizontal: 10, paddingVertical: 8 },
});
