import { FilterChipRow } from "@/components/molecules/FilterChipRow";
import { ThemedText } from "@/components/atoms/ThemedText";
import { StyleSheet, View } from "react-native";

type CategoryChip = { id: string; name: string };

const ALL_ID = "__all__";

export function CategoryFilterBar(props: {
  categories: CategoryChip[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  /** Mantido por compat; o visual vem do GlassChip. */
  chipActiveBackgroundColor?: string;
}) {
  const { categories, selectedCategoryId, onSelectCategory } = props;

  if (categories.length === 0) return null;

  const options = [
    { id: ALL_ID, label: "Todas" },
    ...categories.map((c) => ({ id: c.id, label: c.name })),
  ];

  return (
    <View style={styles.wrap}>
      <ThemedText variant="caption" muted style={styles.title}>
        Categorias
      </ThemedText>
      <FilterChipRow
        options={options}
        value={selectedCategoryId ?? ALL_ID}
        onChange={(id) =>
          onSelectCategory(id === ALL_ID ? null : id)
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, marginBottom: 4 },
  title: { fontWeight: "700", marginBottom: 8 },
});
