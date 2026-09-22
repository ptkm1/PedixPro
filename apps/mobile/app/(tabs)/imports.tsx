import { ThemedButton } from "@/components/atoms/ThemedButton";
import { ThemedCard } from "@/components/atoms/ThemedCard";
import { ThemedText } from "@/components/atoms/ThemedText";
import { ThemedTextInput } from "@/components/atoms/ThemedTextInput";
import { GlassChip } from "@/components/atoms/GlassChip";
import { MobileHeader, MobileScreen, SafeScreen } from "@/components/layout";
import { FilterChipRow } from "@/components/molecules/FilterChipRow";
import {
    useImportsScreen,
    type ImportKind,
} from "@/hooks/screens/useImportsScreen";
import { useTheme } from "@/lib/theme";
import { radiiPx } from "@pedidos/design-tokens";
import { csvFieldLabel } from "@pedidos/shared";
import { Redirect } from "expo-router";
import { StyleSheet, View } from "react-native";

const KIND_OPTIONS: Array<{ id: ImportKind; label: string }> = [
  { id: "customers", label: "Clientes" },
  { id: "products", label: "Produtos" },
];

const NONE_COL = "__none__";

export default function ImportsScreen() {
  const { colors } = useTheme();
  const s = useImportsScreen();

  if (!s.isAdmin) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <SafeScreen variant="tab">
      <MobileHeader title="Importar CSV" subtitle="Admin" showBack />
      <MobileScreen contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <ThemedText variant="bodySm" muted>
          Qualquer CSV de concorrente: mapeie as colunas, valide e importe só as
          linhas válidas. Salve o mapa como receita para reutilizar.
        </ThemedText>

        <ThemedCard>
          <ThemedText variant="titleSm" style={{ marginBottom: 10 }}>
            Tipo
          </ThemedText>
          <FilterChipRow
            scroll={false}
            options={KIND_OPTIONS}
            value={s.kind}
            onChange={(k) => s.selectKind(k)}
          />
        </ThemedCard>

        <ThemedCard style={{ gap: 10 }}>
          <ThemedButton
            variant="outline"
            onPress={() => void s.shareTemplate()}
            disabled={s.busy}
          >
            Compartilhar modelo Pedix
          </ThemedButton>
          <ThemedButton
            variant="outline"
            onPress={() => void s.pickFile()}
            disabled={s.busy}
          >
            Selecionar arquivo
          </ThemedButton>
          {s.fileName ? (
            <ThemedText variant="bodySm" muted>
              Arquivo: {s.fileName}
              {s.headers.length
                ? ` · ${s.mappedCount}/${s.fields.length} mapeadas`
                : ""}
            </ThemedText>
          ) : null}
        </ThemedCard>

        {s.headers.length > 0 ? (
          <ThemedCard style={{ gap: 10 }}>
            <ThemedText variant="titleSm">Mapeamento</ThemedText>
            {s.recipes.length > 0 ? (
              <View style={{ gap: 6 }}>
                <ThemedText variant="caption" muted>
                  Receitas salvas
                </ThemedText>
                <View style={styles.chips}>
                  {s.recipes.map((r) => (
                    <GlassChip
                      key={r.id}
                      label={r.name}
                      onPress={() => s.applyRecipe(r)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <ThemedTextInput
              placeholder="Nome da receita (ex.: Softvar)"
              value={s.recipeName}
              onChangeText={s.setRecipeName}
            />
            <ThemedButton
              variant="outline"
              onPress={() => void s.saveRecipe()}
              disabled={s.busy}
            >
              Salvar mapa
            </ThemedButton>

            {s.fields.map((field) => {
              const current = s.columnMap[field] ?? "";
              return (
                <View key={field} style={{ gap: 6 }}>
                  <ThemedText variant="caption" style={{ fontWeight: "700" }}>
                    {csvFieldLabel(s.kind, field)}
                  </ThemedText>
                  <FilterChipRow
                    scroll={false}
                    options={[
                      { id: NONE_COL, label: "—" },
                      ...s.headers
                        .filter((h) => {
                          const active = current === h.key;
                          const taken = Object.entries(s.columnMap).some(
                            ([t, src]) => t !== field && src === h.key,
                          );
                          return active || !taken;
                        })
                        .map((h) => ({
                          id: h.key,
                          label: h.raw || h.key,
                        })),
                    ]}
                    value={current || NONE_COL}
                    onChange={(id) =>
                      s.setFieldMap(field, id === NONE_COL ? "" : id)
                    }
                  />
                </View>
              );
            })}

            <ThemedText variant="caption" muted>
              Mapeie as colunas do arquivo. Caso o código IBGE não seja
              informado, o Pedix Pro tenta identificá-lo via CEP, CNPJ ou
              município/UF.
            </ThemedText>
            <ThemedButton
              onPress={() => void s.runPreview()}
              disabled={!s.csvText || s.busy || s.mappedCount === 0}
              loading={s.previewPending}
              loadingLabel="Validando…"
            >
              Validar
            </ThemedButton>
          </ThemedCard>
        ) : null}

        {s.result ? (
          <ThemedCard style={{ gap: 8 }}>
            <ThemedText variant="titleSm">Resultado</ThemedText>
            <ThemedText variant="bodySm">
              {s.result.totalRows} linha(s) · {s.result.validCount} válida(s) ·{" "}
              {s.result.invalidCount} com erro
              {s.committed && s.result.createdCount != null
                ? ` · ${s.result.createdCount} criada(s)`
                : ""}
            </ThemedText>

            {s.kind === "customers" &&
            !s.committed &&
            s.errorFieldCounts.length > 0 ? (
              <View style={{ gap: 8 }}>
                <ThemedText variant="titleSm">Correção em massa</ThemedText>
                <ThemedText variant="caption" muted>
                  Preenche células vazias. Informe cidade+UF para o IBGE.
                </ThemedText>
                <ThemedButton
                  variant="outline"
                  onPress={s.applyAddressFallback}
                  disabled={s.busy}
                >
                  Pacote endereço mínimo
                </ThemedButton>
                {s.errorFieldCounts.map(([field, count]) => (
                  <View key={field} style={{ gap: 4 }}>
                    <ThemedText variant="caption" style={{ fontWeight: "700" }}>
                      {csvFieldLabel(s.kind, field)} ({count})
                    </ThemedText>
                    <ThemedTextInput
                      value={s.fieldDefaults[field] ?? ""}
                      onChangeText={(t) => s.setDefaultField(field, t)}
                      placeholder={`Padrão para ${field}`}
                    />
                  </View>
                ))}
                <ThemedButton
                  onPress={() => void s.runPreview()}
                  disabled={s.busy}
                  loading={s.previewPending}
                  loadingLabel="Revalidando…"
                >
                  Revalidar com correções
                </ThemedButton>
              </View>
            ) : null}

            {s.errorRows.length > 0 ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                {s.errorRows.slice(0, 40).map((row) => (
                  <View
                    key={row.line}
                    style={[
                      styles.errorRow,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surfaceMuted,
                      },
                    ]}
                  >
                    <ThemedText variant="caption" style={{ fontWeight: "700" }}>
                      Linha {row.line}
                    </ThemedText>
                    {row.errors.map((err, i) => (
                      <ThemedText
                        key={`${err.field}-${i}`}
                        variant="caption"
                        muted
                      >
                        {err.field !== "_" ? `${err.field}: ` : ""}
                        {err.message}
                      </ThemedText>
                    ))}
                  </View>
                ))}
                {s.errorRows.length > 40 ? (
                  <ThemedText variant="caption" muted>
                    … e mais {s.errorRows.length - 40} linha(s) com erro
                  </ThemedText>
                ) : null}
              </View>
            ) : (
              <ThemedText variant="bodySm" muted>
                Todas as linhas estão válidas.
              </ThemedText>
            )}

            <ThemedButton
              style={{ marginTop: 8 }}
              onPress={() => void s.runCommit()}
              disabled={
                s.busy ||
                s.committed ||
                !s.result ||
                s.result.validCount === 0
              }
              loading={s.commitPending}
              loadingLabel="Importando…"
            >
              Importar {s.result.validCount} válido(s)
            </ThemedButton>
          </ThemedCard>
        ) : null}
      </MobileScreen>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  errorRow: {
    borderWidth: 1,
    borderRadius: radiiPx.md,
    padding: 10,
    gap: 2,
  },
});
