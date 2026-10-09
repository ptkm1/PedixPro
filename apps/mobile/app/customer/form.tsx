import { ThemedButton } from "@/components/atoms/ThemedButton";
import { ThemedText } from "@/components/atoms/ThemedText";
import { KeyboardForm, MobileHeader, SafeScreen } from "@/components/layout";
import {
  CustomerFormWizard,
  CustomerFormWizardLoading,
} from "@/components/organisms/CustomerFormWizard";
import { useCustomerForm } from "@/hooks/useCustomerForm";
import {
  customerFormErrorStep,
  validateCustomerForm,
  validateCustomerFormStep,
} from "@pedidos/shared";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

const STEP_TITLES = ["Documento", "Endereço", "Contato"];

function paramString(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export default function CustomerFormScreen() {
  const params = useLocalSearchParams<{
    customerId?: string | string[];
    id?: string | string[];
  }>();
  /** Preferir `customerId` — `id` colide com a rota dinâmica `customer/[id]`. */
  const customerId = paramString(params.customerId) ?? paramString(params.id);
  const {
    step,
    setStep,
    form,
    patch,
    lookupCnpj,
    cnpjLoading,
    isLoading,
    save,
    isEdit,
    latitude,
    longitude,
    captureLocation,
    locationLoading,
    canPickSeller,
    sellerId,
    setSellerId,
    sellers,
    sellersLoading,
  } = useCustomerForm(customerId);

  const [showValidation, setShowValidation] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = step === 2;

  const visibleErrors = useMemo(() => {
    if (!showValidation) return {};
    if (isLast) return validateCustomerForm(form);
    return validateCustomerFormStep(step, form);
  }, [showValidation, isLast, step, form]);

  const errorScrollKey = useMemo(
    () =>
      Object.entries(visibleErrors)
        .filter(([, v]) => Boolean(v))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join("|"),
    [visibleErrors],
  );

  useEffect(() => {
    if (!errorScrollKey) return;
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => cancelAnimationFrame(id);
  }, [errorScrollKey, step]);

  function onContinue() {
    const stepErrors = validateCustomerFormStep(step, form);
    if (Object.keys(stepErrors).length > 0) {
      setShowValidation(true);
      return;
    }
    setShowValidation(false);
    setStep(step + 1);
  }

  function onSave() {
    const allErrors = validateCustomerForm(form);
    if (Object.keys(allErrors).length > 0) {
      setShowValidation(true);
      setStep(customerFormErrorStep(allErrors));
      return;
    }
    save.mutate();
  }

  const footer = !isLoading ? (
    <View style={styles.footerInner}>
      <View style={styles.actions}>
        {step > 0 ? (
          <ThemedButton
            variant="secondary"
            style={styles.flex}
            onPress={() => setStep(step - 1)}
          >
            Voltar
          </ThemedButton>
        ) : null}
        {!isLast ? (
          <ThemedButton style={styles.flex} onPress={onContinue}>
            Continuar
          </ThemedButton>
        ) : (
          <ThemedButton
            style={styles.flex}
            loading={save.isPending}
            loadingLabel="Salvando…"
            onPress={onSave}
          >
            {isEdit ? "Salvar" : "Cadastrar"}
          </ThemedButton>
        )}
      </View>
      {!isLast ? (
        <ThemedText variant="caption" muted style={styles.hint}>
          Você pode revisar tudo no último passo antes de salvar.
        </ThemedText>
      ) : null}
    </View>
  ) : null;

  return (
    <SafeScreen>
      <MobileHeader
        title={isEdit ? "Editar cliente" : "Cadastro de cliente"}
        subtitle={`Passo ${step + 1} de 3 · ${STEP_TITLES[step]}`}
        showBack
      />
      <KeyboardForm
        scrollRef={scrollRef}
        contentContainerStyle={{ gap: 20 }}
        bottomPadding={20}
        footer={footer}
      >
        {isLoading ? (
          <CustomerFormWizardLoading />
        ) : (
          <CustomerFormWizard
            step={step}
            form={form}
            onChange={patch}
            onLookupCnpj={() => void lookupCnpj()}
            cnpjLoading={cnpjLoading}
            errors={visibleErrors}
            latitude={latitude}
            longitude={longitude}
            onCaptureLocation={() => void captureLocation()}
            locationLoading={locationLoading}
            showSellerPicker={canPickSeller}
            sellerId={sellerId}
            onSellerIdChange={setSellerId}
            sellers={sellers}
            sellersLoading={sellersLoading}
          />
        )}
      </KeyboardForm>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  footerInner: { gap: 8 },
  actions: { flexDirection: "row", gap: 12 },
  flex: { flex: 1 },
  hint: { textAlign: "center" },
});
