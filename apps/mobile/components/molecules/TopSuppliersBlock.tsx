import { displayMoney } from "@/components/atoms/formatMoney";
import { ThemedText } from "@/components/atoms/ThemedText";
import { ThemedTextInput } from "@/components/atoms/ThemedTextInput";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { FilterChipRow } from "@/components/molecules/FilterChipRow";
import { useSalesBySupplier } from "@/hooks/screens/useSalesBySupplier";
import {
    PERIOD_FILTER_OPTIONS_WITH_CUSTOM,
    type PeriodFilterId,
    type PeriodPreset,
} from "@/lib/period-presets";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { radiiPx } from "@pedidos/design-tokens";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    LayoutChangeEvent,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { BarChart, ruleTypes } from "react-native-gifted-charts";

const CHART_HEIGHT = 200;
const Y_AXIS_LABEL_WIDTH = 34;
const X_LABEL_WIDTH = 54;
const INITIAL_SPACING = 12;
const END_SPACING = 12;
const BAR_SPACING = 10;
const TOOLTIP_DOCK_HEIGHT = 52;
const BAR_GRADIENT_FROM_DARK = "#0284c7";
const BAR_GRADIENT_FROM_LIGHT = "#2563eb";

type SupplierBar = {
  value: number;
  label: string;
  fullName: string;
  frontColor: string;
  gradientColor: string;
  showGradient: boolean;
};

type Props = {
  hideValues?: boolean;
};

function formatDateInput(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function parseDateInput(value: string, endOfDay = false): string | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ),
  );
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date.toISOString();
}

function shortSupplierName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 11) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0] ?? trimmed;
  return firstWord.length <= 11 ? firstWord : `${firstWord.slice(0, 10)}…`;
}

function formatYAxisValue(value: string, hideValues: boolean): string {
  if (hideValues) return "••••";
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number >= 1000
    ? `${(number / 1000).toFixed(1)}k`
    : String(Math.round(number));
}

export function TopSuppliersBlock({ hideValues = false }: Props) {
  const { colors, isDark } = useTheme();
  const {
    preset,
    selectPreset,
    setCustomRange,
    isCustomRange,
    data,
    isLoading,
    isFetching,
    error,
  } = useSalesBySupplier();
  const [customOpen, setCustomOpen] = useState(false);
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [chartAreaWidth, setChartAreaWidth] = useState(0);
  const [focused, setFocused] = useState<SupplierBar | null>(null);

  useEffect(() => {
    setFocused(null);
  }, [preset, data?.period.from, data?.period.to]);

  const onChartAreaLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    if (next > 0 && next !== chartAreaWidth) setChartAreaWidth(next);
  };

  const parentWidth = Math.max(0, chartAreaWidth - 1);
  const plotWidth = Math.max(120, parentWidth - Y_AXIS_LABEL_WIDTH);

  const gradientFrom = isDark ? BAR_GRADIENT_FROM_DARK : BAR_GRADIENT_FROM_LIGHT;
  const gradientTo = colors.primary;

  const { barData, chartMaxValue, barWidth } = useMemo(() => {
    if (!data?.topSuppliers.length) {
      return {
        barData: [] as SupplierBar[],
        chartMaxValue: undefined as number | undefined,
        barWidth: 28,
      };
    }

    const count = data.topSuppliers.length;
    const usableWidth = Math.max(80, plotWidth - INITIAL_SPACING - END_SPACING);
    const nextBarWidth = Math.max(
      18,
      Math.min(40, (usableWidth - count * BAR_SPACING) / count),
    );

    const values = data.topSuppliers.map(
      (s) => Math.round(s.totalAmount * 100) / 100,
    );
    const maxValue = Math.max(...values, 0);
    const paddedMax = maxValue > 0 ? maxValue * 1.12 : undefined;

    return {
      barData: data.topSuppliers.map((s, index) => {
        const value = values[index] ?? 0;
        return {
          value,
          label: shortSupplierName(s.tradeName),
          fullName: s.tradeName,
          frontColor: gradientTo,
          gradientColor: gradientFrom,
          showGradient: true,
        };
      }),
      chartMaxValue: paddedMax,
      barWidth: nextBarWidth,
    };
  }, [data?.topSuppliers, gradientFrom, gradientTo, plotWidth]);

  const openCustomRange = () => {
    setDateError(null);
    setFromInput(data ? formatDateInput(data.period.from) : "");
    setToInput(data ? formatDateInput(data.period.to) : "");
    setCustomOpen((open) => !open);
  };

  const applyCustomRange = () => {
    const from = parseDateInput(fromInput);
    const to = parseDateInput(toInput, true);
    if (!from || !to) {
      setDateError("Use o formato DD/MM/AAAA.");
      return;
    }
    if (new Date(from) > new Date(to)) {
      setDateError("A data inicial deve ser anterior à final.");
      return;
    }
    setDateError(null);
    setCustomRange({ from, to });
    setCustomOpen(false);
  };

  return (
    <GlassSurface>
      <ThemedText variant="titleSm">Top fornecedores</ThemedText>
      <ThemedText variant="bodySm" muted style={{ marginTop: 4 }}>
        Suas vendas confirmadas por indústria
        {data
          ? ` · ${displayMoney(hideValues, data.totals.totalAmount)} em ${data.totals.orderCount} pedido(s)`
          : ""}
      </ThemedText>

      <FilterChipRow
        scroll={false}
        style={styles.chips}
        options={PERIOD_FILTER_OPTIONS_WITH_CUSTOM}
        value={
          (isCustomRange ? "custom" : preset) as PeriodFilterId | null
        }
        onChange={(id) => {
          if (id === "custom") {
            openCustomRange();
            return;
          }
          setFocused(null);
          selectPreset(id as PeriodPreset);
        }}
      />

      {customOpen ? (
        <View style={[styles.customRange, { borderColor: colors.border }]}>
          <View style={styles.customFields}>
            <View style={styles.dateField}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>
                De
              </Text>
              <ThemedTextInput
                value={fromInput}
                onChangeText={setFromInput}
                placeholder="DD/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>
            <View style={styles.dateField}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>
                Até
              </Text>
              <ThemedTextInput
                value={toInput}
                onChangeText={setToInput}
                placeholder="DD/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>
          </View>
          {dateError ? (
            <ThemedText variant="caption" style={{ color: colors.danger }}>
              {dateError}
            </ThemedText>
          ) : null}
          <Pressable
            style={[
              styles.applyRangeButton,
              { backgroundColor: colors.primary },
            ]}
            onPress={applyCustomRange}
          >
            <ThemedText
              variant="caption"
              style={{ color: colors.primaryForeground, fontWeight: "700" }}
            >
              Aplicar período
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.chartLoading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <ThemedText
          variant="bodySm"
          style={{ marginTop: 12, color: colors.danger }}
        >
          {(error as Error).message}
        </ThemedText>
      ) : !barData.length ? (
        <ThemedText variant="bodySm" muted style={{ marginTop: 12 }}>
          Sem vendas com fornecedor no período.
        </ThemedText>
      ) : (
        <View style={styles.chartWrap} onLayout={onChartAreaLayout}>
          <View style={styles.tooltipDock} pointerEvents="none">
            {focused ? (
              <View
                style={[
                  styles.tooltip,
                  {
                    backgroundColor: colors.surfaceOverlay,
                    borderColor: colors.glassBorder,
                  },
                ]}
              >
                <ThemedText
                  variant="caption"
                  numberOfLines={1}
                  style={{ fontWeight: "600" }}
                >
                  {focused.fullName}
                </ThemedText>
                <ThemedText variant="caption" muted style={{ marginTop: 2 }}>
                  {displayMoney(hideValues, focused.value)}
                </ThemedText>
              </View>
            ) : (
              <ThemedText variant="caption" muted>
                Toque numa barra para ver o valor
              </ThemedText>
            )}
          </View>

          {parentWidth > 0 ? (
            <BarChart
              data={barData}
              width={plotWidth}
              parentWidth={parentWidth}
              height={CHART_HEIGHT}
              maxValue={chartMaxValue}
              barWidth={barWidth}
              spacing={BAR_SPACING}
              initialSpacing={INITIAL_SPACING}
              endSpacing={END_SPACING}
              noOfSections={4}
              showGradient
              frontColor={gradientTo}
              gradientColor={gradientFrom}
              barBorderRadius={3}
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
                fontSize: 9,
                width: X_LABEL_WIDTH,
                textAlign: "center",
              }}
              labelsDistanceFromXaxis={8}
              xAxisLabelsVerticalShift={4}
              labelsExtraHeight={30}
              focusBarOnPress
              onPress={(item: SupplierBar) => {
                setFocused((prev) =>
                  prev?.fullName === item.fullName && prev.value === item.value
                    ? null
                    : item,
                );
              }}
            />
          ) : null}
          {isFetching && !isLoading ? (
            <View
              style={[
                styles.chartOverlay,
                { backgroundColor: colorWithAlpha(colors.background, 0.65) },
              ]}
            >
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
      )}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  chips: {
    marginTop: 12,
    zIndex: 1,
  },
  chartWrap: {
    marginTop: 8,
    width: "100%",
    alignSelf: "stretch",
    overflow: "visible",
    position: "relative",
    zIndex: 5,
  },
  tooltipDock: {
    minHeight: TOOLTIP_DOCK_HEIGHT,
    marginBottom: 4,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  chartLoading: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    minHeight: CHART_HEIGHT,
  },
  chartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  customRange: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 10 },
  customFields: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1, gap: 5 },
  dateLabel: { fontSize: 12, fontWeight: "700" },
  applyRangeButton: {
    alignSelf: "flex-end",
    borderRadius: radiiPx.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  tooltip: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: radiiPx.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
