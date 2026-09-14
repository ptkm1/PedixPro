import { useConfirm } from "@/context/ConfirmContext";
import { apiFetch } from "@/lib/api";
import { requestLocationPermissions } from "@/lib/location-disclosure";
import {
  fetchSellerCustomer,
  sellerOfflineStaleTime,
} from "@/lib/seller-offline-queries";
import type { CnpjCompanyData, CustomerFormValues } from "@pedidos/shared";
import {
  cepDigitsOnly,
  cnpjDigitsOnly,
  customerToForm,
  emptyCustomerForm,
  formToCustomerPayload,
  isValidCnpj,
  suggestedTradeName,
} from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

function parseCoord(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function useCustomerForm(customerId?: string) {
  const router = useRouter();
  const { alert, confirm } = useConfirm();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CustomerFormValues>(emptyCustomerForm());
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const { data: initial, isLoading } = useQuery({
    queryKey: ["seller", "customer", customerId],
    staleTime: sellerOfflineStaleTime,
    queryFn: () => fetchSellerCustomer(customerId!),
    enabled: !!customerId,
  });

  useEffect(() => {
    setStep(0);
    if (!customerId) {
      setForm(emptyCustomerForm());
      setLatitude(null);
      setLongitude(null);
    }
  }, [customerId]);

  useEffect(() => {
    if (!initial) return;
    setForm(customerToForm(initial));
    setLatitude(parseCoord(initial.latitude));
    setLongitude(parseCoord(initial.longitude));
  }, [initial]);

  const patch = useCallback((p: Partial<CustomerFormValues>) => {
    setForm((prev) => ({ ...prev, ...p }));
  }, []);

  async function lookupCnpj() {
    const d = cnpjDigitsOnly(form.cnpj);
    if (!isValidCnpj(d)) {
      await alert({
        title: "CNPJ inválido",
        description: "Informe um CNPJ válido com 14 dígitos.",
        tone: "danger",
      });
      return;
    }
    setCnpjLoading(true);
    try {
      const data = await apiFetch<CnpjCompanyData>(`/integrations/cnpj/${d}`, {
        skipAuth: true,
      });
      patch({
        documentType: "CNPJ",
        cnpj: d,
        legalName: data.razaoSocial ?? "",
        tradeName: data.nomeFantasia ?? "",
        name: suggestedTradeName(data),
        email: data.email ?? form.email,
        phone: data.telefone ?? form.phone,
        cep: data.cep ? cepDigitsOnly(data.cep) : form.cep,
        street: data.logradouro ?? form.street,
        number: data.numero ?? form.number,
        neighborhood: data.bairro ?? form.neighborhood,
        state: data.uf?.toUpperCase() ?? form.state,
        city: data.municipio ?? form.city,
        cityIbgeCode: data.cityIbgeCode ?? form.cityIbgeCode,
      });
    } catch (e) {
      await alert({
        title: "Erro",
        description: e instanceof Error ? e.message : "Falha na consulta.",
        tone: "danger",
      });
    } finally {
      setCnpjLoading(false);
    }
  }

  const captureLocation = useCallback(async () => {
    setLocationLoading(true);
    try {
      const result = await requestLocationPermissions({
        purpose: "foreground_customer",
        confirm,
      });
      if (!result.granted) {
        if (!result.declinedDisclosure) {
          await alert({
            title: "Permissão necessária",
            description:
              "Ative a localização para gravar as coordenadas do cliente.",
          });
        }
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
    } catch (e) {
      await alert({
        title: "Localização",
        description:
          e instanceof Error ? e.message : "Não foi possível obter o GPS.",
        tone: "danger",
      });
    } finally {
      setLocationLoading(false);
    }
  }, [alert, confirm]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = formToCustomerPayload(form, {
        latitude,
        longitude,
      });
      if (customerId) {
        return apiFetch(`/seller/customers/${customerId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<{ id: string; approvalStatus?: string }>(
        "/seller/customers",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["seller", "customers"] });
      if (customerId) {
        void qc.invalidateQueries({
          queryKey: ["seller", "customer", customerId],
        });
        router.back();
      } else {
        const pending =
          data &&
          typeof data === "object" &&
          "approvalStatus" in data &&
          data.approvalStatus === "PENDING";
        if (pending) {
          void alert({
            title: "Cadastro enviado",
            description:
              "Aguardando validação do escritório. O cliente só poderá ser usado em vendas após a aprovação.",
          }).then(() => router.replace("/(tabs)/customers"));
        } else {
          router.replace("/(tabs)/customers");
        }
      }
    },
    onError: (e: Error) => {
      void alert({
        title: "Erro ao salvar",
        description: e.message,
        tone: "danger",
      });
    },
  });

  return {
    step,
    setStep,
    form,
    patch,
    lookupCnpj,
    cnpjLoading,
    isLoading: !!customerId && isLoading,
    save,
    isEdit: !!customerId,
    latitude,
    longitude,
    captureLocation,
    locationLoading,
  };
}
