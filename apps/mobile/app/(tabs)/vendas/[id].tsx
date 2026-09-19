import { fmtMoney } from "@/components/atoms/formatMoney";
import { ThemedButton } from "@/components/atoms/ThemedButton";
import { ThemedCard } from "@/components/atoms/ThemedCard";
import { ThemedText } from "@/components/atoms/ThemedText";
import { MobileHeader, MobileScreen, SafeScreen } from "@/components/layout";
import { MoneyLabel } from "@/components/molecules/MoneyLabel";
import { useSaleDetailScreen } from "@/hooks/screens/useSaleDetailScreen";
import { useTheme } from "@/lib/theme";
import { formatBrazilPhoneDigits } from "@pedidos/shared";
import {
  orderStatusBadgeLabel,
  orderStatusDetailLabel,
} from "@/lib/utils/order-status";
import { FileText, RotateCcw, Share2 } from "lucide-react-native";
import { ActivityIndicator, StyleSheet, View } from "react-native";

function orderCodeLabel(order: {
  orderNumber?: number | null;
}): string {
  if (order.orderNumber != null) return String(order.orderNumber);
  return "—";
}

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
          <View style={styles.hero}>
            <ThemedText variant="title">{orderCodeLabel(order)}</ThemedText>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.border,
                },
              ]}
            >
              <ThemedText variant="caption" style={{ fontWeight: "700" }}>
                {orderStatusBadgeLabel(order.status, order.situation)}
              </ThemedText>
            </View>
          </View>
          <ThemedText variant="bodySm" muted>
            {new Date(order.createdAt).toLocaleString("pt-BR")} ·{" "}
            {orderStatusDetailLabel(order.status, order.situation)}
          </ThemedText>

          <ThemedCard style={styles.card}>
            <ThemedText variant="caption" muted>
              Etapa
            </ThemedText>
            <ThemedText variant="titleSm" style={{ marginTop: 4 }}>
              {orderStatusDetailLabel(order.status, order.situation)}
            </ThemedText>
            <ThemedText
              variant="caption"
              muted
              style={{ marginTop: 12 }}
            >
              Cliente
            </ThemedText>
            <ThemedText variant="titleSm" style={{ marginTop: 4 }}>
              {order.customer?.name ?? "Sem cliente"}
            </ThemedText>
            {order.seller?.user.name ? (
              <>
                <ThemedText
                  variant="caption"
                  muted
                  style={{ marginTop: 12 }}
                >
                  Vendedor
                </ThemedText>
                <ThemedText variant="titleSm" style={{ marginTop: 4 }}>
                  {order.seller.user.name}
                </ThemedText>
                {order.seller.user.phone?.trim() ? (
                  <ThemedText variant="bodySm" muted style={{ marginTop: 4 }}>
                    {formatBrazilPhoneDigits(order.seller.user.phone)}
                  </ThemedText>
                ) : null}
              </>
            ) : null}
            {order.notes ? (
              <>
                <ThemedText variant="caption" muted style={{ marginTop: 12 }}>
                  Observações
                </ThemedText>
                <ThemedText variant="bodySm" style={{ marginTop: 4 }}>
                  {order.notes}
                </ThemedText>
              </>
            ) : null}
          </ThemedCard>

          {order.creditHoldReasons != null ? (
            <ThemedCard
              style={[
                styles.card,
                {
                  borderColor: colors.warning,
                  backgroundColor: colors.warningSurface,
                },
              ]}
            >
              <ThemedText
                variant="bodySm"
                style={{ color: colors.warning, fontWeight: "600" }}
              >
                Motivos de crédito
              </ThemedText>
              <ThemedText variant="bodySm" style={{ marginTop: 6 }}>
                {typeof order.creditHoldReasons === "string"
                  ? order.creditHoldReasons
                  : JSON.stringify(order.creditHoldReasons)}
              </ThemedText>
            </ThemedCard>
          ) : null}

          <ThemedText variant="titleSm" style={{ marginTop: 4 }}>
            Itens ({order.items.length})
          </ThemedText>
          {order.items.map((it) => {
            const unit = Number(it.unitPrice);
            const subtotal = unit * it.quantity;
            return (
              <ThemedCard key={it.id} style={styles.itemCard}>
                <ThemedText variant="body" style={{ fontWeight: "600" }}>
                  {it.productName}
                </ThemedText>
                <View style={styles.itemMeta}>
                  <ThemedText variant="bodySm" muted>
                    {it.quantity} × R$ {fmtMoney(unit)}
                  </ThemedText>
                  <MoneyLabel amount={subtotal} fontWeight="700" />
                </View>
              </ThemedCard>
            );
          })}

          <ThemedCard style={[styles.card, styles.totalCard]}>
            <ThemedText variant="titleSm">Total</ThemedText>
            <MoneyLabel
              amount={Number(order.totalAmount)}
              fontSize={20}
              fontWeight="800"
            />
          </ThemedCard>

          {pdfErr ? (
            <ThemedText variant="bodySm" style={{ color: colors.danger }}>
              {pdfErr}
            </ThemedText>
          ) : null}

          {canRepeatSale ? (
            <ThemedButton
              variant="outline"
              style={styles.pdfBtn}
              onPress={repeatThisSale}
            >
              <View style={styles.pdfBtnInner}>
                <RotateCcw size={18} color={colors.primary} />
                <ThemedText
                  variant="body"
                  style={{ color: colors.primary, fontWeight: "700" }}
                >
                  Repetir esta venda
                </ThemedText>
              </View>
            </ThemedButton>
          ) : null}

          <ThemedButton
            loading={pdfPending}
            loadingLabel="Gerando PDF…"
            style={styles.pdfBtn}
            onPress={() => void shareOrderPdf()}
          >
            <View style={styles.pdfBtnInner}>
              <Share2 size={18} color={colors.primaryForeground} />
              <FileText size={18} color={colors.primaryForeground} />
              <ThemedText
                variant="body"
                style={{
                  color: colors.primaryForeground,
                  fontWeight: "700",
                }}
              >
                Imprimir / compartilhar PDF
              </ThemedText>
            </View>
          </ThemedButton>
        </MobileScreen>
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { gap: 12, paddingBottom: 32 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  card: { gap: 0 },
  itemCard: { gap: 8 },
  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  pdfBtn: { marginTop: 8, minHeight: 52 },
  pdfBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
});
