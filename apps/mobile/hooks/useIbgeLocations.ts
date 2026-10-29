import { apiFetch } from "@/lib/api";
import { BRAZIL_UFS, type IbgeMunicipio, type IbgeUf } from "@pedidos/shared";
import { useQuery } from "@tanstack/react-query";

export function useIbgeUfs() {
  return useQuery({
    queryKey: ["integrations", "ibge", "ufs", "v3"],
    queryFn: async () => {
      try {
        const data = await apiFetch<IbgeUf[]>("/integrations/ibge/ufs", {
          skipAuth: true,
        });
        return Array.isArray(data) && data.length >= 27 ? data : BRAZIL_UFS;
      } catch {
        return BRAZIL_UFS;
      }
    },
    staleTime: 24 * 60 * 60 * 1000,
    initialData: BRAZIL_UFS,
    placeholderData: BRAZIL_UFS,
    meta: { silentError: true },
  });
}

export function useIbgeMunicipios(uf: string) {
  const sigla = uf.trim().toUpperCase();
  return useQuery({
    queryKey: ["integrations", "ibge", "municipios", sigla, "v3"],
    queryFn: async () => {
      try {
        const data = await apiFetch<IbgeMunicipio[]>(
          `/integrations/ibge/municipios/${sigla}`,
          { skipAuth: true },
        );
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    enabled: /^[A-Z]{2}$/.test(sigla),
    staleTime: 24 * 60 * 60 * 1000,
    meta: { silentError: true },
  });
}
