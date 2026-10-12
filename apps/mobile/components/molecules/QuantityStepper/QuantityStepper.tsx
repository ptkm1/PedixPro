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
  /** Máximo opcional (ex.: estoque). Validação comercial continua no caller. */
  max?: number;
  disabled?: boolean;
  /** Versão compacta para tiles do catálogo. */
  compact?: boolean;
  /** Ocupa 100% da largura do pai (input cresce no meio). */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Stepper de quantidade com +/- e input digitável (teclado numérico).
 * Enquanto o campo está focado, a digitação fica em rascunho e só confirma
 * no blur / submit — assim dá para digitar 120 sem passar por 1/12 unidades.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max,
  disabled = false,
  compact = false,
  fullWidth = false,
  style,
}: QuantityStepperProps) {
  const { colors, isDark } = useTheme();
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  /** Fundo suave na cor da marca (primaryMuted no light é cinza genérico). */
  const shellBg = isDark ? colors.primaryMuted : `${colors.primary}14`;
  const shellBorder = isDark ? colors.primary : `${colors.primary}55`;

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const clamp = (n: number) => {
    let next = Math.max(min, n);
    if (typeof max === "number" && Number.isFinite(max)) {
      next = Math.min(next, max);
    }
    return next;
  };

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
    const next = clamp(n);
    if (next !== value) onChange(next);
    setDraft(String(next));
  };

  const atMin = disabled || value <= min;
  const atMax =
    disabled ||
    (typeof max === "number" && Number.isFinite(max) && value >= max);

  const shellH = compact ? 34 : 40;
  const btnSize = compact ? 24 : 32;
  const inputW = compact ? 40 : 48;
  const iconSize = compact ? 15 : 18;
  const fontSize = compact ? 15 : 17;
  const shellRadius = shellH / 2;
  const btnRadius = btnSize / 2;

  return (
    <View
      style={[
        styles.shell,
        compact && styles.shellCompact,
        fullWidth && styles.shellFull,
        {
          height: shellH,
          borderRadius: shellRadius,
          backgroundColor: shellBg,
          borderColor: shellBorder,
        },
        disabled && styles.shellDisabled,
        style,
      ]}
      accessibilityRole="adjustable"
      accessibilityLabel={`Quantidade ${value}`}
    >
      <Pressable
        hitSlop={compact ? 4 : 6}
        disabled={atMin}
        style={[
          styles.btn,
          {
            width: btnSize,
            height: btnSize,
            borderRadius: btnRadius,
            backgroundColor: colors.card,
            opacity: atMin ? 0.35 : 1,
          },
        ]}
        onPress={() => onChange(clamp(value - 1))}
        accessibilityLabel="Diminuir quantidade"
      >
        <Minus size={iconSize} color={colors.primary} strokeWidth={2.75} />
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
          fullWidth ? styles.inputFull : null,
          {
            ...(fullWidth ? {} : { width: inputW }),
            height: btnSize,
            fontSize,
            color: colors.primary,
            opacity: disabled ? 0.45 : 1,
          },
        ]}
        accessibilityLabel="Quantidade"
      />

      <Pressable
        hitSlop={compact ? 4 : 6}
        disabled={atMax}
        style={[
          styles.btn,
          {
            width: btnSize,
            height: btnSize,
            borderRadius: btnRadius,
            backgroundColor: colors.primary,
            opacity: atMax ? 0.35 : 1,
          },
        ]}
        onPress={() => onChange(clamp(value + 1))}
        accessibilityLabel="Aumentar quantidade"
      >
        <Plus
          size={iconSize}
          color={colors.primaryForeground}
          strokeWidth={2.75}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    flexShrink: 0,
    gap: 2,
    paddingHorizontal: 3,
    borderWidth: 1.5,
  },
  shellCompact: {
    gap: 1,
    paddingHorizontal: 2.5,
  },
  shellFull: {
    alignSelf: "stretch",
    width: "100%",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  shellDisabled: {
    opacity: 0.55,
  },
  btn: {
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 0,
    flexShrink: 0,
  },
  input: {
    textAlign: "center",
    fontWeight: "800",
    letterSpacing: 0.2,
    paddingHorizontal: 2,
    paddingVertical: 0,
    flexGrow: 0,
    flexShrink: 0,
  },
  inputFull: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 36,
    width: undefined,
  },
});