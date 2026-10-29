import { FormField, FormGrid } from "@/components/forms";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCepLookup } from "@/hooks/useCepLookup";
import { useIbgeMunicipios, useIbgeUfs } from "@/hooks/useIbgeLocations";
import type { CepAddressData, CustomerFormErrors, CustomerFormValues } from "@pedidos/shared";
import {
  cepDigitsOnly,
  FIELD_NOT_APPLICABLE,
  formatCepMask,
  isFieldNotApplicable,
  isStateRegistrationUnavailable,
  isStreetNumberSn,
  STATE_REGISTRATION_UNAVAILABLE,
  STREET_NUMBER_SN,
} from "@pedidos/shared";
import { useEffect } from "react";

type Props = {
  values: Pick<
    CustomerFormValues,
    | "cep"
    | "street"
    | "number"
    | "neighborhood"
    | "addressNote"
    | "state"
    | "city"
    | "cityIbgeCode"
    | "stateRegistration"
  >;
  onChange: (patch: Partial<CustomerFormValues>) => void;
  errors?: CustomerFormErrors;
};

export function AddressFieldsGroup({
  values,
  onChange,
  errors = {},
}: Props) {
  const { data: ufs = [], isLoading: ufsLoading } = useIbgeUfs();
  const { data: municipios = [], isLoading: citiesLoading } = useIbgeMunicipios(
    values.state,
  );
  const { lookup, loading: cepLoading, error: cepError } = useCepLookup();

  async function onLookupCep() {
    const data = await lookup(values.cep);
    if (!data) return;
    applyCep(data);
  }

  function applyCep(data: CepAddressData) {
    onChange({
      cep: data.cep,
      street: data.street ?? values.street,
      neighborhood: data.neighborhood ?? values.neighborhood,
      state: data.state,
      city: data.city,
      cityIbgeCode: data.cityIbgeCode ?? values.cityIbgeCode,
    });
  }

  function onStateChange(uf: string) {
    onChange({ state: uf, city: "", cityIbgeCode: "" });
  }

  function onCityChange(cityName: string) {
    const m = municipios.find(
      (x) =>
        x.nome.localeCompare(cityName, "pt", { sensitivity: "base" }) === 0,
    );
    const keepCode =
      cityName.localeCompare(values.city, "pt", { sensitivity: "base" }) === 0
        ? values.cityIbgeCode
        : "";
    onChange({
      city: cityName,
      cityIbgeCode: m ? String(m.id) : keepCode,
    });
  }

  useEffect(() => {
    if (!values.city || municipios.length === 0) return;
    const match = municipios.find(
      (m) =>
        m.nome.localeCompare(values.city, "pt", { sensitivity: "base" }) === 0,
    );
    if (!match) return;
    const patch: Partial<CustomerFormValues> = {};
    if (match.nome !== values.city) patch.city = match.nome;
    if (!values.cityIbgeCode) patch.cityIbgeCode = String(match.id);
    if (Object.keys(patch).length > 0) onChange(patch);
  }, [municipios, values.city, values.cityIbgeCode]);

  const citySelectValue =
    municipios.find((m) => m.nome === values.city)?.nome ??
    municipios.find(
      (m) =>
        m.nome.localeCompare(values.city, "pt", { sensitivity: "base" }) === 0,
    )?.nome ??
    values.city;

  const ufOptions = (() => {
    const opts = ufs.map((u) => ({
      value: u.sigla,
      label: `${u.sigla} — ${u.nome}`,
    }));
    const uf = values.state.trim().toUpperCase();
    if (uf && !opts.some((o) => o.value === uf)) {
      opts.unshift({ value: uf, label: uf });
    }
    return opts;
  })();

  const cityOptions = (() => {
    const opts = municipios.map((m) => ({ value: m.nome, label: m.nome }));
    const city = values.city.trim();
    if (
      city &&
      !opts.some(
        (o) => o.value.localeCompare(city, "pt", { sensitivity: "base" }) === 0,
      )
    ) {
      opts.unshift({ value: city, label: city });
    }
    return opts;
  })();

  return (
    <div className="space-y-4">
      <FormField label="CEP" htmlFor="cust-cep" required error={errors.cep}>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            id="cust-cep"
            inputMode="numeric"
            placeholder="00000-000"
            className="font-mono"
            aria-invalid={errors.cep ? true : undefined}
            value={formatCepMask(cepDigitsOnly(values.cep))}
            onChange={(e) => onChange({ cep: cepDigitsOnly(e.target.value) })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onLookupCep();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={cepLoading}
            onClick={() => void onLookupCep()}
          >
            {cepLoading ? "Buscando…" : "Buscar CEP"}
          </Button>
        </div>
        {cepError ? (
          <p className="text-sm text-destructive">{cepError}</p>
        ) : null}
      </FormField>

      <FormGrid cols={2}>
        <FormField
          label="Endereço"
          htmlFor="cust-street"
          required
          error={errors.street}
          className="sm:col-span-2"
        >
          <Input
            id="cust-street"
            aria-invalid={errors.street ? true : undefined}
            value={values.street}
            onChange={(e) => onChange({ street: e.target.value })}
          />
        </FormField>
        <FormField
          label="Bairro"
          htmlFor="cust-neighborhood"
          required
          error={errors.neighborhood}
        >
          <Input
            id="cust-neighborhood"
            aria-invalid={errors.neighborhood ? true : undefined}
            value={values.neighborhood}
            onChange={(e) => onChange({ neighborhood: e.target.value })}
          />
        </FormField>
        <FormField
          label="Número"
          htmlFor="cust-number"
          required
          error={errors.number}
        >
          <div className="rounded-md border border-input bg-background overflow-hidden">
            <Input
              id="cust-number"
              className="border-0 rounded-none shadow-none focus-visible:ring-0"
              aria-invalid={errors.number ? true : undefined}
              disabled={isStreetNumberSn(values.number)}
              placeholder={
                isStreetNumberSn(values.number) ? STREET_NUMBER_SN : "Número"
              }
              value={isStreetNumberSn(values.number) ? "" : values.number}
              onChange={(e) => onChange({ number: e.target.value })}
            />
            <label
              htmlFor="cust-number-sn"
              className="flex items-center gap-2 px-3 pb-2.5 pt-0.5 text-sm text-muted-foreground cursor-pointer"
            >
              <Checkbox
                id="cust-number-sn"
                checked={isStreetNumberSn(values.number)}
                onCheckedChange={(checked) => {
                  onChange({
                    number: checked ? STREET_NUMBER_SN : "",
                  });
                }}
              />
              Sem número (S/N)
            </label>
          </div>
        </FormField>
        <FormField
          label="Complemento"
          htmlFor="cust-complement"
          required
          error={errors.addressNote}
          className="sm:col-span-2"
        >
          <div className="rounded-md border border-input bg-background overflow-hidden">
            <Input
              id="cust-complement"
              className="border-0 rounded-none shadow-none focus-visible:ring-0"
              aria-invalid={errors.addressNote ? true : undefined}
              disabled={isFieldNotApplicable(values.addressNote)}
              placeholder={
                isFieldNotApplicable(values.addressNote)
                  ? FIELD_NOT_APPLICABLE
                  : "Apto, sala, referência…"
              }
              value={
                isFieldNotApplicable(values.addressNote)
                  ? ""
                  : values.addressNote
              }
              onChange={(e) => onChange({ addressNote: e.target.value })}
            />
            <label
              htmlFor="cust-complement-none"
              className="flex items-center gap-2 px-3 pb-2.5 pt-0.5 text-sm text-muted-foreground cursor-pointer"
            >
              <Checkbox
                id="cust-complement-none"
                checked={isFieldNotApplicable(values.addressNote)}
                onCheckedChange={(checked) => {
                  onChange({
                    addressNote: checked ? FIELD_NOT_APPLICABLE : "",
                  });
                }}
              />
              Não possui complemento
            </label>
          </div>
        </FormField>
        <FormField label="UF" htmlFor="cust-uf" required error={errors.state}>
          <AppSelect
            id="cust-uf"
            value={values.state.trim().toUpperCase()}
            emptyLabel="Selecione"
            placeholder={ufsLoading ? "Carregando…" : "Selecione"}
            options={ufOptions}
            onValueChange={onStateChange}
          />
        </FormField>
        <FormField
          label="Cidade"
          htmlFor="cust-city"
          required
          error={errors.city ?? errors.cityIbgeCode}
        >
          <AppSelect
            id="cust-city"
            value={citySelectValue}
            disabled={!values.state}
            emptyLabel={values.state ? "Selecione" : "Escolha a UF primeiro"}
            placeholder={
              !values.state
                ? "Escolha a UF primeiro"
                : citiesLoading
                  ? "Carregando…"
                  : "Selecione"
            }
            options={cityOptions}
            onValueChange={onCityChange}
          />
        </FormField>
        <FormField
          label="Inscrição estadual"
          htmlFor="cust-ie"
          required
          error={errors.stateRegistration}
        >
          <div className="rounded-md border border-input bg-background overflow-hidden">
            <Input
              id="cust-ie"
              className="border-0 rounded-none shadow-none focus-visible:ring-0"
              aria-invalid={errors.stateRegistration ? true : undefined}
              disabled={isStateRegistrationUnavailable(
                values.stateRegistration,
              )}
              placeholder={
                isStateRegistrationUnavailable(values.stateRegistration)
                  ? "indisponível"
                  : "Número da IE"
              }
              value={
                isStateRegistrationUnavailable(values.stateRegistration)
                  ? ""
                  : values.stateRegistration
              }
              onChange={(e) => onChange({ stateRegistration: e.target.value })}
            />
            <label
              htmlFor="cust-ie-unknown"
              className="flex items-center gap-2 px-3 pb-2.5 pt-0.5 text-sm text-muted-foreground cursor-pointer"
            >
              <Checkbox
                id="cust-ie-unknown"
                checked={isStateRegistrationUnavailable(
                  values.stateRegistration,
                )}
                onCheckedChange={(checked) => {
                  onChange({
                    stateRegistration: checked
                      ? STATE_REGISTRATION_UNAVAILABLE
                      : "",
                  });
                }}
              />
              Não sei a inscrição estadual
            </label>
          </div>
        </FormField>
        <FormField
          label="Cód. município"
          htmlFor="cust-ibge"
          required
          error={errors.cityIbgeCode}
          hint="Preenchido ao escolher a cidade"
        >
          <Input
            id="cust-ibge"
            readOnly
            className="bg-muted"
            aria-invalid={errors.cityIbgeCode ? true : undefined}
            value={values.cityIbgeCode}
          />
        </FormField>
      </FormGrid>
    </div>
  );
}
