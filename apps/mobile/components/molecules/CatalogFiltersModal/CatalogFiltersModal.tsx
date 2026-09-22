import { ThemedButton } from "@/components/atoms/ThemedButton";
import { ThemedText } from "@/components/atoms/ThemedText";
import { ThemedTextInput } from "@/components/atoms/ThemedTextInput";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useTheme } from "@/lib/theme";
import { Check, ChevronDown, ChevronUp, Circle, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type FilterChip = { id: string; name: string };
type CustomerChip = { id: string; name: string };

export type CatalogFiltersApplyPayload = {
  categoryIds: string[];
  supplierIds: string[];
  customerId?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  categories: FilterChip[];
  selectedCategoryIds: string[];
  suppliers?: FilterChip[];
  selectedSupplierIds?: string[];
  onApply: (payload: CatalogFiltersApplyPayload) => void;
  /** Quando omitido, a secção Clientes não aparece (ex. aba Produtos). */
  customers?: CustomerChip[];
  selectedCustomerId?: string;
  lastCustomer?: CustomerChip | null;
};

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={styles.optionRow}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View
        style={[
          styles.radioOuter,
          {
            borderColor: selected ? colors.primary : colors.border,
          },
        ]}
      >
        {selected ? (
          <View
            style={[styles.radioInner, { backgroundColor: colors.primary }]}
          />
        ) : (
          <Circle size={10} color="transparent" />
        )}
      </View>
      <ThemedText variant="bodySm" style={styles.optionLabel} numberOfLines={2}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function CheckboxRow({
  label,
  checked,
  disabled,
  onPress,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={[styles.optionRow, disabled && styles.optionDisabled]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
    >
      <View
        style={[
          styles.checkBox,
          {
            borderColor: checked ? colors.primary : colors.border,
            backgroundColor: checked ? colors.primary : "transparent",
          },
        ]}
      >
        {checked ? (
          <Check size={14} color={colors.primaryForeground} strokeWidth={3} />
        ) : null}
      </View>
      <ThemedText variant="bodySm" style={styles.optionLabel} numberOfLines={2}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function CatalogFiltersModal({
  visible,
  onClose,
  categories,
  selectedCategoryIds,
  suppliers = [],
  selectedSupplierIds = [],
  onApply,
  customers,
  selectedCustomerId,
  lastCustomer,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const showCustomers = customers != null;

  const [draftCategoryIds, setDraftCategoryIds] = useState<string[]>([]);
  const [draftSupplierIds, setDraftSupplierIds] = useState<string[]>([]);
  const [draftCustomerId, setDraftCustomerId] = useState<string | undefined>();
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedCustomerSearch = useDebouncedValue(customerSearch, 300);
  const [clientsOpen, setClientsOpen] = useState(true);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [suppliersOpen, setSuppliersOpen] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setDraftCategoryIds(selectedCategoryIds);
    setDraftSupplierIds(selectedSupplierIds);
    setDraftCustomerId(selectedCustomerId);
    setCustomerSearch("");
    setClientsOpen(true);
    setCategoriesOpen(true);
    setSuppliersOpen(true);
  }, [visible, selectedCategoryIds, selectedSupplierIds, selectedCustomerId]);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const q = debouncedCustomerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, debouncedCustomerSearch]);

  const allCategoriesSelected = draftCategoryIds.length === 0;
  const allSuppliersSelected = draftSupplierIds.length === 0;

  function toggleCategory(id: string) {
    setDraftCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSupplier(id: string) {
    setDraftSupplierIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function apply() {
    onApply({
      categoryIds: draftCategoryIds,
      supplierIds: draftSupplierIds,
      ...(showCustomers ? { customerId: draftCustomerId } : {}),
    });
    onClose();
  }

  function clear() {
    setDraftCategoryIds([]);
    setDraftSupplierIds([]);
    setDraftCustomerId(undefined);
    setCustomerSearch("");
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={styles.header}>
            <ThemedText variant="titleSm">Filtros</ThemedText>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Fechar"
            >
              <X size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {showCustomers ? (
              <View style={[styles.accordion, { borderColor: colors.border }]}>
                <Pressable
                  style={styles.accordionHeader}
                  onPress={() => setClientsOpen((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: clientsOpen }}
                >
                  <ThemedText variant="body" style={styles.accordionTitle}>
                    Clientes
                  </ThemedText>
                  {clientsOpen ? (
                    <ChevronUp size={20} color={colors.textSecondary} />
                  ) : (
                    <ChevronDown size={20} color={colors.textSecondary} />
                  )}
                </Pressable>
                {clientsOpen ? (
                  <View style={styles.accordionBody}>
                    <ThemedTextInput
                      placeholder="Buscar por nome do cliente…"
                      value={customerSearch}
                      onChangeText={setCustomerSearch}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                    <RadioRow
                      label="Consumidor avulso"
                      selected={draftCustomerId === undefined}
                      onPress={() => setDraftCustomerId(undefined)}
                    />
                    {lastCustomer ? (
                      <RadioRow
                        label={`Último: ${lastCustomer.name}`}
                        selected={draftCustomerId === lastCustomer.id}
                        onPress={() => setDraftCustomerId(lastCustomer.id)}
                      />
                    ) : null}
                    {filteredCustomers
                      .filter((c) => c.id !== lastCustomer?.id)
                      .map((c) => (
                        <RadioRow
                          key={c.id}
                          label={c.name}
                          selected={draftCustomerId === c.id}
                          onPress={() => setDraftCustomerId(c.id)}
                        />
                      ))}
                    {filteredCustomers.filter((c) => c.id !== lastCustomer?.id)
                      .length === 0 && debouncedCustomerSearch.trim() ? (
                      <ThemedText variant="bodySm" muted>
                        Nenhum cliente encontrado.
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={[styles.accordion, { borderColor: colors.border }]}>
              <Pressable
                style={styles.accordionHeader}
                onPress={() => setCategoriesOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: categoriesOpen }}
              >
                <ThemedText variant="body" style={styles.accordionTitle}>
                  Categorias
                </ThemedText>
                {categoriesOpen ? (
                  <ChevronUp size={20} color={colors.textSecondary} />
                ) : (
                  <ChevronDown size={20} color={colors.textSecondary} />
                )}
              </Pressable>
              {categoriesOpen ? (
                <View style={styles.accordionBody}>
                  {categories.length === 0 ? (
                    <ThemedText variant="bodySm" muted>
                      Nenhuma categoria disponível.
                    </ThemedText>
                  ) : (
                    <>
                      <CheckboxRow
                        label="Todas"
                        checked={allCategoriesSelected}
                        disabled={allCategoriesSelected}
                        onPress={() => setDraftCategoryIds([])}
                      />
                      {categories.map((c) => (
                        <CheckboxRow
                          key={c.id}
                          label={c.name}
                          checked={draftCategoryIds.includes(c.id)}
                          onPress={() => toggleCategory(c.id)}
                        />
                      ))}
                    </>
                  )}
                </View>
              ) : null}
            </View>

            <View style={[styles.accordion, { borderColor: colors.border }]}>
              <Pressable
                style={styles.accordionHeader}
                onPress={() => setSuppliersOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: suppliersOpen }}
              >
                <ThemedText variant="body" style={styles.accordionTitle}>
                  Fornecedor
                </ThemedText>
                {suppliersOpen ? (
                  <ChevronUp size={20} color={colors.textSecondary} />
                ) : (
                  <ChevronDown size={20} color={colors.textSecondary} />
                )}
              </Pressable>
              {suppliersOpen ? (
                <View style={styles.accordionBody}>
                  {suppliers.length === 0 ? (
                    <ThemedText variant="bodySm" muted>
                      Nenhum fornecedor disponível.
                    </ThemedText>
                  ) : (
                    <>
                      <CheckboxRow
                        label="Todos"
                        checked={allSuppliersSelected}
                        disabled={allSuppliersSelected}
                        onPress={() => setDraftSupplierIds([])}
                      />
                      {suppliers.map((s) => (
                        <CheckboxRow
                          key={s.id}
                          label={s.name}
                          checked={draftSupplierIds.includes(s.id)}
                          onPress={() => toggleSupplier(s.id)}
                        />
                      ))}
                    </>
                  )}
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <ThemedButton
              variant="secondary"
              style={styles.flex}
              onPress={clear}
            >
              Limpar
            </ThemedButton>
            <ThemedButton style={styles.flex} onPress={apply}>
              Aplicar
            </ThemedButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdropTap: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: "80%",
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 8, gap: 8 },
  accordion: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  accordionTitle: { fontWeight: "700" },
  accordionBody: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  optionDisabled: { opacity: 0.55 },
  optionLabel: { flex: 1 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: 12 },
  flex: { flex: 1 },
});
