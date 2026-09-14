import { displayMoney } from "@/components/atoms/formatMoney";
import { ThemedText } from "@/components/atoms/ThemedText";
import { MobileHeader, MobileScreen, SafeScreen } from "@/components/layout";
import { HeaderIconButton } from "@/components/molecules/HeaderIconButton";
import { GoalGaugeBlock } from "@/components/molecules/GoalGaugeBlock";
import { QuickAction } from "@/components/molecules/QuickAction";
import { RecentSalesBlock } from "@/components/molecules/RecentSalesBlock";
import { SalesDailyBlock } from "@/components/molecules/SalesDailyBlock";
import { StatCard } from "@/components/molecules/StatCard";
import { TopSuppliersBlock } from "@/components/molecules/TopSuppliersBlock";
import { useAuth } from "@/context/AuthContext";
import { useSalesListScreen } from "@/hooks/screens/useSalesListScreen";
import { useHomeValuesHidden } from "@/hooks/useHomeValuesHidden";
import { useManualSaleSync } from "@/hooks/useManualSaleSync";
import { apiFetch } from "@/lib/api";
import {
  fetchSellerCommissionDashboard,
  sellerOfflineStaleTime,
} from "@/lib/seller-offline-queries";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { radiiPx } from "@pedidos/design-tokens";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Bell,
  ClipboardList,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { hidden: hideValues, toggleHidden } = useHomeValuesHidden();
  const {
    orders,
    isLoading,
    isRefetching,
    refetch,
    pending,
    dead,
    goQuickSale,
    goRepeatSale,
    goOfflineQueue,
  } = useSalesListScreen();

  const { data: commission, isLoading: commissionLoading } = useQuery({
    queryKey: ["seller", "commission-dashboard"],
    staleTime: sellerOfflineStaleTime,
    enabled: user?.role === "SELLER" || user?.role === "ADMIN",
    queryFn: fetchSellerCommissionDashboard,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["seller", "notifications"],
    enabled: Boolean(user),
    queryFn: () =>
      apiFetch<{ id: string; read: boolean }[]>("/seller/notifications"),
  });

  const unread = notifications.filter((n) => !n.read).length;
  const {
    syncNow,
    syncing,
    showSyncButton,
    queueCount,
  } = useManualSaleSync({
    onAfterSync: () => {
      void refetch();
    },
  });
  const firstName = user?.name?.split(" ")[0] ?? "Vendedor";
  const initials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "?";
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const todayTotal = orders
    .filter((o) => {
      const d = new Date(o.createdAt);
      const n = new Date();
      return d.toDateString() === n.toDateString() && o.status === "CONFIRMED";
    })
    .reduce((s, o) => s + Number(o.totalAmount), 0);

  const goal = commission?.goal;
  const mtd = commission?.mtd.confirmedRevenue ?? 0;
  const goalTarget = goal?.targetAmount ?? 0;
  const goalCurrent = goal?.achievedAmount ?? mtd;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthSales = orders
    .filter((o) => o.status === "CONFIRMED" && new Date(o.createdAt) >= monthStart)
    .reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const monthOrderCount = orders.filter(
    (o) => o.status === "CONFIRMED" && new Date(o.createdAt) >= monthStart,
  ).length;
  const averageTicket = monthOrderCount > 0 ? monthSales / monthOrderCount : 0;

  const goalTitle =
    goal?.scopeLabel
      ? `${goal.title} · ${goal.scopeLabel}`
      : (goal?.title ?? "Meta do mês");

  const syncA11yLabel =
    queueCount > 0
      ? `Sincronizar agora, ${queueCount} pedido${queueCount === 1 ? "" : "s"} na fila`
      : "Sincronizar agora";

  return (
    <SafeScreen variant="tab">
      <MobileHeader
        title={`Olá, ${firstName}`}
        subtitle={today}
        leftAction={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Meu perfil"
            onPress={() => router.push("/(tabs)/profile")}
            style={[
              styles.avatarBtn,
              { backgroundColor: colorWithAlpha(colors.primary, 0.15) },
            ]}
          >
            <ThemedText
              variant="caption"
              style={{ color: colors.primary, fontWeight: "700" }}
            >
              {initials}
            </ThemedText>
          </Pressable>
        }
        rightAction={
          <View style={styles.headerActions}>
            <HeaderIconButton
              accessibilityLabel={
                hideValues
                  ? "Mostrar valores monetários"
                  : "Ocultar valores monetários"
              }
              onPress={toggleHidden}
            >
              {hideValues ? (
                <EyeOff color={colors.text} size={20} />
              ) : (
                <Eye color={colors.text} size={20} />
              )}
            </HeaderIconButton>
            {showSyncButton ? (
              <HeaderIconButton
                badge={queueCount}
                disabled={syncing}
                accessibilityLabel={
                  syncing ? "Sincronizando pedidos" : syncA11yLabel
                }
                onPress={() => void syncNow()}
              >
                {syncing ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <RefreshCw color={colors.text} size={20} />
                )}
              </HeaderIconButton>
            ) : null}
            <HeaderIconButton
              badge={unread}
              accessibilityLabel={
                unread > 0
                  ? `Notificações, ${unread} não lida${unread === 1 ? "" : "s"}`
                  : "Notificações"
              }
              onPress={() => router.push("/(tabs)/notifications")}
            >
              <Bell color={colors.text} size={20} />
            </HeaderIconButton>
          </View>
        }
      />
      <MobileScreen
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        contentContainerStyle={{ gap: 20 }}
      >
        <View style={styles.statGrid}>
          <View style={styles.statCell}>
            <StatCard
              title="Vendas hoje"
              value={displayMoney(hideValues, todayTotal)}
              icon={DollarSign}
              compact
            />
          </View>
          <View style={styles.statCell}>
            <StatCard
              title="Pedidos"
              value={orders.length}
              icon={ShoppingCart}
              onPress={() => router.push("/(tabs)/vendas")}
              compact
            />
          </View>
          {user?.role === "SELLER" ? (
            <View style={styles.statCell}>
              <StatCard
                title="Comissão MTD"
                value={
                  commissionLoading
                    ? "…"
                    : displayMoney(
                        hideValues,
                        commission?.mtd.commissionRecorded ?? 0,
                      )
                }
                icon={TrendingUp}
                onPress={() => router.push("/(tabs)/commission")}
                compact
              />
            </View>
          ) : user?.role === "ADMIN" ? (
            <View style={styles.statCell}>
              <StatCard
                title="Ranking"
                value={
                  commissionLoading
                    ? "…"
                    : `${commission?.ranking.totalSellers ?? 0}`
                }
                icon={TrendingUp}
                onPress={() => router.push("/(tabs)/commission")}
                compact
              />
            </View>
          ) : null}
          <View style={styles.statCell}>
            <StatCard
              title="Pendentes sync"
              value={pending + dead}
              icon={Users}
              onPress={pending + dead > 0 ? goOfflineQueue : undefined}
              compact
            />
          </View>
          <View style={styles.statCell}>
            <StatCard
              title="Vendas mês"
              value={displayMoney(hideValues, monthSales)}
              icon={DollarSign}
              compact
            />
          </View>
          <View style={styles.statCell}>
            <StatCard
              title="Ticket médio"
              value={displayMoney(hideValues, averageTicket)}
              icon={TrendingUp}
              compact
            />
          </View>
        </View>

        <GoalGaugeBlock
          title={goalTitle}
          current={goalCurrent}
          target={goalTarget}
          hideValues={hideValues}
          onPress={() => router.push("/(tabs)/commission")}
        />

        <TopSuppliersBlock hideValues={hideValues} />
        <SalesDailyBlock orders={orders} hideValues={hideValues} />

        <View style={{ gap: 10 }}>
          <ThemedText variant="titleSm">Ações rápidas</ThemedText>
          {user?.role === "SELLER" ? (
            <>
              <QuickAction
                icon={Plus}
                label="Nova venda"
                description="Montar pedido com cliente e carrinho"
                variant="primary"
                onPress={goQuickSale}
              />
              <QuickAction
                icon={RotateCcw}
                label="Repetir venda"
                description="Escolher um pedido recente para pré-preencher"
                onPress={goRepeatSale}
              />
            </>
          ) : null}
          <QuickAction
            icon={Package}
            label="Catálogo"
            description="Consultar produtos e preços"
            onPress={() => router.push("/(tabs)/products")}
          />
          <QuickAction
            icon={FileText}
            label="Relatórios"
            description="Resumo, clientes e fornecedores em PDF"
            onPress={() => router.push("/(tabs)/reports")}
          />
          {user?.role === "ADMIN" ? (
            <QuickAction
              icon={Upload}
              label="Importar CSV"
              description="Produtos e clientes em lote"
              onPress={() => router.push("/(tabs)/imports")}
            />
          ) : null}
          {user?.role === "SELLER" ? (
            <QuickAction
              icon={TrendingUp}
              label="Comissão"
              description="Meta, ranking e extrato do mês"
              onPress={() => router.push("/(tabs)/commission")}
            />
          ) : user?.role === "ADMIN" ? (
            <QuickAction
              icon={TrendingUp}
              label="Ranking"
              description="Desempenho dos vendedores no mês"
              onPress={() => router.push("/(tabs)/commission")}
            />
          ) : null}
          {(pending > 0 || dead > 0) && (
            <QuickAction
              icon={ClipboardList}
              label="Fila offline"
              description={`${pending} pendente(s)${dead > 0 ? ` · ${dead} com erro` : ""}`}
              variant="warning"
              badge={pending + dead}
              onPress={goOfflineQueue}
            />
          )}
        </View>

        <RecentSalesBlock
          orders={orders}
          isLoading={isLoading}
          isRefetching={isRefetching && !isLoading}
          hideValues={hideValues}
        />
      </MobileScreen>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: radiiPx.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCell: {
    width: "48%",
  },
});
