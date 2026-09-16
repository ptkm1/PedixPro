import { ThemedButton } from "@/components/atoms/ThemedButton";
import { ThemedCard } from "@/components/atoms/ThemedCard";
import { ThemedText } from "@/components/atoms/ThemedText";
import { ThemedTextInput } from "@/components/atoms/ThemedTextInput";
import { MobileHeader, MobileScreen, SafeScreen } from "@/components/layout";
import { FilterChipRow } from "@/components/molecules/FilterChipRow";
import {
    useReportsScreen,
    type ReportKind,
} from "@/hooks/screens/useReportsScreen";
import {
    PERIOD_FILTER_OPTIONS_WITH_CUSTOM,
    type PeriodFilterId,
    type PeriodPreset,
} from "@/lib/period-presets";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { radiiPx } from "@pedidos/design-tokens";
import { FileText, Share2, Users } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const KIND_ORDER: ReportKind[] = [
  "sales-summary",
  "sales-by-customer",
  "sales-by-supplier",
];

export default function ReportsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const s = useReportsScreen();
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const applyRange = () => {
    const parse = (value: string, end = false) => {
      const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return null;
      const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0));
      return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? d.toISOString() : null;
    };
    const start = parse(from);
    const end = parse(to, true);
    if (!start || !end || start > end) { setDateError("Informe datas válidas no formato DD/MM/AAAA."); return; }
    s.setCustomRange({ from: start, to: end });
    setDateError(null);
    setCustomOpen(false);
  };

  return (
    <SafeScreen variant="tab">
      <MobileHeader title="Relatórios" subtitle={s.scopeLabel} showBack />
      <MobileScreen contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <ThemedText variant="bodySm" muted>
          Gere PDFs das suas vendas confirmadas e compartilhe pelo celular.
        </ThemedText>

        <ThemedCard>
          <ThemedText variant="titleSm" style={{ marginBottom: 10 }}>
            Período
          </ThemedText>
          <FilterChipRow
            scroll={false}
            options={PERIOD_FILTER_OPTIONS_WITH_CUSTOM}
            value={
              (s.isCustomRange ? "custom" : s.preset) as PeriodFilterId | null
            }
            onChange={(id) => {
              if (id === "custom") {
                setCustomOpen((open) => !open);
                return;
              }
              s.selectPreset(id as PeriodPreset);
            }}
          />
          {customOpen ? (
            <View style={[styles.customRange, { borderColor: colors.border }]}>
              <View style={styles.dateRow}>
                <View style={styles.dateField}><Text style={[styles.dateLabel, { color: colors.textMuted }]}>De</Text><ThemedTextInput value={from} onChangeText={setFrom} placeholder="DD/MM/AAAA" keyboardType="number-pad" maxLength={10} /></View>
                <View style={styles.dateField}><Text style={[styles.dateLabel, { color: colors.textMuted }]}>Até</Text><ThemedTextInput value={to} onChangeText={setTo} placeholder="DD/MM/AAAA" keyboardType="number-pad" maxLength={10} /></View>
              </View>
              {dateError ? <ThemedText variant="caption" style={{ color: colors.danger }}>{dateError}</ThemedText> : null}
              <ThemedButton size="sm" style={{ alignSelf: "flex-end" }} onPress={applyRange}>Aplicar período</ThemedButton>
            </View>
          ) : null}
        </ThemedCard>

        {s.isTeamLeader ? (
          <ThemedCard>
            <ThemedText variant="titleSm" style={{ marginBottom: 10 }}>
              Escopo
            </ThemedText>
            <View style={styles.scopeRow}>
              <Pressable
                onPress={() => s.setScope("own")}
                style={[
                  styles.scopeBtn,
                  {
                    borderColor:
                      s.scope === "own" ? colors.primary : colors.border,
                    backgroundColor:
                      s.scope === "own"
                        ? colorWithAlpha(colors.primary, 0.12)
                        : colors.card,
                  },
                ]}
              >
                <FileText
                  size={18}
                  color={s.scope === "own" ? colors.primary : colors.iconMuted}
                />
                <ThemedText
                  variant="bodySm"
                  style={{
                    fontWeight: "600",
                    color: s.scope === "own" ? colors.primary : colors.text,
                  }}
                >
                  Só minhas vendas
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => s.setScope("team")}
                style={[
                  styles.scopeBtn,
                  {
                    borderColor:
                      s.scope === "team" ? colors.primary : colors.border,
                    backgroundColor:
                      s.scope === "team"
                        ? colorWithAlpha(colors.primary, 0.12)
                        : colors.card,
                  },
                ]}
              >
                <Users
                  size={18}
                  color={s.scope === "team" ? colors.primary : colors.iconMuted}
                />
                <ThemedText
                  variant="bodySm"
                  style={{
                    fontWeight: "600",
                    color: s.scope === "team" ? colors.primary : colors.text,
                  }}
                >
                  Equipe toda
                </ThemedText>
              </Pressable>
            </View>
          </ThemedCard>
        ) : null}

        {s.isAdmin ? (
          <ThemedCard>
            <ThemedText variant="bodySm" muted>
              Como administrador, os PDFs incluem todas as vendas confirmadas da
              organização no período.
            </ThemedText>
          </ThemedCard>
        ) : null}

        {KIND_ORDER.map((kind) => {
          const meta = s.reports[kind];
          const pending = s.pendingKind === kind;
          return (
            <ThemedCard key={kind}>
              <ThemedText variant="titleSm">{meta.title}</ThemedText>
              <ThemedText
                variant="bodySm"
                muted
                style={{ marginTop: 4, marginBottom: 14 }}
              >
                {meta.description}
              </ThemedText>
              <ThemedButton
                size="lg"
                loading={pending}
                loadingLabel="Gerando…"
                disabled={s.pendingKind != null}
                onPress={() => void s.generate(kind)}
              >
                <View style={styles.btnInner}>
                  <Share2 color={colors.primaryForeground} size={18} />
                  <ThemedText
                    variant="body"
                    style={{
                      color: colors.primaryForeground,
                      fontWeight: "700",
                    }}
                  >
                    Gerar e compartilhar PDF
                  </ThemedText>
                </View>
              </ThemedButton>
            </ThemedCard>
          );
        })}

        {s.isSeller ? (
          <ThemedCard>
            <ThemedText variant="titleSm">Minhas comissões</ThemedText>
            <ThemedText variant="bodySm" muted style={{ marginTop: 4, marginBottom: 14 }}>
              Acompanhe suas vendas e comissão no período selecionado.
            </ThemedText>
            <ThemedButton size="lg" onPress={() => router.push({ pathname: "/commissions", params: { from: s.range.from, to: s.range.to } })}>
              <View style={styles.btnInner}><Share2 color={colors.primaryForeground} size={18} /><ThemedText variant="body" style={{ color: colors.primaryForeground, fontWeight: "700" }}>Ver minhas comissões</ThemedText></View>
            </ThemedButton>
          </ThemedCard>
        ) : null}

        {s.err ? (
          <ThemedText style={{ color: colors.danger, textAlign: "center" }}>
            {s.err}
          </ThemedText>
        ) : null}
      </MobileScreen>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  scopeRow: { gap: 10 },
  scopeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: radiiPx.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  customRange: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 10 },
  dateRow: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1, gap: 5 },
  dateLabel: { fontSize: 12, fontWeight: "700" },
});
