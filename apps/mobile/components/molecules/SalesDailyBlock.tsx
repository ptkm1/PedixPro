import { displayMoney } from "@/components/atoms/formatMoney";
import { ThemedText } from "@/components/atoms/ThemedText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { FilterChipRow } from "@/components/molecules/FilterChipRow";
import type { SellerOrderListItem } from "@/hooks/screens/useSalesListScreen";
import {
    PERIOD_FILTER_OPTIONS,
    periodRange,
    type PeriodPreset,
} from "@/lib/period-presets";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { radiiPx } from "@pedidos/design-tokens";
import { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { LineChart, ruleTypes } from "react-native-gifted-charts";
const CHART_HEIGHT = 220;
const Y_AXIS_LABEL_WIDTH = 42;
const X_LABEL_WIDTH = 36;
const INITIAL_SPACING = 8;
const END_SPACING = 16;

type Props = {
  orders: SellerOrderListItem[];
  hideValues?: boolean;
};

type DayPoint = {
  value: number;
  label: string;
  fullLabel: string;
  dataPointText?: string;
};

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetweenInclusive(from: Date, to: Date): number {
  return Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1,
  );
}

function formatYAxisValue(value: string, hideValues: boolean): string {
  if (hideValues) return "••••";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `R$ ${Math.round(n)}`;
}

function formatAxisDay(cursor: Date, withMonth: boolean): string {
  const day = String(cursor.getUTCDate()).padStart(2, "0");
  if (!withMonth) return day;
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "UTC",
  })
    .format(cursor)
    .replace(".", "");
  return `${day} ${month}`;
}

function formatFullDay(cursor: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(cursor)
    .replace(/\./g, "");
}

function pickLabelIndices(count: number, maxLabels: number): Set<number> {
  if (count <= 0) return new Set();
  if (count === 1) return new Set([0]);

  const budget = Math.max(2, Math.min(count, maxLabels));
  const lastIndex = count - 1;
  if (budget === 2) return new Set([0, lastIndex]);

  const indices = new Set<number>([0, lastIndex]);
  const innerSlots = budget - 2;
  for (let i = 1; i <= innerSlots; i += 1) {
    indices.add(Math.round((i / (innerSlots + 1)) * lastIndex));
  }
  return indices;
}

/**
 * Gráfico de área (spline) — faturamento diário no período, estilo “Vendas do mês”.
 */
export function SalesDailyBlock({ orders, hideValues = false }: Props) {
  const { colors } = useTheme();
  const [preset, setPreset] = useState<PeriodPreset>("this_month");
  const [chartAreaWidth, setChartAreaWidth] = useState(0);
  const range = useMemo(() => periodRange(preset), [preset]);

  const onChartAreaLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    if (next > 0 && next !== chartAreaWidth) setChartAreaWidth(next);
  };

  const parentWidth = Math.max(0, chartAreaWidth - 1);
  const plotWidth = Math.max(120, parentWidth - Y_AXIS_LABEL_WIDTH);

  const { points, total, orderCount, spacing, chartMaxValue } = useMemo(() => {
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
    const withMonth = numberOfDays > 10;
    const maxLabels = Math.max(3, Math.floor(plotWidth / (X_LABEL_WIDTH + 8)));
    const labelIndices = pickLabelIndices(numberOfDays, maxLabels);

    const series: DayPoint[] = [];
    let cursor = new Date(from);
    let index = 0;
    while (cursor <= to) {
      const value = Math.round((amounts.get(dayKey(cursor)) ?? 0) * 100) / 100;
      series.push({
        value,
        label: labelIndices.has(index)
          ? formatAxisDay(cursor, withMonth)
          : "",
        fullLabel: formatFullDay(cursor),
      });
      cursor = addUtcDays(cursor, 1);
      index += 1;
    }

    const count = Math.max(1, series.length);
    const nextSpacing = Math.max(
      4,
      Math.min(28, (plotWidth - INITIAL_SPACING - END_SPACING) / Math.max(1, count - 1)),
    );
    const maxValue = Math.max(...series.map((p) => p.value), 0);
    const paddedMax = maxValue > 0 ? maxValue * 1.15 : 100;

    return {
      points: series,
      total: totalAmount,
      orderCount: confirmedOrders,
      spacing: nextSpacing,
      chartMaxValue: paddedMax,
    };
  }, [orders, plotWidth, range.from, range.to]);

  const hasSales = points.some((p) => p.value > 0);
  const title =
    preset === "this_month" || preset === "last_month"
      ? "Vendas do mês"
      : "Vendas no período";

  const lineColor = colors.primary;
  const fillStart = colorWithAlpha(colors.primary, 0.45);
  const fillEnd = colorWithAlpha(colors.primary, 0.06);

  return (
    <GlassSurface>
      <ThemedText variant="titleSm">{title}</ThemedText>
      <ThemedText variant="bodySm" muted style={{ marginTop: 4 }}>
        {displayMoney(hideValues, total)} em {orderCount} pedido
        {orderCount === 1 ? "" : "s"}
      </ThemedText>
      <FilterChipRow
        scroll={false}
        style={styles.chips}
        options={PERIOD_FILTER_OPTIONS}
        value={preset}
        onChange={setPreset}
      />
      {hasSales ? (
        <View style={styles.chartWrap} onLayout={onChartAreaLayout}>
          {parentWidth > 0 ? (
            <LineChart
              areaChart
              curved
              data={points}
              width={plotWidth}
              parentWidth={parentWidth}
              height={CHART_HEIGHT}
              maxValue={chartMaxValue}
              spacing={spacing}
              initialSpacing={INITIAL_SPACING}
              endSpacing={END_SPACING}
              noOfSections={4}
              color={lineColor}
              thickness={2.5}
              startFillColor={fillStart}
              endFillColor={fillEnd}
              startOpacity={1}
              endOpacity={1}
              hideDataPoints
              yAxisLabelWidth={Y_AXIS_LABEL_WIDTH}
              yAxisColor={colors.glassBorder}
              xAxisColor={colors.glassBorder}
              rulesColor={colors.glassBorder}
              rulesType={ruleTypes.DASHED}
              dashWidth={3}
              dashGap={4}
              xAxisThickness={1}
              yAxisThickness={0}
              disableScroll
              formatYLabel={(value) => formatYAxisValue(value, hideValues)}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{
                color: colors.textMuted,
                fontSize: 10,
                width: X_LABEL_WIDTH,
                textAlign: "center",
              }}
              pointerConfig={{
                pointerStripHeight: CHART_HEIGHT - 20,
                pointerStripColor: colors.glassBorder,
                pointerStripWidth: 1,
                strokeDashArray: [4, 4],
                pointerColor: lineColor,
                radius: 5,
                pointerLabelWidth: 148,
                pointerLabelHeight: 56,
                activatePointersOnLongPress: false,
                autoAdjustPointerLabelPosition: true,
                pointerLabelComponent: (items: DayPoint[]) => {
                  const item = items[0];
                  if (!item) return null;
                  return (
                    <View
                      style={[
                        styles.tooltip,
                        {
                          backgroundColor: colors.surfaceOverlay,
                          borderColor: colors.glassBorder,
                        },
                      ]}
                    >
                      <ThemedText variant="caption" muted>
                        {item.fullLabel}
                      </ThemedText>
                      <View style={styles.tooltipRow}>
                        <View
                          style={[
                            styles.tooltipDot,
                            { backgroundColor: lineColor },
                          ]}
                        />
                        <ThemedText
                          variant="caption"
                          style={{ fontWeight: "700", flexShrink: 1 }}
                        >
                          Faturamento: {displayMoney(hideValues, item.value)}
                        </ThemedText>
                      </View>
                    </View>
                  );
                },
              }}
            />
          ) : null}
        </View>
      ) : (
        <ThemedText variant="bodySm" muted style={{ marginTop: 16 }}>
          Sem vendas confirmadas no período.
        </ThemedText>
      )}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  chips: { marginTop: 12 },
  chartWrap: {
    marginTop: 8,
    paddingTop: 4,
    width: "100%",
    alignSelf: "stretch",
    overflow: "visible",
  },
  tooltip: {
    borderWidth: 1,
    borderRadius: radiiPx.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  tooltipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tooltipDot: { width: 8, height: 8, borderRadius: 4 },
});
