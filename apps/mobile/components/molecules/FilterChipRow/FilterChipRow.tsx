import { GlassChip } from "@/components/atoms/GlassChip";
import {
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type ChipOption<T extends string = string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  options: ChipOption<T>[];
  /** `null` = nenhum chip selecionado (ex.: período personalizado ativo). */
  value: T | null;
  onChange: (id: T) => void;
  /** Se true, usa ScrollView horizontal; senão wrap. */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function FilterChipRow<T extends string>({
  options,
  value,
  onChange,
  scroll = true,
  style,
}: Props<T>) {
  const chips = options.map((opt) => (
    <GlassChip
      key={opt.id}
      label={opt.label}
      active={opt.id === value}
      onPress={() => onChange(opt.id)}
    />
  ));

  if (!scroll) {
    return <View style={[styles.wrap, style]}>{chips}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
