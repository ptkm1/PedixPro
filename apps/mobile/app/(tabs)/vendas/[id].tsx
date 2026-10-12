import { ThemedText } from "@/components/atoms/ThemedText";
import { MobileHeader, MobileScreen, SafeScreen } from "@/components/layout";
import { SaleDetailPanel } from "@/components/molecules/SaleDetailPanel";
import { useSaleDetailScreen } from "@/hooks/screens/useSaleDetailScreen";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { FileText, RotateCcw } from "lucide-react-native";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

export default function SaleDetailScreen() {
  const { colors } = useTheme();
  const {
    order,
    isLoading,
    pdfPending,
    pdfErr,
    shareOrderPdf,
    canRepeatSale,
    repeatThisSale,
  } = useSaleDetailScreen();

  return (
    <SafeScreen variant="tab">
      <MobileHeader title="Detalhe da venda" showBack />
      {isLoading || !order ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <MobileScreen
          scroll
          noBottomInset
          contentContainerStyle={styles.content}
        >
          <SaleDetailPanel
            order={order}
            footer={
              <View style={styles.actions}>
                {pdfErr ? (
                  <ThemedText
                    variant="bodySm"
                    style={{ color: colors.danger }}
                  >
                    {pdfErr}
                  </ThemedText>
                ) : null}

                <View
                  style={[
                    styles.actionsRow,
                    !canRepeatSale && styles.actionsRowSingle,
                  ]}
                >
                  {canRepeatSale ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionTile,
                        styles.actionTileSecondary,
                        {
                          borderColor: colorWithAlpha(colors.primary, 0.35),
                          backgroundColor: colorWithAlpha(colors.primary, 0.08),
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                      onPress={repeatThisSale}
                      accessibilityLabel="Repetir esta venda"
                    >
                      <View
                        style={[
                          styles.actionIcon,
                          {
                            backgroundColor: colorWithAlpha(
                              colors.primary,
                              0.14,
                            ),
                          },
                        ]}
                      >
                        <RotateCcw
                          size={20}
                          color={colors.primary}
                          strokeWidth={2.3}
                        />
                      </View>
                      <Text
                        style={[styles.actionTitle, { color: colors.text }]}
                      >
                        Repetir
                      </Text>
                      <Text
                        style={[
                          styles.actionHint,
                          { color: colors.textMuted },
                        ]}
                      >
                        Nova venda igual
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    style={({ pressed }) => [
                      styles.actionTile,
                      styles.actionTilePrimary,
                      {
                        backgroundColor: colors.primary,
                        borderColor: colorWithAlpha(colors.primary, 0.7),
                        opacity: pdfPending ? 0.7 : pressed ? 0.9 : 1,
                        flex: canRepeatSale ? 1 : undefined,
                        width: canRepeatSale ? undefined : "100%",
                      },
                    ]}
                    disabled={pdfPending}
                    onPress={() => void shareOrderPdf()}
                    accessibilityLabel="Imprimir ou compartilhar PDF"
                  >
                    <View
                      style={[
                        styles.actionIcon,
                        {
                          backgroundColor: colorWithAlpha(
                            colors.primaryForeground,
                            0.18,
                          ),
                        },
                      ]}
                    >
                      {pdfPending ? (
                        <ActivityIndicator
                          color={colors.primaryForeground}
                          size="small"
                        />
                      ) : (
                        <FileText
                          size={20}
                          color={colors.primaryForeground}
                          strokeWidth={2.3}
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.actionTitle,
                        { color: colors.primaryForeground },
                      ]}
                    >
                      {pdfPending ? "Gerando…" : "PDF"}
                    </Text>
                    <Text
                      style={[
                        styles.actionHint,
                        {
                          color: colorWithAlpha(
                            colors.primaryForeground,
                            0.78,
                          ),
                        },
                      ]}
                    >
                      {pdfPending
                        ? "Aguarde um instante"
                        : "Imprimir ou compartilhar"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            }
          />
        </MobileScreen>
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { gap: 12, paddingBottom: 32 },
  actions: {
    gap: 10,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  actionsRowSingle: {
    flexDirection: "column",
  },
  actionTile: {
    flex: 1,
    minHeight: 108,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionTileSecondary: {},
  actionTilePrimary: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  actionHint: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
});
