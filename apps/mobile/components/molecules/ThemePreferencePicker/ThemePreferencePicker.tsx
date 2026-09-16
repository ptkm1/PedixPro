import { FilterChipRow } from "@/components/molecules/FilterChipRow";
import { StyleSheet } from "react-native";
import { useTheme } from "../../../lib/theme";
import type { ThemePreference } from "../../../lib/theme/types";

const OPTIONS: Array<{ id: ThemePreference; label: string }> = [
  { id: "system", label: "Sistema" },
  { id: "light", label: "Claro" },
  { id: "dark", label: "Escuro" },
];

export function ThemePreferencePicker() {
  const { preference, setPreference } = useTheme();

  return (
    <FilterChipRow
      scroll={false}
      style={styles.wrap}
      options={OPTIONS}
      value={preference}
      onChange={setPreference}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
});
