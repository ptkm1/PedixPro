import { fmtMoney } from "@/components/atoms/formatMoney";
import { ThemedTextInput } from "@/components/atoms/ThemedTextInput";
import { useTheme } from "@/lib/theme";
import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type DiscountSheetProps = {
  visible: boolean;
  productName: string;
  unitPrice: number;
  /** Desconto atualmente aplicado na linha (cancelar restaura este). */
  currentPercent: number;
  maxPercent: number;
  onApply: (percent: number) => void;
  onRemove: () => void;
  onCancel: () => void;
};

/**
 * Bottom sheet de desconto: % manual, valor R$ e preço final.
 * Nada aplica só por abrir — só em Aplicar / Remover.
 */
export function DiscountSheet({
  visible,
  productName,
  unitPrice,
  currentPercent,
  maxPercent,
  onApply,
  onRemove,
  onCancel,
}: DiscountSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [draftPct, setDraftPct] = useState("0");

  useEffect(() => {
    if (visible) {
      setDraftPct(
        currentPercent > 0 ? String(roundPct(currentPercent)) : "0",
      );
    }
  }, [visible, currentPercent]);

  const parsedPct = useMemo(() => parsePercentDraft(draftPct), [draftPct]);
  const clampedPct = Math.min(Math.max(0, parsedPct), Math.max(0, maxPercent));
  const discountValue = roundMoney((unitPrice * clampedPct) / 100);
  const finalPrice = roundMoney(unitPrice - discountValue);
  const overMax = parsedPct > maxPercent + 1e-9;
  const canApply = maxPercent > 0 && !overMax;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onCancel}
          accessibilityLabel="Cancelar desconto"
        >
          <View style={styles.backdropFill} />
        </Pressable>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>Desconto</Text>
          <Text
            style={[styles.subtitle, { color: colors.textMuted }]}
            numberOfLines={2}
          >
            {productName}
          </Text>

          <View style={styles.rowBetween}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Preço original
            </Text>
            <Text style={[styles.value, { color: colors.text }]}>
              R$ {fmtMoney(unitPrice)}
            </Text>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
            Percentual (%)
          </Text>
          <ThemedTextInput
            value={draftPct}
            onChangeText={(t) => setDraftPct(sanitizePercentInput(t))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            selectTextOnFocus
            placeholder="0"
            style={styles.input}
            accessibilityLabel="Percentual de desconto"
          />
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Limite máximo: {roundPct(maxPercent)}%
            {overMax ? " · acima do autorizado" : ""}
          </Text>

          <View style={styles.rowBetween}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Valor do desconto
            </Text>
            <Text style={[styles.value, { color: colors.warning }]}>
              − R$ {fmtMoney(discountValue)}
            </Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Preço final
            </Text>
            <Text style={[styles.valueStrong, { color: colors.success }]}>
              R$ {fmtMoney(finalPrice)}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.btnGhost, { borderColor: colors.border }]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <Text style={[styles.btnGhostTxt, { color: colors.text }]}>
                Cancelar
              </Text>
            </Pressable>
            <Pressable
              style={[styles.btnGhost, { borderColor: colors.border }]}
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel="Remover desconto"
            >
              <Text style={[styles.btnGhostTxt, { color: colors.danger }]}>
                Remover
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.btnPrimary,
                {
                  backgroundColor: colors.primary,
                  opacity: canApply ? 1 : 0.45,
                },
              ]}
              disabled={!canApply}
              onPress={() => onApply(clampedPct)}
              accessibilityRole="button"
              accessibilityLabel="Aplicar desconto"
            >
              <Text style={styles.btnPrimaryTxt}>Aplicar</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundPct(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function sanitizePercentInput(raw: string): string {
  const normalized = raw.replace(",", ".").replace(/[^\d.]/g, "");
  const parts = normalized.split(".");
  if (parts.length <= 1) return normalized;
  return `${parts[0]}.${parts.slice(1).join("").slice(0, 3)}`;
}

function parsePercentDraft(raw: string): number {
  if (!raw.trim()) return 0;
  const n = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropFill: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  title: { fontSize: 17, fontWeight: "800" },
  subtitle: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  label: { fontSize: 13, fontWeight: "600" },
  value: { fontSize: 14, fontWeight: "700" },
  valueStrong: { fontSize: 16, fontWeight: "800" },
  fieldLabel: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  input: { marginTop: 2 },
  hint: { fontSize: 12, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnGhostTxt: { fontWeight: "800", fontSize: 13 },
  btnPrimary: {
    flex: 1.2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPrimaryTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
