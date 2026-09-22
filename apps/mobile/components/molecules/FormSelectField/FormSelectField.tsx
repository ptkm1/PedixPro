import { ThemedText } from "@/components/atoms/ThemedText";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useTheme } from "@/lib/theme";
import { radiiPx } from "@pedidos/design-tokens";
import { useMemo, useState } from "react";
import {
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Option = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  required?: boolean;
};

export function FormSelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = "Selecione",
  error,
  required,
}: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const s = debouncedQ.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s));
  }, [options, debouncedQ]);

  return (
    <View style={{ gap: 6 }}>
      <ThemedText variant="caption" muted>
        {label}
        {required ? " *" : ""}
      </ThemedText>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          {
            backgroundColor: disabled
              ? colors.surfaceMuted
              : colors.inputBackground,
            borderColor: error ? colors.danger : colors.inputBorder,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        <ThemedText
          variant="bodySm"
          style={{ color: selected ? colors.text : colors.placeholder }}
        >
          {selected?.label ?? placeholder}
        </ThemedText>
      </Pressable>
      {error ? (
        <ThemedText variant="caption" style={{ color: colors.danger }}>
          {error}
        </ThemedText>
      ) : null}

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <SafeAreaView
          style={[styles.modal, { backgroundColor: colors.background }]}
          edges={["top", "bottom", "left", "right"]}
        >
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <ThemedText variant="titleSm" style={{ marginBottom: 12 }}>
              {label}
            </ThemedText>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Buscar…"
              placeholderTextColor={colors.placeholder}
              style={[
                styles.search,
                {
                  color: colors.inputText,
                  borderColor: colors.inputBorder,
                  backgroundColor: colors.inputBackground,
                },
              ]}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              style={{ marginTop: 12, flex: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                    setQ("");
                  }}
                  style={[
                    styles.option,
                    {
                      backgroundColor:
                        item.value === value ? colors.chipActive : colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <ThemedText
                    variant="bodySm"
                    style={{
                      color:
                        item.value === value
                          ? colors.chipTextActive
                          : colors.text,
                    }}
                  >
                    {item.label}
                  </ThemedText>
                </Pressable>
              )}
            />
            <Pressable onPress={() => setOpen(false)} style={{ marginTop: 16 }}>
              <ThemedText
                variant="body"
                style={{ color: colors.primary, textAlign: "center" }}
              >
                Fechar
              </ThemedText>
            </Pressable>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderRadius: radiiPx.md,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  modal: { flex: 1, padding: 20 },
  search: {
    borderWidth: 1,
    borderRadius: radiiPx.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  option: {
    borderWidth: 1,
    borderRadius: radiiPx.md,
    padding: 12,
    marginBottom: 8,
  },
});
