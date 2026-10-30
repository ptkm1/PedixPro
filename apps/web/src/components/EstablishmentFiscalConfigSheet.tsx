import { FormField, FormGrid, FormSection, FormSheet } from "@/components/forms";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCnpjShort } from "@/auth/EstablishmentContext";
import { apiFetch, fetchAuthenticatedBlob } from "@/lib/api";
import { getErrorMessage } from "@/lib/api-error";
import { notifyError, notifySuccess } from "@/lib/app-notifications";
import { cn } from "@/lib/utils";
import type { FiscalTaxRegime, NfeEnvironment } from "@pedidos/shared";
import {
  FISCAL_TAX_REGIME_LABELS,
  NFE_ENVIRONMENT_LABELS,
} from "@pedidos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

type FiscalSettings = {
  configured: boolean;
  legalName?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
  stateRegistration?: string | null;
  taxRegime?: FiscalTaxRegime;
  uf?: string | null;
  city?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  zipCode?: string | null;
  nfeEnvironment?: NfeEnvironment;
  nfeSeries?: number;
  nfeLastNumber?: number;
  nfeAdditionalInfo?: string | null;
  contingencyEnabled?: boolean;
  nfeContingencyState?: "NORMAL" | "SVC_ATIVA" | "SEFAZ_INDISPONIVEL";
  nfeContingencySince?: string | null;
  autoStockOnInboundInvoice?: boolean;
  logo?: {
    uploaded: boolean;
    mimeType?: string | null;
  };
  certificate?: {
    uploaded: boolean;
    valid: boolean;
    warning: boolean;
    expiresAt: string | null;
    daysUntilExpiry: number | null;
    alertThreshold?: 60 | 30 | 15 | 7 | 0 | null;
  };
};

function certBannerMessage(cert: NonNullable<FiscalSettings["certificate"]>) {
  if (!cert.uploaded) return null;
  if (!cert.valid || cert.alertThreshold === 0) {
    return {
      tone: "destructive" as const,
      text: "Certificado digital A1 vencido. Emissões e eventos SEFAZ vão falhar até renovar.",
    };
  }
  if (cert.alertThreshold != null && cert.daysUntilExpiry != null) {
    return {
      tone:
        cert.alertThreshold <= 15 ? ("warning" as const) : ("info" as const),
      text: `Certificado A1 vence em ${cert.daysUntilExpiry} dia(s) (alerta ${cert.alertThreshold} dias).`,
    };
  }
  if (cert.warning && cert.daysUntilExpiry != null) {
    return {
      tone: "warning" as const,
      text: `Certificado A1 vence em ${cert.daysUntilExpiry} dia(s).`,
    };
  }
  return null;
}

type EstablishmentFiscalConfigSheetProps = {
  establishmentId: string | null;
  establishmentLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EstablishmentFiscalConfigSheet({
  establishmentId,
  establishmentLabel,
  open,
  onOpenChange,
}: EstablishmentFiscalConfigSheetProps) {
  const qc = useQueryClient();
  const [certPassword, setCertPassword] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    cnpj: "",
    stateRegistration: "",
    taxRegime: "SIMPLES_NACIONAL" as FiscalTaxRegime,
    uf: "",
    city: "",
    street: "",
    addressNumber: "",
    zipCode: "",
    nfeEnvironment: "HOMOLOGATION" as NfeEnvironment,
    nfeSeries: "1",
    nfeAdditionalInfo: "",
    contingencyEnabled: false,
    autoStockOnInboundInvoice: false,
  });

  const settingsQ = useQuery({
    queryKey: ["admin", "fiscal", "settings", establishmentId],
    queryFn: () => {
      const qs = establishmentId
        ? `?establishmentId=${encodeURIComponent(establishmentId)}`
        : "";
      return apiFetch<FiscalSettings>(`/admin/fiscal/settings${qs}`);
    },
    enabled: open && Boolean(establishmentId),
  });

  const settings = settingsQ.data;
  const certBanner = settings?.certificate
    ? certBannerMessage(settings.certificate)
    : null;

  useEffect(() => {
    if (!open) {
      setCertPassword("");
      setCertFile(null);
      setLogoFile(null);
      setLogoPreview(null);
    }
  }, [open, establishmentId]);

  useEffect(() => {
    if (!settings?.logo?.uploaded || !establishmentId || !open) {
      setLogoPreview(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetchAuthenticatedBlob(
      `/admin/fiscal/logo?establishmentId=${encodeURIComponent(establishmentId)}`,
    )
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLogoPreview(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setLogoPreview(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [settings?.logo?.uploaded, settings?.logo?.mimeType, establishmentId, open]);

  useEffect(() => {
    if (!settings?.configured) return;
    setForm({
      cnpj: settings.cnpj ?? "",
      stateRegistration: settings.stateRegistration ?? "",
      taxRegime: settings.taxRegime ?? "SIMPLES_NACIONAL",
      uf: settings.uf ?? "",
      city: settings.city ?? "",
      street: settings.street ?? "",
      addressNumber: settings.addressNumber ?? "",
      zipCode: settings.zipCode ?? "",
      nfeEnvironment: settings.nfeEnvironment ?? "HOMOLOGATION",
      nfeSeries: String(settings.nfeSeries ?? 1),
      nfeAdditionalInfo: settings.nfeAdditionalInfo ?? "",
      contingencyEnabled: settings.contingencyEnabled ?? false,
      autoStockOnInboundInvoice: settings.autoStockOnInboundInvoice ?? false,
    });
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/admin/fiscal/settings", {
        method: "PUT",
        body: JSON.stringify({ establishmentId, ...body }),
      }),
    onSuccess: () => {
      notifySuccess("Configurações fiscais salvas.");
      void settingsQ.refetch();
      void qc.invalidateQueries({ queryKey: ["admin", "establishments"] });
    },
    onError: (e) =>
      notifyError(getErrorMessage(e), "Falha ao salvar configurações"),
  });

  const uploadCert = useMutation({
    mutationFn: async () => {
      if (!certFile) throw new Error("Selecione o arquivo .pfx");
      const buf = await certFile.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const pfxBase64 = btoa(binary);
      return apiFetch("/admin/fiscal/certificate", {
        method: "POST",
        body: JSON.stringify({
          establishmentId,
          pfxBase64,
          password: certPassword,
        }),
      });
    },
    onSuccess: () => {
      setCertPassword("");
      setCertFile(null);
      notifySuccess("Certificado A1 enviado com sucesso.");
      void settingsQ.refetch();
    },
    onError: (e) =>
      notifyError(getErrorMessage(e), "Falha ao enviar certificado"),
  });

  const uploadLogo = useMutation({
    mutationFn: async () => {
      if (!logoFile) throw new Error("Selecione uma imagem");
      const buf = await logoFile.arrayBuffer();
      const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      return apiFetch("/admin/fiscal/logo", {
        method: "POST",
        body: JSON.stringify({
          establishmentId,
          imageBase64,
          mimeType: logoFile.type || "image/png",
        }),
      });
    },
    onSuccess: () => {
      setLogoFile(null);
      notifySuccess("Logo salva. Ela aparecerá nos DANFE deste CNPJ.");
      void settingsQ.refetch();
    },
    onError: (e) => notifyError(getErrorMessage(e), "Falha ao enviar logo"),
  });

  const removeLogo = useMutation({
    mutationFn: () =>
      apiFetch(
        `/admin/fiscal/logo?establishmentId=${encodeURIComponent(establishmentId!)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      setLogoFile(null);
      notifySuccess("Logo removida.");
      void settingsQ.refetch();
    },
    onError: (e) => notifyError(getErrorMessage(e), "Falha ao remover logo"),
  });

  const title =
    establishmentLabel?.trim() ||
    settings?.tradeName ||
    settings?.legalName ||
    "Configuração fiscal";

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        settings?.cnpj
          ? `CNPJ ${formatCnpjShort(settings.cnpj)} · NF-e série ${settings.nfeSeries ?? 1} (último ${settings.nfeLastNumber ?? 0})`
          : "Emitente, certificado A1 e logo do DANFE para este estabelecimento."
      }
      contentClassName="max-h-[92vh]"
    >
      {settingsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !establishmentId ? (
        <p className="text-sm text-muted-foreground">
          Selecione um estabelecimento.
        </p>
      ) : (
        <div className="space-y-6">
          <FormSection title="Emitente">
            <FormGrid>
              <FormField label="CNPJ">
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                />
              </FormField>
              <FormField label="Inscrição estadual">
                <Input
                  value={form.stateRegistration}
                  onChange={(e) =>
                    setForm({ ...form, stateRegistration: e.target.value })
                  }
                />
              </FormField>
              <FormField label="UF">
                <Input
                  value={form.uf}
                  maxLength={2}
                  onChange={(e) => setForm({ ...form, uf: e.target.value })}
                />
              </FormField>
              <FormField label="Cidade">
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </FormField>
              <FormField label="Logradouro">
                <Input
                  value={form.street}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                />
              </FormField>
              <FormField label="Número">
                <Input
                  value={form.addressNumber}
                  onChange={(e) =>
                    setForm({ ...form, addressNumber: e.target.value })
                  }
                />
              </FormField>
              <FormField label="CEP">
                <Input
                  value={form.zipCode}
                  onChange={(e) =>
                    setForm({ ...form, zipCode: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Regime">
                <AppSelect
                  value={form.taxRegime}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      taxRegime: v as FiscalTaxRegime,
                    })
                  }
                  options={Object.entries(FISCAL_TAX_REGIME_LABELS).map(
                    ([k, v]) => ({ value: k, label: v }),
                  )}
                />
              </FormField>
              <FormField label="Ambiente NF-e">
                <AppSelect
                  value={form.nfeEnvironment}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      nfeEnvironment: v as NfeEnvironment,
                    })
                  }
                  options={Object.entries(NFE_ENVIRONMENT_LABELS).map(
                    ([k, v]) => ({ value: k, label: v }),
                  )}
                />
              </FormField>
              <FormField label="Série">
                <Input
                  value={form.nfeSeries}
                  onChange={(e) =>
                    setForm({ ...form, nfeSeries: e.target.value })
                  }
                />
              </FormField>
            </FormGrid>
            <FormField
              className="mt-4"
              label="Informações complementares (todas as NF-e)"
              hint="Um único texto para todas as notas deste estabelecimento. Até 5.000 caracteres. Deixe em branco para omitir."
            >
              <Textarea
                value={form.nfeAdditionalInfo}
                maxLength={5000}
                rows={5}
                placeholder="Texto fixo impresso em todas as notas deste CNPJ (infCpl)."
                onChange={(e) =>
                  setForm({ ...form, nfeAdditionalInfo: e.target.value })
                }
              />
            </FormField>
            <div className="mt-4">
              <Button
                disabled={saveSettings.isPending}
                onClick={() =>
                  saveSettings.mutate({
                    ...form,
                    nfeSeries: Number(form.nfeSeries) || 1,
                    nfeAdditionalInfo: form.nfeAdditionalInfo.trim() || null,
                  })
                }
              >
                Salvar emitente
              </Button>
            </div>
          </FormSection>

          <FormSection title="Logo no DANFE">
            <p className="mb-3 text-sm text-muted-foreground">
              Imagem exibida no canto superior esquerdo do DANFE deste CNPJ.
              PNG ou JPEG recomendado. Tamanho máximo: 512 KB.
            </p>
            <div className="flex flex-wrap items-start gap-6">
              <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-2">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo da empresa"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-center text-xs text-muted-foreground">
                    Sem logo
                  </span>
                )}
              </div>
              <div className="flex min-w-[220px] flex-1 flex-col gap-3">
                <FormField label="Arquivo de imagem">
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  />
                </FormField>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={uploadLogo.isPending || !logoFile}
                    onClick={() => uploadLogo.mutate()}
                  >
                    {uploadLogo.isPending ? "Enviando…" : "Salvar logo"}
                  </Button>
                  {settings?.logo?.uploaded ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive"
                      disabled={removeLogo.isPending}
                      onClick={() => removeLogo.mutate()}
                    >
                      Remover logo
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection title="Certificado A1">
            {certBanner && (
              <div
                className={cn(
                  "mb-3 rounded-lg border px-3 py-2 text-sm",
                  certBanner.tone === "destructive" &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                  certBanner.tone === "warning" &&
                    "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
                  certBanner.tone === "info" &&
                    "border-border bg-muted/50 text-foreground",
                )}
              >
                {certBanner.text}
              </div>
            )}
            {settings?.certificate?.uploaded && (
              <p
                className={`mb-3 text-sm ${settings.certificate.warning ? "text-amber-600" : "text-muted-foreground"}`}
              >
                Certificado enviado
                {settings.certificate.expiresAt
                  ? ` — validade ${new Date(settings.certificate.expiresAt).toLocaleDateString("pt-BR")}`
                  : ""}
                {settings.certificate.daysUntilExpiry != null
                  ? ` (${settings.certificate.daysUntilExpiry} dia(s))`
                  : ""}
                {!settings.certificate.valid ? " — vencido" : ""}
              </p>
            )}
            <FormGrid>
              <FormField label="Arquivo .pfx">
                <Input
                  type="file"
                  accept=".pfx,.p12"
                  onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
                />
              </FormField>
              <FormField label="Senha do certificado">
                <Input
                  type="password"
                  value={certPassword}
                  onChange={(e) => setCertPassword(e.target.value)}
                />
              </FormField>
            </FormGrid>
            <Button
              className="mt-3"
              disabled={uploadCert.isPending}
              onClick={() => uploadCert.mutate()}
            >
              Enviar certificado
            </Button>
          </FormSection>

          <FormSection title="Estoque na NF-e de entrada">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.autoStockOnInboundInvoice}
                onCheckedChange={(v) => {
                  const next = v === true;
                  setForm({ ...form, autoStockOnInboundInvoice: next });
                  saveSettings.mutate({ autoStockOnInboundInvoice: next });
                }}
              />
              Lançar estoque automaticamente ao confirmar importação de NF-e de
              entrada
            </label>
          </FormSection>

          <FormSection title="Contingência (SVC)">
            <p className="text-sm">
              {settings?.nfeContingencyState === "SVC_ATIVA"
                ? "SVC ativa — novas notas só vão à SVC enquanto a SEFAZ da UF estiver fora e o status da SVC for 107."
                : settings?.nfeContingencyState === "SEFAZ_INDISPONIVEL"
                  ? "SEFAZ da UF indisponível. A SVC só é usada se o status do serviço retornar cStat 107."
                  : "Emissão normal (tpEmis 1). A SVC não é escolhida manualmente."}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              O Pedix consulta o status da SEFAZ e da SVC. Rejeição 114 volta
              automaticamente para o webservice da UF, sem reenviar na SVC-RS.
            </p>
          </FormSection>
        </div>
      )}
    </FormSheet>
  );
}
