import { ThemedButton } from "@/components/atoms/ThemedButton";
import { ThemedText } from "@/components/atoms/ThemedText";
import { ThemedTextInput } from "@/components/atoms/ThemedTextInput";
import {
    KeyboardAvoidingScreen,
    MobileHeader,
    SafeScreen,
} from "@/components/layout";
import { MOBILE_TAB_SCROLL_BOTTOM } from "@/components/layout/MobileScreen";
import { ClienteCard } from "@/components/molecules/QuickAction";
import { useCustomersScreen } from "@/hooks/screens/useCustomersScreen";
import { useTheme } from "@/lib/theme";
import {
    type CustomerRecord,
    formatCnpjMask,
    formatCpfMask,
    formatStructuredAddress,
} from "@pedidos/shared";
import { Search, UserPlus } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, SectionList, StyleSheet, View } from "react-native";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type CustomerSection = { title: string; data: CustomerRecord[] };

function customerInitial(name: string): string {
  const first = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

function customerSubtitle(item: {
  city?: string | null;
  state?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  cep?: string | null;
  addressNote?: string | null;
  email?: string | null;
  phone?: string | null;
  cnpj?: string | null;
  cpf?: string | null;
}): string {
  const place =
    formatStructuredAddress(item) ??
    ([item.city, item.state].filter(Boolean).join("/") || null);
  const doc = item.cnpj
    ? formatCnpjMask(item.cnpj)
    : item.cpf
      ? formatCpfMask(item.cpf)
      : null;
  if (place && doc) return `${place} · ${doc}`;
  return place ?? doc ?? item.phone ?? item.email ?? "Sem dados de contato";
}

export default function CustomersScreen() {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const {
    customers,
    isLoading,
    isRefetching,
    refetch,
    openCustomer,
    openNewCustomer,
  } = useCustomersScreen();

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.includes(q) ?? false) ||
        (c.city?.toLowerCase().includes(q) ?? false) ||
        (c.cnpj?.includes(q) ?? false) ||
        (c.cpf?.includes(q) ?? false),
    );
  }, [customers, debouncedSearch]);

  const sections = useMemo<CustomerSection[]>(() => {
    const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
    const grouped = new Map<string, CustomerRecord[]>();
    for (const customer of filtered) {
      const title = customerInitial(customer.name);
      const group = grouped.get(title) ?? [];
      group.push(customer);
      grouped.set(title, group);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([title, data]) => ({
        title,
        data: data.sort((a, b) => collator.compare(a.name, b.name)),
      }));
  }, [filtered]);

  const listHeader = (
    <View style={styles.header}>
      <View
        style={[
          styles.searchRow,
          {
            backgroundColor: colors.searchBackground,
            borderColor: colors.inputBorder,
          },
        ]}
      >
        <Search size={20} color={colors.iconMuted} style={{ marginRight: 8 }} />
        <ThemedTextInput
          style={styles.searchInput}
          placeholder="Buscar por nome, documento, cidade…"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ThemedButton onPress={openNewCustomer} style={styles.newBtn}>
        <View style={styles.newBtnInner}>
          <UserPlus color={colors.primaryForeground} size={18} />
          <ThemedText
            style={{ color: colors.primaryForeground, fontWeight: "700" }}
          >
            Novo cliente
          </ThemedText>
        </View>
      </ThemedButton>
    </View>
  );

  return (
    <SafeScreen variant="tab">
      <MobileHeader
        title="Clientes"
        subtitle={`${customers.length} cadastrado${customers.length === 1 ? "" : "s"}`}
      />
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <KeyboardAvoidingScreen>
          <SectionList
            sections={sections}
            keyExtractor={(c) => c.id}
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderSectionHeader={({ section }) => (
              <View
                style={[
                  styles.sectionHeader,
                  { backgroundColor: colors.background },
                ]}
              >
                <ThemedText
                  variant="caption"
                  style={{ color: colors.primary, fontWeight: "800" }}
                >
                  {section.title}
                </ThemedText>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <ThemedText variant="body" style={{ fontWeight: "600" }}>
                  {search.trim() ? "Nenhum resultado" : "Nenhum cliente ainda"}
                </ThemedText>
                <ThemedText
                  variant="bodySm"
                  muted
                  style={{ textAlign: "center", marginTop: 6 }}
                >
                  {search.trim()
                    ? "Tente outro termo de busca."
                    : "Cadastre o primeiro cliente para começar a vender."}
                </ThemedText>
              </View>
            }
            renderItem={({ item }) => {
              const approval = item.approvalStatus;
              const statusLabel =
                approval === "PENDING"
                  ? "Aguardando validação"
                  : approval === "REJECTED"
                    ? "Cadastro rejeitado"
                    : null;
              const statusTone =
                approval === "PENDING"
                  ? ("warning" as const)
                  : approval === "REJECTED"
                    ? ("danger" as const)
                    : null;
              return (
                <ClienteCard
                  nome={item.name}
                  endereco={customerSubtitle(item)}
                  inadimplente={Boolean(item.creditBlocked)}
                  statusLabel={statusLabel}
                  statusTone={statusTone}
                  onPress={() => openCustomer(item.id)}
                />
              );
            }}
          />
        </KeyboardAvoidingScreen>
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12, paddingBottom: 10 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: "transparent",
    minHeight: 48,
  },
  newBtn: { minHeight: 48 },
  newBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: MOBILE_TAB_SCROLL_BOTTOM,
    paddingTop: 10,
  },
  empty: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 24,
  },
  sectionHeader: { paddingTop: 10, paddingBottom: 6 },
});
