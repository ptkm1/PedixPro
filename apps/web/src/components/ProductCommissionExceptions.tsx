import { FormField, FormSection } from "@/components/forms";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

export type CommissionSellerOption = {
  id: string;
  name: string;
};

export type CommissionTableOption = {
  id: string;
  name: string;
};

export type PriceTableCommissionRow = {
  priceTableId: string;
  percent: string;
};

type Props = {
  sellers: CommissionSellerOption[];
  sellerEnabled: boolean;
  onSellerEnabledChange: (enabled: boolean) => void;
  sellerPercents: Record<string, string>;
  onSellerPercentChange: (sellerId: string, value: string) => void;
  priceTables: CommissionTableOption[];
  tableRows: PriceTableCommissionRow[];
  addTableId: string;
  onAddTableIdChange: (id: string) => void;
  onAddTable: () => void;
  onRemoveTable: (priceTableId: string) => void;
  onTablePercentChange: (priceTableId: string, value: string) => void;
};

export function ProductCommissionExceptions({
  sellers,
  sellerEnabled,
  onSellerEnabledChange,
  sellerPercents,
  onSellerPercentChange,
  priceTables,
  tableRows,
  addTableId,
  onAddTableIdChange,
  onAddTable,
  onRemoveTable,
  onTablePercentChange,
}: Props) {
  const unusedTables = priceTables.filter(
    (t) => !tableRows.some((row) => row.priceTableId === t.id),
  );

  return (
    <>
      <FormSection
        title="Comissão por vendedor"
        description="Defina uma comissão diferente para vendedores específicos."
      >
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={sellerEnabled}
            onCheckedChange={(v) => onSellerEnabledChange(v === true)}
            aria-label="Comissão por vendedor"
          />
          Comissão por vendedor
        </label>
        {sellerEnabled ? (
          sellers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum vendedor cadastrado nesta empresa.
            </p>
          ) : (
            <div className="space-y-3">
              {sellers.map((seller) => (
                <FormField
                  key={seller.id}
                  label={seller.name}
                  htmlFor={`prod-seller-comm-${seller.id}`}
                  hint="Vazio = usa a comissão padrão do produto."
                >
                  <Input
                    id={`prod-seller-comm-${seller.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="Padrão do produto"
                    value={sellerPercents[seller.id] ?? ""}
                    onChange={(e) =>
                      onSellerPercentChange(seller.id, e.target.value)
                    }
                  />
                </FormField>
              ))}
            </div>
          )
        ) : null}
      </FormSection>

      <FormSection
        title="Comissão por tabela de preço"
        description="Quando esta tabela for utilizada, esta comissão terá prioridade sobre a comissão normal do vendedor."
      >
        <p className="text-sm font-medium">Exceções por tabela</p>
        {tableRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma exceção. Use Adicionar tabela para Atacado, Distribuidor,
            Promocional, etc.
          </p>
        ) : (
          <div className="space-y-3">
            {tableRows.map((row) => {
              const table = priceTables.find((t) => t.id === row.priceTableId);
              return (
                <div
                  key={row.priceTableId}
                  className="flex flex-col gap-2 sm:flex-row sm:items-end"
                >
                  <FormField
                    className="flex-1"
                    label={table?.name ?? "Tabela"}
                    htmlFor={`prod-table-comm-${row.priceTableId}`}
                  >
                    <Input
                      id={`prod-table-comm-${row.priceTableId}`}
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={row.percent}
                      onChange={(e) =>
                        onTablePercentChange(row.priceTableId, e.target.value)
                      }
                    />
                  </FormField>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onRemoveTable(row.priceTableId)}
                    aria-label="Remover tabela"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <FormField
            className="flex-1"
            label="Tabela"
            htmlFor="prod-add-comm-table"
          >
            <AppSelect
              id="prod-add-comm-table"
              value={addTableId}
              onValueChange={onAddTableIdChange}
              placeholder="Selecione a tabela"
              options={unusedTables.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
              disabled={unusedTables.length === 0}
            />
          </FormField>
          <Button
            type="button"
            variant="secondary"
            onClick={onAddTable}
            disabled={!addTableId}
          >
            <Plus className="size-4" />
            Adicionar tabela
          </Button>
        </div>
      </FormSection>
    </>
  );
}
