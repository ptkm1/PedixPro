import { fmtMoney } from "@/components/atoms/formatMoney";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import type { SellerOrderDetail } from "@/hooks/screens/useSaleDetailScreen";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import {
    orderStatusBadgeLabel,
    orderStatusDetailLabel,
} from "@/lib/utils/order-status";
import { formatBrazilPhoneDigits } from "@pedidos/shared";
import {
    Calendar,
    CreditCard,
    FileText,
    Package,
    ShoppingBag,
    Table2,
    UserRound,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

function orderCodeLabel(order: { orderNumber?: number | null }): string {
  if (order.orderNumber != null) return String(order.orderNumber);
  return "—";
}

function MetaRow({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  subValue?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.metaRow}>
      <View
        style={[
          styles.metaIcon,
          { backgroundColor: colorWithAlpha(colors.primary, 0.12) },
        ]}
      >
        <Icon size={15} color={colors.primary} strokeWidth={2.4} />
      </View>
      <View style={styles.metaBody}>
        <Text style={[styles.metaLabel, { color: colors.textMuted }]}>
          {label}
        </Text>
        <Text
          style={[styles.metaValue, { color: colors.text }]}
          numberOfLines={2}
        >
          {value}
        </Text>
        {subValue ? (
          <Text
            style={[styles.metaSub, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {subValue}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function statusTone(
  status: string,
  colors: ReturnType<typeof useTheme>["colors"],
): { bg: string; border: string; text: string } {
  if (status === "CONFIRMED") {
    return {
      bg: colorWithAlpha(colors.success, 0.14),
      border: colorWithAlpha(colors.success, 0.35),
      text: colors.success,
    };
  }
  if (status === "CANCELLED") {
    return {
      bg: colorWithAlpha(colors.danger, 0.12),
      border: colorWithAlpha(colors.danger, 0.3),
      text: colors.danger,
    };
  }
  if (status === "PENDING_CREDIT_APPROVAL") {
    return {
      bg: colorWithAlpha(colors.warning, 0.14),
      border: colorWithAlpha(colors.warning, 0.35),
      text: colors.warning,
    };
  }
  return {
    bg: colorWithAlpha(colors.primary, 0.12),
    border: colorWithAlpha(colors.primary, 0.28),
    text: colors.primary,
  };
}

export type SaleDetailPanelProps = {
  order: SellerOrderDetail;
  /** Botões de ação (PDF, repetir, etc.). */
  footer?: ReactNode;
};

/**
 * Detalhe visual de uma venda: total em destaque, dados e itens com miniatura.
 */
export function SaleDetailPanel({ order, footer }: SaleDetailPanelProps) {
  const { colors, isDark } = useTheme();
  const tone = statusTone(order.status, colors);
  const itemCount = order.items.reduce((acc, it) => acc + it.quantity, 0);
  const customerLabel =
    order.customer?.tradeName?.trim() ||
    order.customer?.name?.trim() ||
    "Sem cliente";
  const paymentLabel = order.paymentCondition
    ? `${order.paymentCondition.code} - ${order.paymentCondition.name}`
    : null;
  const createdLabel = new Date(order.createdAt).toLocaleString("pt-BR");
  const stageLabel = orderStatusDetailLabel(order.status, order.situation);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: colors.primary }]}>
          Pedido #{orderCodeLabel(order)}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          Detalhe da venda
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {createdLabel} · {stageLabel}
        </Text>
      </View>

      <GlassSurface padded={false} radius={18}>
        <View style={styles.heroInner}>
          <View
            style={[styles.heroAccent, { backgroundColor: colors.primary }]}
          />
          <View style={styles.heroBody}>
            <View style={styles.heroTop}>
              <View
                style={[
                  styles.heroIconWrap,
                  {
                    backgroundColor: isDark
                      ? colors.primaryMuted
                      : colorWithAlpha(colors.primary, 0.12),
                  },
                ]}
              >
                <ShoppingBag
                  size={20}
                  color={colors.primary}
                  strokeWidth={2.2}
                />
              </View>
              <View style={styles.heroTopText}>
                <Text style={[styles.heroLabel, { color: colors.textMuted }]}>
                  Total da venda
                </Text>
                <Text style={[styles.heroTotal, { color: colors.primary }]}>
                  R$ {fmtMoney(Number(order.totalAmount))}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: tone.bg,
                    borderColor: tone.border,
                  },
                ]}
              >
                <Text style={[styles.statusTxt, { color: tone.text }]}>
                  {orderStatusBadgeLabel(order.status, order.situation)}
                </Text>
              </View>
            </View>
            <View style={styles.heroChips}>
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: colorWithAlpha(colors.primary, 0.1),
                    borderColor: colorWithAlpha(colors.primary, 0.22),
                  },
                ]}
              >
                <Package size={13} color={colors.primary} strokeWidth={2.4} />
                <Text style={[styles.chipTxt, { color: colors.primary }]}>
                  {itemCount} {itemCount === 1 ? "unidade" : "unidades"}
                </Text>
              </View>
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: colorWithAlpha(colors.primary, 0.1),
                    borderColor: colorWithAlpha(colors.primary, 0.22),
                  },
                ]}
              >
                <Text style={[styles.chipTxt, { color: colors.primary }]}>
                  {order.items.length}{" "}
                  {order.items.length === 1 ? "item" : "itens"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </GlassSurface>

      <GlassSurface contentStyle={styles.cardInner} radius={16}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          Dados da venda
        </Text>
        <MetaRow icon={UserRound} label="Cliente" value={customerLabel} />
        {order.customer?.document ? (
          <MetaRow
            icon={FileText}
            label="Documento"
            value={order.customer.document}
          />
        ) : null}
        {order.seller?.user.name ? (
          <MetaRow
            icon={UserRound}
            label="Vendedor"
            value={order.seller.user.name}
            subValue={
              order.seller.user.phone?.trim()
                ? formatBrazilPhoneDigits(order.seller.user.phone)
                : null
            }
          />
        ) : null}
        {paymentLabel ? (
          <MetaRow icon={CreditCard} label="Pagamento" value={paymentLabel} />
        ) : null}
        {order.priceTable?.name ? (
          <MetaRow
            icon={Table2}
            label="Tabela de preços"
            value={order.priceTable.name}
          />
        ) : null}
        <MetaRow icon={Calendar} label="Etapa" value={stageLabel} />
      </GlassSurface>

      {order.creditHoldReasons != null ? (
        <GlassSurface
          contentStyle={styles.cardInner}
          radius={16}
          style={{
            borderColor: colors.warning,
          }}
        >
          <Text style={[styles.cardTitle, { color: colors.warning }]}>
            Motivos de crédito
          </Text>
          <Text style={[styles.creditTxt, { color: colors.text }]}>
            {typeof order.creditHoldReasons === "string"
              ? order.creditHoldReasons
              : JSON.stringify(order.creditHoldReasons)}
          </Text>
        </GlassSurface>
      ) : null}

      <GlassSurface contentStyle={styles.cardInner} radius={16}>
        <View style={styles.itemsHead}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Itens</Text>
          <Text style={[styles.itemsCount, { color: colors.textMuted }]}>
            {order.items.length}
          </Text>
        </View>

        {order.items.map((it, idx) => {
          const unit = Number(it.unitPrice);
          const subtotal = unit * it.quantity;
          const thumbUri = it.product?.imageUrl?.trim() || null;
          return (
            <View
              key={it.id}
              style={[
                styles.lineRow,
                idx < order.items.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.thumbWrap}>
                {thumbUri ? (
                  <Image
                    source={{ uri: thumbUri }}
                    style={styles.thumbImg}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View
                    style={[
                      styles.thumbPh,
                      {
                        backgroundColor: colorWithAlpha(colors.primary, 0.1),
                      },
                    ]}
                  >
                    <Package
                      size={20}
                      color={colors.primary}
                      strokeWidth={2}
                    />
                  </View>
                )}
                <View
                  style={[
                    styles.qtyBadge,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.qtyBadgeTxt,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {it.quantity}×
                  </Text>
                </View>
              </View>
              <View style={styles.lineBody}>
                <Text
                  style={[styles.lineName, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {it.productName}
                </Text>
                <Text
                  style={[styles.lineMeta, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  R$ {fmtMoney(unit)}
                  {it.priceOriginLabel ? ` · ${it.priceOriginLabel}` : ""}
                </Text>
              </View>
              <Text style={[styles.lineTotal, { color: colors.success }]}>
                R$ {fmtMoney(subtotal)}
              </Text>
            </View>
          );
        })}

        <View
          style={[styles.subtotalRow, { borderTopColor: colors.borderSubtle }]}
        >
          <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>
            Total
          </Text>
          <Text style={[styles.subtotalValue, { color: colors.text }]}>
            R$ {fmtMoney(Number(order.totalAmount))}
          </Text>
        </View>
      </GlassSurface>

      {order.notes?.trim() ? (
        <GlassSurface contentStyle={styles.cardInner} radius={16}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Observação
          </Text>
          <Text style={[styles.notesBody, { color: colors.textSecondary }]}>
            {order.notes}
          </Text>
        </GlassSurface>
      ) : null}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
    paddingBottom: 8,
  },
  header: {
    gap: 4,
    marginBottom: 2,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  heroInner: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 108,
  },
  heroAccent: {
    width: 4,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  heroBody: {
    flex: 1,
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTopText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  heroTotal: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusTxt: {
    fontSize: 11,
    fontWeight: "800",
  },
  heroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipTxt: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardInner: {
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metaIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  metaBody: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  metaValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  metaSub: {
    fontSize: 12,
    fontWeight: "500",
  },
  creditTxt: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  itemsHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemsCount: {
    fontSize: 13,
    fontWeight: "700",
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  thumbPh: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBadge: {
    position: "absolute",
    right: 3,
    bottom: 3,
    minWidth: 22,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    alignItems: "center",
  },
  qtyBadgeTxt: {
    fontSize: 11,
    fontWeight: "800",
  },
  lineBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  lineName: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
  },
  lineMeta: {
    fontSize: 12,
    fontWeight: "500",
  },
  lineTotal: {
    fontSize: 14,
    fontWeight: "800",
  },
  subtotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subtotalLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  subtotalValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  notesBody: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  footer: {
    gap: 10,
    marginTop: 4,
  },
});
