import { fmtMoney } from "@/components/atoms/formatMoney";
import { ThemedButton } from "@/components/atoms/ThemedButton";
import { ThemedCard } from "@/components/atoms/ThemedCard";
import { ThemedText } from "@/components/atoms/ThemedText";
import { ThemedTextInput } from "@/components/atoms/ThemedTextInput";
import { MobileHeader, MobileScreen, SafeScreen } from "@/components/layout";
import { FilterChipRow } from "@/components/molecules/FilterChipRow";
import { StatCard } from "@/components/molecules/StatCard";
import { useSellerCommissions } from "@/hooks/screens/useSellerCommissions";
import {
    PERIOD_FILTER_OPTIONS_WITH_CUSTOM,
    periodRange,
    type PeriodFilterId,
    type PeriodPreset,
} from "@/lib/period-presets";
import { useTheme } from "@/lib/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FileText, Share2, TrendingUp } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

function isoFromBrDate(value: string, end = false): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(
    Date.UTC(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      end ? 23 : 0,
      end ? 59 : 0,
      end ? 59 : 0,
      end ? 999 : 0,
    ),
  );
  return date.getUTCDate() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1
    ? date.toISOString()
    : null;
}

function matchPreset(
  from?: string,
  to?: string,
): PeriodPreset | "custom" | null {
  if (!from && !to) return "this_month";
  if (!from || !to) return "custom";
  for (const preset of [
    "this_month",
    "last_month",
    "last_7_days",
    "last_90_days",
  ] as PeriodPreset[]) {
    const range = periodRange(preset);
    if (range.from === from && range.to === to) return preset;
  }
  return "custom";
}

export default function SellerCommissionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const { colors } = useTheme();
  const s = useSellerCommissions();
  const [customOpen, setCustomOpen] = useState(false);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);

  const activeFilter = useMemo(
    () => matchPreset(params.from, params.to),
    [params.from, params.to],
  );

  const goToRange = (range: { from: string; to: string }) =>
    router.replace({ pathname: "/commissions", params: range });

  const applyCustomRange = () => {
    const from = isoFromBrDate(fromText);
    const to = isoFromBrDate(toText, true);
    if (!from || !to || from > to) {
      setDateError("Informe datas válidas no formato DD/MM/AAAA.");
      return;
    }
    setDateError(null);
    setCustomOpen(false);
    goToRange({ from, to });
  };

  const period = s.period
    ? `${new Date(s.period.from).toLocaleDateString("pt-BR")} a ${new Date(s.period.to).toLocaleDateString("pt-BR")}`
    : "Carregando período…";

  return (
    <SafeScreen variant="tab">
      <MobileHeader title="Minhas comissões" subtitle={period} showBack />
      <MobileScreen
        refreshing={s.isFetching}
        onRefresh={s.refresh}
        contentContainerStyle={{ gap: 14, paddingBottom: 32 }}
      >
        <ThemedCard>
          <ThemedText variant="titleSm" style={{ marginBottom: 10 }}>
            Período
          </ThemedText>
          <FilterChipRow
            scroll={false}
            options={PERIOD_FILTER_OPTIONS_WITH_CUSTOM}
            value={activeFilter as PeriodFilterId | null}
            onChange={(id) => {
              if (id === "custom") {
                setCustomOpen((open) => !open);
                return;
              }
              goToRange(periodRange(id));
            }}
          />
          {customOpen ? (
            <View style={[styles.customRange, { borderColor: colors.border }]}>
              <View style={styles.dateRow}>
                <View style={styles.dateField}>
                  <Text style={[styles.dateLabel, { color: colors.textMuted }]}>
                    De
                  </Text>
                  <ThemedTextInput
                    value={fromText}
                    onChangeText={setFromText}
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
                    value={toText}
                    onChangeText={setToText}
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
              <ThemedButton
                size="sm"
                style={{ alignSelf: "flex-end" }}
                onPress={applyCustomRange}
              >
                Aplicar período
              </ThemedButton>
            </View>
          ) : null}
        </ThemedCard>

        {s.isLoading ? (
          <View style={{ gap: 10 }}>
            <ActivityIndicator color={colors.primary} />
            {[0, 1, 2].map((index) => (
              <ThemedCard key={index}>
                <View
                  style={[styles.skeleton, { backgroundColor: colors.surfaceMuted }]}
                />
                <View
                  style={[
                    styles.skeletonShort,
                    { backgroundColor: colors.surfaceMuted },
                  ]}
                />
              </ThemedCard>
            ))}
          </View>
        ) : null}

        {s.totals ? (
          <View style={styles.stats}>
            <View style={styles.half}>
              <StatCard
                title="Total vendido"
                value={`R$ ${fmtMoney(s.totals.saleAmount)}`}
                icon={TrendingUp}
                compact
              />
            </View>
            <View style={styles.half}>
              <StatCard
                title="Comissão"
                value={`R$ ${fmtMoney(s.totals.commissionAmount)}`}
                icon={FileText}
                compact
              />
            </View>
          </View>
        ) : null}

        <ThemedButton size="lg" onPress={() => void s.share()}>
          <View style={styles.button}>
            <Share2 color={colors.primaryForeground} size={18} />
            <ThemedText
              style={{ color: colors.primaryForeground, fontWeight: "700" }}
            >
              Gerar e compartilhar PDF
            </ThemedText>
          </View>
        </ThemedButton>

        <ThemedText variant="titleSm">Extrato de comissões</ThemedText>
        {!s.isLoading && !s.rows.length ? (
          <ThemedCard>
            <ThemedText muted>
              Nenhuma comissão encontrada neste período.
            </ThemedText>
          </ThemedCard>
        ) : null}
        {s.rows.map((row) => (
          <Pressable
            key={row.orderId}
            onPress={() =>
              router.push({
                pathname: "/commissions/[id]",
                params: { id: row.orderId },
              })
            }
          >
            <ThemedCard>
              <View style={styles.head}>
                <ThemedText variant="body" style={{ fontWeight: "700" }}>
                  Pedido #{row.orderNumber ?? row.orderId.slice(-6)}
                </ThemedText>
                <ThemedText style={{ color: colors.success, fontWeight: "800" }}>
                  R$ {fmtMoney(row.commissionAmount)}
                </ThemedText>
              </View>
              <ThemedText variant="bodySm" muted>
                {row.customerName} ·{" "}
                {new Date(row.createdAt).toLocaleDateString("pt-BR")}
              </ThemedText>
              <ThemedText variant="bodySm" muted style={{ marginTop: 6 }}>
                Venda: R$ {fmtMoney(row.saleAmount)} · Comissão:{" "}
                {row.commissionPercent.toFixed(2)}%
              </ThemedText>
            </ThemedCard>
          </Pressable>
        ))}
        {s.hasMore ? (
          <ThemedButton
            variant="outline"
            onPress={s.loadMore}
            loading={s.isFetchingNextPage}
            loadingLabel="Carregando…"
          >
            Carregar mais
          </ThemedButton>
        ) : null}
        {s.error ? (
          <ThemedText style={{ color: colors.danger, textAlign: "center" }}>
            {s.error instanceof Error
              ? s.error.message
              : "Não foi possível carregar as comissões."}
          </ThemedText>
        ) : null}
      </MobileScreen>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 12 },
  half: { flex: 1, minWidth: 0 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  head: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  customRange: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 10 },
  dateRow: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1, gap: 5 },
  dateLabel: { fontSize: 12, fontWeight: "700" },
  skeleton: { height: 16, width: "72%", borderRadius: 8 },
  skeletonShort: {
    height: 12,
    width: "42%",
    borderRadius: 8,
    marginTop: 10,
  },
});
