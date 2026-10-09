import { useTheme } from "@/lib/theme";
import { Minus, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type QuantityStepperProps = {
  value: number;
  onChange: (qty: number) => void;
  /** Mínimo aceito ao confirmar (0 = remover, se o caller tratar). Default 0. */
  min?: number;
  disabled?: boolean;
  /** Versão compacta para tiles do catálogo. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Stepper de quantidade com +/- e input digitável (teclado numérico).
 * Enquanto o campo está focado, a digitação fica em rascunho e só confirma
 * no blur / submit — assim dá para digitar 80 sem passar por 8 unidades.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  disabled = false,
  compact = false,
  style,
}: QuantityStepperProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(/\D/g, "");
    if (cleaned === "") {
      setDraft(String(value));
      return;
    }
    const n = Number.parseInt(cleaned, 10);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const next = Math.max(min, n);
    if (next !== value) onChange(next);
    setDraft(String(next));
  };

  const btnSize = compact ? 30 : 36;
  const inputMinW = compact ? 36 : 44;
  const fontSize = compact ? 14 : 16;

  return (
    <View
      style={[styles.row, style]}
      accessibilityRole="adjustable"
      accessibilityLabel={`Quantidade ${value}`}
    >
      <Pressable
        hitSlop={8}
        disabled={disabled || value <= min}
        style={[
          styles.btn,
          {
            width: btnSize,
            height: btnSize,
            backgroundColor: colors.surfaceMuted,
            opacity: disabled || value <= min ? 0.4 : 1,
          },
        ]}
        onPress={() => onChange(Math.max(min, value - 1))}
        accessibilityLabel="Diminuir quantidade"
      >
        <Minus size={compact ? 16 : 20} color={colors.text} strokeWidth={2.5} />
      </Pressable>
      <TextInput
        value={focused ? draft : String(value)}
        editable={!disabled}
        keyboardType="number-pad"
        inputMode="numeric"
        selectTextOnFocus
        returnKeyType="done"
        blurOnSubmit
        onFocus={() => {
          setFocused(true);
          setDraft(String(value));
        }}
        onChangeText={(t) => setDraft(t.replace(/\D/g, ""))}
        onBlur={() => {
          setFocused(false);
          commit(draft);
        }}
        onSubmitEditing={() => commit(draft)}
        style={[
          styles.input,
          {
            minWidth: inputMinW,
            fontSize,
            color: colors.text,
            borderColor: colors.inputBorder,
            backgroundColor: colors.inputBackground,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
        accessibilityLabel="Quantidade"
      />
      <Pressable
        hitSlop={8}
        disabled={disabled}
        style={[
          styles.btn,
          {
            width: btnSize,
            height: btnSize,
            backgroundColor: colors.surfaceMuted,
            opacity: disabled ? 0.4 : 1,
          },
        ]}
        onPress={() => onChange(value + 1)}
        accessibilityLabel="Aumentar quantidade"
      >
        <Plus size={compact ? 16 : 20} color={colors.text} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btn: {
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    textAlign: "center",
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 36,
  },
});
