import { ThemedTextInput } from "@/components/atoms/ThemedTextInput";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { fmtMoney } from "@/components/atoms/formatMoney";
import {
    DeliveryRecipientCard,
    type DeliveryRecipientCustomer,
} from "@/components/molecules/DeliveryRecipientCard";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import type { CartLine } from "@/lib/sale/types";
import {
    BadgePercent,
    CreditCard,
    FileText,
    Package,
    ShoppingBag,
    Table2,
    UserRound,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

export type OrderSummaryPanelProps = {
  customerName: string | null;
  documentLabel: string | null;
  paymentLabel: string | null;
  priceTableLabel: string | null;
  /** Cliente completo para o card de entrega (mapa + endereço). */
  deliveryCustomer?: DeliveryRecipientCustomer | null;
  lines: CartLine[];
  cartTotal: number;
  itemCount: number;
  lineTotal: (line: CartLine) => number;
  notes: string;
  onNotesChange: (value: string) => void;
  /** Banner de crédito / loading (já montado pelo caller). */
  creditSlot?: ReactNode;
};

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
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
      </View>
    </View>
  );
}

/**
 * Resumo visual do pedido na aba Finalizar: total em destaque,
 * dados do cliente e lista de itens.
 */
export function OrderSummaryPanel({
  customerName,
  documentLabel,
  paymentLabel,
  priceTableLabel,
  deliveryCustomer,
  lines,
  cartTotal,
  itemCount,
  lineTotal,
  notes,
  onNotesChange,
  creditSlot,
}: OrderSummaryPanelProps) {
  const { colors, isDark } = useTheme();
  const hasCustomer = Boolean(customerName);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: colors.primary }]}>
          Quase lá
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>
          Resumo do pedido
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Revise os dados antes de confirmar
        </Text>
      </View>

      {deliveryCustomer ? (
        <DeliveryRecipientCard customer={deliveryCustomer} />
      ) : null}

      <GlassSurface padded={false} radius={18}>
        <View style={styles.heroInner}>
          <View
            style={[
              styles.heroAccent,
              { backgroundColor: colors.primary },
            ]}
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
                  Total do pedido
                </Text>
                <Text style={[styles.heroTotal, { color: colors.primary }]}>
                  R$ {fmtMoney(cartTotal)}
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
                  {lines.length} {lines.length === 1 ? "item" : "itens"}
                </Text>
              </View>
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: colorWithAlpha(colors.success, 0.12),
                    borderColor: colorWithAlpha(colors.success, 0.28),
                  },
                ]}
              >
                <Text style={[styles.chipTxt, { color: colors.success }]}>
                  1 · Venda
                </Text>
              </View>
            </View>
          </View>
        </View>
      </GlassSurface>

      {hasCustomer ? (
        <GlassSurface contentStyle={styles.cardInner} radius={16}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Dados do pedido
          </Text>
          {!deliveryCustomer ? (
            <MetaRow
              icon={UserRound}
              label="Cliente"
              value={customerName ?? "—"}
            />
          ) : null}
          {documentLabel ? (
            <MetaRow
              icon={FileText}
              label="Documento"
              value={documentLabel}
            />
          ) : null}
          <MetaRow
            icon={CreditCard}
            label="Pagamento"
            value={paymentLabel ?? "—"}
          />
          {priceTableLabel ? (
            <MetaRow
              icon={Table2}
              label="Tabela de preços"
              value={priceTableLabel}
            />
          ) : null}
        </GlassSurface>
      ) : null}

      {creditSlot ? <View style={styles.creditSlot}>{creditSlot}</View> : null}

      <GlassSurface contentStyle={styles.cardInner} radius={16}>
        <View style={styles.itemsHead}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Itens
          </Text>
          {lines.length > 0 ? (
            <Text style={[styles.itemsCount, { color: colors.textMuted }]}>
              {lines.length}
            </Text>
          ) : null}
        </View>

        {lines.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Package size={28} color={colors.iconMuted} strokeWidth={1.8} />
            <Text style={[styles.emptyTxt, { color: colors.warning }]}>
              Nenhum produto no carrinho.
            </Text>
          </View>
        ) : (
          lines.map((line, idx) => {
            const hasDiscount = line.discountPercent > 0;
            const thumbUri = line.imageUrl?.trim() || null;
            return (
              <View
                key={line.productId}
                style={[
                  styles.lineRow,
                  idx < lines.length - 1 && {
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
                          backgroundColor: colorWithAlpha(
                            colors.primary,
                            0.1,
                          ),
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
                      {line.qty}×
                    </Text>
                  </View>
                </View>
                <View style={styles.lineBody}>
                  <Text
                    style={[styles.lineName, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {line.name}
                  </Text>
                  <Text
                    style={[styles.lineMeta, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    R$ {fmtMoney(line.effectiveUnitPrice)}
                    {hasDiscount ? ` · −${line.discountPercent}%` : ""}
                    {line.priceOriginLabel ? ` · ${line.priceOriginLabel}` : ""}
                  </Text>
                  {hasDiscount ? (
                    <View style={styles.discountTag}>
                      <BadgePercent
                        size={12}
                        color={colors.warning}
                        strokeWidth={2.4}
                      />
                      <Text
                        style={[styles.discountTxt, { color: colors.warning }]}
                      >
                        Desconto aplicado
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.lineTotal, { color: colors.success }]}>
                  R$ {fmtMoney(lineTotal(line))}
                </Text>
              </View>
            );
          })
        )}

        {lines.length > 0 ? (
          <View
            style={[
              styles.subtotalRow,
              { borderTopColor: colors.borderSubtle },
            ]}
          >
            <Text style={[styles.subtotalLabel, { color: colors.textSecondary }]}>
              Subtotal
            </Text>
            <Text style={[styles.subtotalValue, { color: colors.text }]}>
              R$ {fmtMoney(cartTotal)}
            </Text>
          </View>
        ) : null}
      </GlassSurface>

      <GlassSurface contentStyle={styles.cardInner} radius={16}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          Observação
        </Text>
        <Text style={[styles.notesHint, { color: colors.textMuted }]}>
          Opcional — aparece no pedido
        </Text>
        <ThemedTextInput
          value={notes}
          onChangeText={onNotesChange}
          placeholder="Ex.: entregar pela manhã"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          maxLength={1000}
          style={styles.notesInput}
        />
      </GlassSurface>
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
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  metaValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  creditSlot: {
    marginTop: -2,
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
  emptyWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 18,
  },
  emptyTxt: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
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
  discountTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  discountTxt: {
    fontSize: 11,
    fontWeight: "700",
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
  notesHint: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: -6,
  },
  notesInput: {
    minHeight: 88,
    paddingTop: 12,
  },
});
