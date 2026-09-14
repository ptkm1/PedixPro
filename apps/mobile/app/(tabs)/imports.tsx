import { ThemedButton } from "@/components/atoms/ThemedButton";
import { ThemedCard } from "@/components/atoms/ThemedCard";
import { ThemedText } from "@/components/atoms/ThemedText";
import { ThemedTextInput } from "@/components/atoms/ThemedTextInput";
import { MobileHeader, MobileScreen, SafeScreen } from "@/components/layout";
import {
    useImportsScreen,
    type ImportKind,
} from "@/hooks/screens/useImportsScreen";
import { useTheme } from "@/lib/theme";
import { colorWithAlpha } from "@/lib/theme/colorAlpha";
import { radiiPx } from "@pedidos/design-tokens";
import { csvFieldLabel } from "@pedidos/shared";
import { Redirect } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

const KINDS: ImportKind[] = ["customers", "products"];

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
          <View style={styles.chips}>
            {KINDS.map((k) => {
              const active = s.kind === k;
              const label = k === "products" ? "Produtos" : "Clientes";
              return (
                <Pressable
                  key={k}
                  onPress={() => s.selectKind(k)}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active
                        ? colorWithAlpha(colors.primary, 0.12)
                        : colors.surfaceMuted,
                    },
                  ]}
                >
                  <ThemedText
                    variant="caption"
                    style={{
                      fontWeight: "600",
                      color: active ? colors.primary : colors.textSecondary,
                    }}
                  >
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
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
                    <Pressable
                      key={r.id}
                      onPress={() => s.applyRecipe(r)}
                      style={[
                        styles.chip,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.surfaceMuted,
                        },
                      ]}
                    >
                      <ThemedText variant="caption" style={{ fontWeight: "600" }}>
                        {r.name}
                      </ThemedText>
                    </Pressable>
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
                  <View style={styles.chips}>
                    <Pressable
                      onPress={() => s.setFieldMap(field, "")}
                      style={[
                        styles.chip,
                        {
                          borderColor: !current
                            ? colors.primary
                            : colors.border,
                          backgroundColor: !current
                            ? colorWithAlpha(colors.primary, 0.12)
                            : colors.surfaceMuted,
                        },
                      ]}
                    >
                      <ThemedText variant="caption">—</ThemedText>
                    </Pressable>
                    {s.headers.map((h) => {
                      const active = current === h.key;
                      const taken = Object.entries(s.columnMap).some(
                        ([t, src]) => t !== field && src === h.key,
                      );
                      if (taken && !active) return null;
                      return (
                        <Pressable
                          key={h.key}
                          onPress={() => s.setFieldMap(field, h.key)}
                          style={[
                            styles.chip,
                            {
                              borderColor: active
                                ? colors.primary
                                : colors.border,
                              backgroundColor: active
                                ? colorWithAlpha(colors.primary, 0.12)
                                : colors.surfaceMuted,
                            },
                          ]}
                        >
                          <ThemedText
                            variant="caption"
                            style={{
                              fontWeight: active ? "700" : "500",
                              color: active
                                ? colors.primary
                                : colors.textSecondary,
                            }}
                          >
                            {h.raw || h.key}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

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
  chip: {
    borderWidth: 1,
    borderRadius: radiiPx.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorRow: {
    borderWidth: 1,
    borderRadius: radiiPx.md,
    padding: 10,
    gap: 2,
  },
});
