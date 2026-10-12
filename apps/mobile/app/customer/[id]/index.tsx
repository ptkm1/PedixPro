import { ThemedButton } from "@/components/atoms/ThemedButton";
import { ThemedCard } from "@/components/atoms/ThemedCard";
import { ThemedText } from "@/components/atoms/ThemedText";
import { MobileHeader, MobileScreen, SafeScreen } from "@/components/layout";
import { DeliveryRecipientCard } from "@/components/molecules/DeliveryRecipientCard";
import { QuickAction } from "@/components/molecules/QuickAction";
import {
    fetchSellerCustomer,
    sellerOfflineStaleTime,
} from "@/lib/seller-offline-queries";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { radiiPx } from "@pedidos/design-tokens";
import type { CustomerRecord } from "@pedidos/shared";
import {
    formatCnpjMask,
    formatCpfMask,
    isStateRegistrationUnavailable,
} from "@pedidos/shared";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    CreditCard,
    Mail,
    Pencil,
    Phone,
    ShoppingCart,
    User,
} from "lucide-react-native";
import type { ReactNode } from "react";
import {
    ActivityIndicator,
    Linking,
    Pressable,
    StyleSheet,
    View,
} from "react-native";

function formatDoc(c: CustomerRecord): string {
  if (c.cnpj) return formatCnpjMask(c.cnpj);
  if (c.cpf) return formatCpfMask(c.cpf);
  return "—";
}

function docLabel(c: CustomerRecord): string {
  if (c.cnpj) return "CNPJ";
  if (c.cpf) return "CPF";
  return "Documento";
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function InfoRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.infoRow}>
      <ThemedText variant="caption" muted>
        {label}
      </ThemedText>
      <ThemedText
        variant="bodySm"
        style={{
          marginTop: 2,
          fontWeight: "500",
          color: onPress ? colors.primary : colors.text,
        }}
      >
        {value}
      </ThemedText>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User;
  title: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <ThemedCard style={styles.section}>
      <View style={styles.sectionHeader}>
        <View
          style={[
            styles.sectionIcon,
            { backgroundColor: colorWithAlpha(colors.primary, 0.12) },
          ]}
        >
          <Icon size={16} color={colors.primary} />
        </View>
        <ThemedText variant="label" style={{ fontWeight: "700" }}>
          {title}
        </ThemedText>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </ThemedCard>
  );
}

export default function CustomerHubScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const {
    data: customer,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["seller", "customer", id],
    staleTime: sellerOfflineStaleTime,
    queryFn: () => fetchSellerCustomer(id!),
    enabled: !!id,
  });

  const ie =
    customer?.stateRegistration?.trim() &&
    !isStateRegistrationUnavailable(customer.stateRegistration)
      ? customer.stateRegistration.trim()
      : null;

  return (
    <SafeScreen>
      <MobileHeader
        title={customer?.name ?? "Cliente"}
        subtitle="Ficha do cliente"
        showBack
      />
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !customer ? (
        <View style={styles.centered}>
          <ThemedText variant="bodySm" muted style={{ textAlign: "center" }}>
            {isError
              ? error instanceof Error
                ? error.message
                : "Não foi possível carregar o cliente."
              : "Cliente não encontrado no cache. Liga a internet uma vez para sincronizar."}
          </ThemedText>
        </View>
      ) : (
        <MobileScreen
          scroll
          noBottomInset
          contentContainerStyle={styles.content}
        >
          <View style={styles.hero}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: colorWithAlpha(colors.primary, 0.18) },
              ]}
            >
              <ThemedText
                variant="title"
                style={{ color: colors.primary, fontWeight: "800" }}
              >
                {initials(customer.name)}
              </ThemedText>
            </View>
            <View style={styles.heroText}>
              <ThemedText variant="titleSm" style={{ fontWeight: "700" }}>
                {customer.name}
              </ThemedText>
              {customer.tradeName && customer.tradeName !== customer.name ? (
                <ThemedText variant="bodySm" muted numberOfLines={1}>
                  {customer.tradeName}
                </ThemedText>
              ) : null}
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <ThemedText variant="caption" style={{ fontWeight: "700" }}>
                    {docLabel(customer)} · {formatDoc(customer)}
                  </ThemedText>
                </View>
                {customer.approvalStatus === "PENDING" ? (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: colorWithAlpha(colors.warning, 0.15),
                        borderColor: colorWithAlpha(colors.warning, 0.4),
                      },
                    ]}
                  >
                    <ThemedText
                      variant="caption"
                      style={{ color: colors.warning, fontWeight: "700" }}
                    >
                      Aguardando validação
                    </ThemedText>
                  </View>
                ) : null}
                {customer.approvalStatus === "REJECTED" ? (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: colorWithAlpha(colors.danger, 0.12),
                        borderColor: colorWithAlpha(colors.danger, 0.35),
                      },
                    ]}
                  >
                    <ThemedText
                      variant="caption"
                      style={{ color: colors.danger, fontWeight: "700" }}
                    >
                      Cadastro rejeitado
                    </ThemedText>
                  </View>
                ) : null}
                {customer.creditBlocked ? (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: colorWithAlpha(colors.danger, 0.12),
                        borderColor: colorWithAlpha(colors.danger, 0.35),
                      },
                    ]}
                  >
                    <ThemedText
                      variant="caption"
                      style={{ color: colors.danger, fontWeight: "700" }}
                    >
                      Crédito bloqueado
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {customer.approvalStatus === "PENDING" ||
          customer.approvalStatus === "REJECTED" ? (
            <ThemedText
              variant="bodySm"
              muted
              style={{ textAlign: "center", marginBottom: 8 }}
            >
              {customer.approvalStatus === "PENDING"
                ? "Aguardando validação do escritório — vendas indisponíveis."
                : "Cadastro rejeitado — vendas indisponíveis."}
            </ThemedText>
          ) : (
            <ThemedButton
              size="lg"
              style={styles.primaryBtn}
              onPress={() =>
                router.push({
                  pathname: "/quick-sale",
                  params: { customerId: id },
                })
              }
            >
              <View style={styles.btnInner}>
                <ShoppingCart size={18} color={colors.primaryForeground} />
                <ThemedText
                  variant="body"
                  style={{
                    color: colors.primaryForeground,
                    fontWeight: "700",
                  }}
                >
                  Fazer pedido
                </ThemedText>
              </View>
            </ThemedButton>
          )}

          <View style={styles.actions}>
            <QuickAction
              icon={Pencil}
              label="Editar cadastro"
              description="Documento, endereço e contato"
              onPress={() =>
                router.push({
                  pathname: "/customer/form",
                  params: { customerId: String(id) },
                })
              }
            />
            <QuickAction
              icon={CreditCard}
              label="Crédito e títulos"
              description={
                customer.creditBlocked
                  ? "Ver bloqueios e títulos em aberto"
                  : "Limite, saldo e títulos"
              }
              variant={customer.creditBlocked ? "warning" : "default"}
              onPress={() => router.push(`/customer/${id}/credit`)}
            />
          </View>

          {(customer.phone || customer.email || customer.buyerName) && (
            <Section icon={Phone} title="Contato">
              {customer.phone ? (
                <InfoRow
                  label="Telefone"
                  value={customer.phone}
                  onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
                />
              ) : null}
              {customer.email ? (
                <InfoRow
                  label="E-mail"
                  value={customer.email}
                  onPress={() =>
                    void Linking.openURL(`mailto:${customer.email}`)
                  }
                />
              ) : null}
              {customer.buyerName ? (
                <InfoRow label="Comprador" value={customer.buyerName} />
              ) : null}
            </Section>
          )}

          <View style={styles.addressBlock}>
            <DeliveryRecipientCard
              customer={customer}
              sectionTitle="Endereço"
            />
            {customer.addressNote?.trim() ? (
              <ThemedText variant="bodySm" muted style={styles.addressNote}>
                Complemento: {customer.addressNote.trim()}
              </ThemedText>
            ) : null}
          </View>

          <Section icon={User} title="Cadastro">
            <InfoRow label={docLabel(customer)} value={formatDoc(customer)} />
            {customer.legalName ? (
              <InfoRow label="Razão social" value={customer.legalName} />
            ) : null}
            {ie ? (
              <InfoRow label="Inscrição estadual" value={ie} />
            ) : customer.stateRegistration &&
              isStateRegistrationUnavailable(customer.stateRegistration) ? (
              <InfoRow label="Inscrição estadual" value="Não informada" />
            ) : null}
            {customer.notes ? (
              <InfoRow label="Observações" value={customer.notes} />
            ) : null}
          </Section>

          {(customer.email || customer.phone) && (
            <View style={styles.quickLinks}>
              {customer.phone ? (
                <ThemedButton
                  variant="outline"
                  style={styles.flex}
                  onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
                >
                  <View style={styles.btnInner}>
                    <Phone size={16} color={colors.primary} />
                    <ThemedText
                      variant="bodySm"
                      style={{ color: colors.primary, fontWeight: "600" }}
                    >
                      Ligar
                    </ThemedText>
                  </View>
                </ThemedButton>
              ) : null}
              {customer.email ? (
                <ThemedButton
                  variant="outline"
                  style={styles.flex}
                  onPress={() =>
                    void Linking.openURL(`mailto:${customer.email}`)
                  }
                >
                  <View style={styles.btnInner}>
                    <Mail size={16} color={colors.primary} />
                    <ThemedText
                      variant="bodySm"
                      style={{ color: colors.primary, fontWeight: "600" }}
                    >
                      E-mail
                    </ThemedText>
                  </View>
                </ThemedButton>
              ) : null}
            </View>
          )}
        </MobileScreen>
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { gap: 14, paddingBottom: 32 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radiiPx.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1, minWidth: 0, gap: 4 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  primaryBtn: { minHeight: 52 },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actions: { gap: 10 },
  section: { gap: 12 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionBody: { gap: 12 },
  infoRow: { gap: 0 },
  quickLinks: { flexDirection: "row", gap: 10, marginTop: 4 },
  flex: { flex: 1 },
  addressBlock: { gap: 8 },
  addressNote: { paddingHorizontal: 2 },
});
