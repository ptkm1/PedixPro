import { FormField, FormGrid, FormSection } from "@/components/forms";
import { SettingsDetailShell } from "@/components/settings/SettingsDetailShell";
import { AppSelect } from "@/components/ui/app-select";
import {
  useAdminSystemSettings,
  type CatalogPriceDisplayMode,
} from "@/hooks/useAdminSystemSettings";
import {
  CATALOG_PRICE_DISPLAY_MODE_LABELS,
  type CatalogPriceDisplayMode as SharedMode,
} from "@pedidos/shared";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

const MODE_HINT: Record<CatalogPriceDisplayMode, string> = {
  ALL: "Lista todas as tabelas com preço válido no card (ou resumo + lista se forem muitas).",
  LOWEST: "Mostra só o menor preço válido entre as tabelas ativas (comportamento padrão).",
  HIGHEST: "Mostra só o maior preço válido entre as tabelas ativas.",
};

export function CatalogPriceDisplaySettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { settings, isLoading, patch } = useAdminSystemSettings(Boolean(isAdmin));

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/configuracoes" replace />;

  const mode = (settings?.catalogPriceDisplayMode ??
    "LOWEST") as CatalogPriceDisplayMode;

  return (
    <SettingsDetailShell
      title="Exibição de preços no catálogo"
      description="Define como o app dos vendedores mostra os preços das tabelas no catálogo e em Mais vendidos. Não altera o preço do pedido."
    >
      <FormSection
        title="Catálogo do app"
        description="Aplica a todos os vendedores desta empresa após a próxima sincronização."
      >
        <FormGrid cols={2}>
          <FormField
            label="Exibição de preços no catálogo"
            htmlFor="catalog-price-display-mode"
            className="sm:col-span-2 max-w-xl"
            hint={MODE_HINT[mode]}
          >
            <AppSelect
              id="catalog-price-display-mode"
              value={mode}
              disabled={isLoading || patch.isPending || settings === undefined}
              options={(
                Object.keys(CATALOG_PRICE_DISPLAY_MODE_LABELS) as SharedMode[]
              ).map((value) => ({
                value,
                label: CATALOG_PRICE_DISPLAY_MODE_LABELS[value],
              }))}
              onValueChange={(v) =>
                patch.mutate({
                  catalogPriceDisplayMode: v as CatalogPriceDisplayMode,
                })
              }
            />
          </FormField>
        </FormGrid>
      </FormSection>
      {patch.isError ? (
        <p className="text-sm text-destructive">
          {(patch.error as Error).message || "Não foi possível salvar."}
        </p>
      ) : null}
    </SettingsDetailShell>
  );
}
