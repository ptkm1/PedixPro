import { fmtMoney } from "@/components/atoms/formatMoney";
import { useTheme } from "@/lib/theme";
import type { CatalogProductPrice } from "@pedidos/shared";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  productName: string;
  prices: CatalogProductPrice[];
  onClose: () => void;
};

export function ProductPriceTablesSheet({
  visible,
  productName,
  prices,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar">
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
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          Tabelas de preço
        </Text>
        <Text
          style={[styles.subtitle, { color: colors.textMuted }]}
          numberOfLines={2}
        >
          {productName}
        </Text>
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {prices.map((row) => (
            <View
              key={row.priceTableId}
              style={[styles.row, { borderBottomColor: colors.border }]}
            >
              <Text
                style={[styles.tableName, { color: colors.text }]}
                numberOfLines={2}
              >
                {row.priceTableName}
              </Text>
              <Text style={[styles.price, { color: colors.success }]}>
                R$ {fmtMoney(row.price)}
              </Text>
            </View>
          ))}
        </ScrollView>
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Fechar tabelas de preço"
        >
          <Text style={styles.closeTxt}>Fechar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  backdropFill: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "70%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
  },
  list: {
    marginTop: 12,
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  price: {
    fontSize: 15,
    fontWeight: "800",
  },
  closeBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeTxt: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
});
