import { QuantityStepper } from "@/components/molecules/QuantityStepper";
import { fmtMoney } from "@/components/atoms/formatMoney";
import { useTheme } from "@/lib/theme";
import type { CartLine } from "@/lib/sale/types";
import { Trash2 } from "lucide-react-native";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type CartBottomSheetProps = {
  visible: boolean;
  lines: CartLine[];
  cartTotal: number;
  onClose: () => void;
  onFinalize: () => void;
  canFinalize: boolean;
  lineTotal: (line: CartLine) => number;
  onQtyChange: (line: CartLine, qty: number) => void;
  onOpenDiscount: (line: CartLine) => void;
  onRemoveLine: (line: CartLine) => void;
};

/**
 * Bottom sheet do carrinho expandido: itens editáveis + finalizar.
 * Recolhido fica só a barra compacta no footer da tela.
 */
export function CartBottomSheet({
  visible,
  lines,
  cartTotal,
  onClose,
  onFinalize,
  canFinalize,
  lineTotal,
  onQtyChange,
  onOpenDiscount,
  onRemoveLine,
}: CartBottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetMaxH = Math.min(height * 0.72, 560);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel="Recolher carrinho"
        >
          <View style={styles.backdropFill} />
        </Pressable>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              maxHeight: sheetMaxH,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <Pressable
            onPress={onClose}
            accessibilityLabel="Recolher carrinho"
            hitSlop={8}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </Pressable>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>
              Carrinho · {lines.length} {lines.length === 1 ? "item" : "itens"}
            </Text>
            <Text style={[styles.total, { color: colors.success }]}>
              R$ {fmtMoney(cartTotal)}
            </Text>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {lines.map((line) => (
              <View
                key={line.productId}
                style={[styles.row, { borderBottomColor: colors.border }]}
              >
                <View style={styles.rowMain}>
                  <Text
                    style={[styles.name, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {line.name}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    Unit. R$ {fmtMoney(line.effectiveUnitPrice)}
                    {line.discountPercent > 0
                      ? ` · −${line.discountPercent}%`
                      : ""}
                    {" · "}Sub R$ {fmtMoney(lineTotal(line))}
                  </Text>
                  {line.priceTableName ? (
                    <Text
                      style={[styles.meta, { color: colors.textMuted }]}
                      numberOfLines={1}
                    >
                      Tabela: {line.priceTableName}
                    </Text>
                  ) : null}
                  <View style={styles.rowActions}>
                    <QuantityStepper
                      value={line.qty}
                      min={0}
                      onChange={(qty) => onQtyChange(line, qty)}
                    />
                    <Pressable
                      style={[
                        styles.discBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.surfaceMuted,
                          opacity: line.maxSellerDiscountPercent <= 0 ? 0.45 : 1,
                        },
                      ]}
                      disabled={line.maxSellerDiscountPercent <= 0}
                      onPress={() => onOpenDiscount(line)}
                    >
                      <Text style={[styles.discTxt, { color: colors.text }]}>
                        {line.maxSellerDiscountPercent <= 0
                          ? "Sem desc."
                          : line.discountPercent > 0
                            ? `Desc. ${line.discountPercent}%`
                            : "Desconto"}
                      </Text>
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      onPress={() => onRemoveLine(line)}
                      accessibilityLabel={`Remover ${line.name}`}
                      style={styles.removeBtn}
                    >
                      <Trash2 size={18} color={colors.danger} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable
            style={[
              styles.finalBtn,
              {
                backgroundColor: colors.primary,
                opacity: canFinalize ? 1 : 0.45,
              },
            ]}
            disabled={!canFinalize}
            onPress={onFinalize}
            accessibilityRole="button"
            accessibilityLabel="Finalizar pedido"
          >
            <Text style={styles.finalTxt}>
              Finalizar pedido · R$ {fmtMoney(cartTotal)}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  backdropFill: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: "800", flex: 1 },
  total: { fontSize: 15, fontWeight: "800" },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 4 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { gap: 4 },
  name: { fontSize: 14, fontWeight: "700" },
  meta: { fontSize: 12, fontWeight: "600" },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  discBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  discTxt: { fontSize: 12, fontWeight: "800" },
  removeBtn: { padding: 6 },
  finalBtn: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  finalTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
