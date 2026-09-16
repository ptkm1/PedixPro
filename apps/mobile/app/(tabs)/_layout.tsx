import { SafeScreen, TabBarIcon } from "@/components/layout";
import { useAuth } from "@/context/AuthContext";
import type { EventArg, NavigationState } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import { Redirect, Tabs, useRouter } from "expo-router";
import {
    ClipboardCheck,
    LayoutDashboard,
    MapPin,
    ShoppingBag,
    Users,
} from "lucide-react-native";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../lib/theme";
import { colorWithAlpha } from "../../lib/theme/colorAlpha";

const TAB_BAR_HEIGHT = Platform.select({ ios: 84, android: 64 }) ?? 64;

function tabBarHeight(bottomInset: number) {
  return (
    TAB_BAR_HEIGHT +
    Math.max(bottomInset - (Platform.OS === "ios" ? 20 : 0), 0)
  );
}

function QuickSaleFab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const bottom = tabBarHeight(insets.bottom) + 2;
  const glassTint = colorWithAlpha(
    colors.primary,
    isDark ? 0.22 : 0.28,
  );
  const rim = colorWithAlpha(isDark ? "#a5e8ff" : colors.primary, 0.45);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nova venda"
      style={[
        fabStyles.wrap,
        {
          bottom,
          borderColor: rim,
          shadowColor: colors.primary,
          backgroundColor:
            Platform.OS === "android"
              ? colorWithAlpha(isDark ? "#0d2438" : "#e8f9ff", 0.72)
              : "transparent",
        },
      ]}
      onPress={() => router.push("/quick-sale")}
    >
      <BlurView
        intensity={Platform.OS === "ios" ? 48 : 36}
        tint={isDark ? "dark" : "light"}
        blurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={StyleSheet.absoluteFillObject}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: glassTint }]}
      />
      <View
        pointerEvents="none"
        style={[
          fabStyles.topEdge,
          { backgroundColor: colorWithAlpha("#ffffff", isDark ? 0.35 : 0.55) },
        ]}
      />
      <View style={fabStyles.content}>
        <ClipboardCheck color={colors.primary} size={22} strokeWidth={2.5} />
        <Text style={[fabStyles.label, { color: colors.primary }]}>Nova venda</Text>
      </View>
    </Pressable>
  );
}

function tabIcon(Icon: typeof ShoppingBag) {
  return ({
    color,
    focused,
  }: {
    color: string;
    focused: boolean;
    size: number;
  }) => <TabBarIcon Icon={Icon} color={color} focused={focused} />;
}

/**
 * Segundo toque na tab já focada: volta ao ecrã raiz dessa stack
 * (ex. detalhe de venda → lista de vendas).
 */
function tabPressPopToRoot(tabName: string, rootScreen = "index") {
  return ({
    navigation,
    route,
  }: {
    navigation: { navigate: (name: string, params?: object) => void };
    route: { state?: NavigationState; name: string };
  }) => ({
    tabPress: (e: EventArg<"tabPress", true, undefined>) => {
      const nested = route.state;
      if (nested && typeof nested.index === "number" && nested.index > 0) {
        e.preventDefault();
        const root = nested.routes[0];
        navigation.navigate(tabName, {
          screen: root?.name ?? rootScreen,
        });
      }
    },
  });
}

/** Rotas fora da tab bar — acessíveis pela home, header ou perfil. */
const HIDDEN_TAB = { href: null } as const;

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <SafeScreen style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </SafeScreen>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  const tabHeight = tabBarHeight(insets.bottom);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.iconMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
            marginTop: 2,
          },
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.tabBarBorder,
            borderTopWidth: 1,
            height: tabHeight,
            paddingTop: 8,
            paddingBottom: Math.max(
              insets.bottom,
              Platform.OS === "ios" ? 20 : 8,
            ),
            elevation: 0,
            shadowOpacity: 0,
          },
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Início",
            tabBarLabel: "Início",
            tabBarIcon: tabIcon(LayoutDashboard),
          }}
          listeners={tabPressPopToRoot("index")}
        />
        <Tabs.Screen
          name="vendas"
          options={{
            title: "Vendas",
            tabBarLabel: "Vendas",
            tabBarIcon: tabIcon(ShoppingBag),
          }}
          listeners={tabPressPopToRoot("vendas")}
        />
        <Tabs.Screen
          name="customers"
          options={{
            title: "Clientes",
            tabBarLabel: "Clientes",
            tabBarIcon: tabIcon(Users),
          }}
          listeners={tabPressPopToRoot("customers")}
        />
        <Tabs.Screen
          name="route-plan"
          options={{
            title: "Rota",
            tabBarLabel: "Rota",
            tabBarIcon: tabIcon(MapPin),
          }}
          listeners={tabPressPopToRoot("route-plan")}
        />

        <Tabs.Screen name="commission" options={HIDDEN_TAB} />
        <Tabs.Screen name="products" options={HIDDEN_TAB} />
        <Tabs.Screen name="notifications" options={HIDDEN_TAB} />
        <Tabs.Screen name="profile" options={HIDDEN_TAB} />
        <Tabs.Screen name="reports" options={HIDDEN_TAB} />
        <Tabs.Screen name="imports" options={HIDDEN_TAB} />
      </Tabs>
      {user.role === "SELLER" ? <QuickSaleFab /> : null}
    </View>
  );
}

const fabStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 18,
    height: 54,
    borderRadius: 27,
    paddingHorizontal: 18,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    zIndex: 50,
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  content: {
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontWeight: "700",
    fontSize: 14,
  },
});
