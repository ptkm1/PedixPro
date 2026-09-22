import { AuditLogPanel } from "@/components/AuditLogPanel";
import { FormField, FormGrid, FormSection } from "@/components/forms";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { fieldControlClass } from "@/lib/field-styles";
import { formatOrderCode } from "@/lib/order-code";
import { cn } from "@/lib/utils";
import type {
  FiscalInvoiceStatus,
  FiscalTaxRegime,
  NfeEnvironment,
} from "@pedidos/shared";
import {
  FISCAL_INVOICE_STATUS_LABELS,
  nfeTpEmisLabel,
} from "@pedidos/shared";
import { useActiveEstablishment } from "@/auth/EstablishmentContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiscalCadastrosPanel } from "../components/FiscalCadastrosPanel";
import {
  apiFetch,
  downloadPdf,
  downloadXml,
  printPdf,
} from "../lib/api";
import { getErrorMessage } from "../lib/api-error";
import {
  confirmAction,
  notifyError,
  notifySuccess,
  promptAction,
} from "../lib/app-notifications";

function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
type Tab = "saida" | "entrada" | "cadastros" | "config" | "historico";

type EligibleOrder = {
  id: string;
  orderNumber?: number | null;
  status: string;
  totalAmount: unknown;
  createdAt: string;
  fiscalStatus: FiscalInvoiceStatus | "NONE";
  canEmit?: boolean;
  readinessIssues?: { code: string; message: string }[];
  customer: { id: string; name: string; document: string | null } | null;
  seller: { user: { name: string } };
  fiscalInvoice: {
    id: string;
    status: FiscalInvoiceStatus;
    number: number | null;
  } | null;
};

/** Pedidos que podem entrar no lote: criar rascunho + transmitir, ou só transmitir draft. */
function isBatchEmitable(o: EligibleOrder): boolean {
  if (o.canEmit === true) return true;
  return o.fiscalInvoice?.status === "DRAFT";
}

function selectAllState(
  allSelected: boolean,
  someSelected: boolean,
): boolean | "indeterminate" {
  if (allSelected) return true;
  if (someSelected) return "indeterminate";
  return false;
}

type FiscalInvoiceEvent = {
  id: string;
  eventType: string;
  success: boolean;
  createdAt: string;
  responsePayload?: string | null;
};

type TransmitJobBrief = {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  attempts: number;
  lastError?: string | null;
  nextRunAt?: string;
};

type FiscalInvoice = {
  id: string;
  direction: string;
  status: FiscalInvoiceStatus;
  accessKey: string | null;
  number: number | null;
  series: number | null;
  totalAmount: unknown;
  issuedAt: string | null;
  stockApplied: boolean;
  rejectionReason?: string | null;
  xmlSigned?: string | null;
  xmlAuthorized?: string | null;
  modFrete?: string | null;
  freightAmount?: unknown;
  volumeQty?: unknown;
  grossWeightKg?: unknown;
  netWeightKg?: unknown;
  documentModel?: number;
  tpEmis?: string | null;
  contingencyJustification?: string | null;
  supplier?: { tradeName?: string; legalName?: string; cnpj?: string } | null;
  order?: {
    id: string;
    orderNumber: number | null;
    customer: {
      name: string;
      tradeName?: string | null;
      legalName?: string | null;
      email?: string | null;
    } | null;
  } | null;
  items: {
    id: string;
    description: string;
    quantity: unknown;
    productId: string | null;
  }[];
  events?: FiscalInvoiceEvent[];
  transmitJobs?: TransmitJobBrief[];
};

type FiscalSettings = {
  configured: boolean;
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
  contingencyEnabled?: boolean;
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

const EVENT_TYPE_LABELS: Record<string, string> = {
  NFeAutorizacao: "Autorização",
  NFeAutorizacaoSVC: "Autorização SVC (contingência)",
  NFeCancelamento: "Cancelamento",
  NFeCartaCorrecao: "Carta de correção",
  NFeConsultaSituacao: "Consulta situação",
  NFeEmail: "E-mail XML/DANFE",
};

const JOB_STATUS_LABELS: Record<TransmitJobBrief["status"], string> = {
  PENDING: "Na fila",
  RUNNING: "Transmitindo",
  SUCCEEDED: "Fila OK",
  FAILED: "Falha na fila",
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
      text: `Certificado A1 vence em ${cert.daysUntilExpiry} dia(s) (alerta ${cert.alertThreshold} dias). Renove em Estabelecimentos.`,
    };
  }
  if (cert.warning && cert.daysUntilExpiry != null) {
    return {
      tone: "warning" as const,
      text: `Certificado A1 vence em ${cert.daysUntilExpiry} dia(s). Renove em Estabelecimentos.`,
    };
  }
  return null;
}

export function FaturamentoPage() {
  const qc = useQueryClient();
  const { activeEstablishmentId } = useActiveEstablishment();
  const [tab, setTab] = useState<Tab>("saida");
  const [xmlPaste, setXmlPaste] = useState("");
  const [xmlFileName, setXmlFileName] = useState<string | null>(null);
  const [xmlDragActive, setXmlDragActive] = useState(false);
  const xmlFileInputRef = useRef<HTMLInputElement>(null);
  const xmlDragDepthRef = useRef(0);
  const [mappingInvoiceId, setMappingInvoiceId] = useState<string | null>(null);
  const [productMappings, setProductMappings] = useState<
    Record<string, string>
  >({});
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set(),
  );
  const [outboundInvoiceSearch, setOutboundInvoiceSearch] = useState("");
  const debouncedOutboundInvoiceSearch = useDebouncedValue(
    outboundInvoiceSearch,
  );
  const [batchEmitProgress, setBatchEmitProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [inutForm, setInutForm] = useState({
    numberStart: "",
    numberEnd: "",
    justification: "",
  });

  const { data: settings } = useQuery({
    queryKey: ["admin", "fiscal", "settings", activeEstablishmentId],
    queryFn: () => {
      const qs = activeEstablishmentId
        ? `?establishmentId=${encodeURIComponent(activeEstablishmentId)}`
        : "";
      return apiFetch<FiscalSettings>(`/admin/fiscal/settings${qs}`);
    },
  });

  const certBanner = settings?.certificate
    ? certBannerMessage(settings.certificate)
    : null;

  const { data: products = [] } = useQuery({
    queryKey: ["admin", "products", "fiscal-map"],
    queryFn: () =>
      apiFetch<{ id: string; name: string; sku?: string | null }[]>(
        "/admin/products",
      ),
    enabled: tab === "entrada",
  });

  const { data: eligibleOrders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["admin", "fiscal", "outbound-orders"],
    queryFn: () => apiFetch<EligibleOrder[]>("/admin/fiscal/outbound/orders"),
    enabled: tab === "saida",
  });

  const batchableOrders = eligibleOrders.filter(isBatchEmitable);
  const batchableIds = batchableOrders.map((o) => o.id);
  const selectedBatchOrders = batchableOrders.filter((o) =>
    selectedOrderIds.has(o.id),
  );
  const hasOrderSelection = selectedBatchOrders.length > 0;
  const allBatchableSelected =
    batchableIds.length > 0 &&
    batchableIds.every((id) => selectedOrderIds.has(id));
  const someBatchableSelected =
    batchableIds.some((id) => selectedOrderIds.has(id)) &&
    !allBatchableSelected;
  const batchEmitBusy = batchEmitProgress != null;

  useEffect(() => {
    setSelectedOrderIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(eligibleOrders.map((o) => o.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (
          valid.has(id) &&
          eligibleOrders.some((o) => o.id === id && isBatchEmitable(o))
        ) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [eligibleOrders]);

  function toggleOrder(id: string, checked: boolean) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllBatchable(checked: boolean) {
    setSelectedOrderIds(checked ? new Set(batchableIds) : new Set());
  }

  async function emitAndTransmitOrder(order: EligibleOrder) {
    if (order.canEmit === true) {
      const invoice = await apiFetch<{ id: string }>(
        `/admin/fiscal/outbound/from-order/${order.id}`,
        { method: "POST" },
      );
      await apiFetch(`/admin/fiscal/outbound/invoices/${invoice.id}/transmit`, {
        method: "POST",
      });
      return;
    }
    if (order.fiscalInvoice?.status === "DRAFT") {
      await apiFetch(
        `/admin/fiscal/outbound/invoices/${order.fiscalInvoice.id}/transmit`,
        {
          method: "POST",
        },
      );
      return;
    }
    throw new Error("Pedido não elegível para emissão em lote.");
  }

  async function handleBatchEmit() {
    if (!hasOrderSelection || batchEmitBusy) return;

    const ok = await confirmAction({
      title: `Emitir NF-e de ${selectedBatchOrders.length} pedido(s)?`,
      message:
        "Para cada pedido selecionado: cria o rascunho (se ainda não houver) e transmite à SEFAZ. Falhas em um item não interrompem os demais.",
      confirmLabel: "Emitir em lote",
    });
    if (!ok) return;

    const targets = [...selectedBatchOrders];
    let success = 0;
    const failures: { label: string; error: string }[] = [];

    setBatchEmitProgress({ current: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i++) {
        const order = targets[i]!;
        setBatchEmitProgress({ current: i + 1, total: targets.length });
        const label = order.customer?.name ?? order.id.slice(0, 8);
        try {
          await emitAndTransmitOrder(order);
          success += 1;
        } catch (e) {
          failures.push({ label, error: getErrorMessage(e) });
        }
      }
    } finally {
      setBatchEmitProgress(null);
      setSelectedOrderIds(new Set());
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    }

    if (failures.length === 0) {
      notifySuccess(
        `${success} NF-e transmitida(s) com sucesso.`,
        "Emissão em lote",
      );
    } else if (success === 0) {
      notifyError(
        failures.map((f) => `${f.label}: ${f.error}`).join("\n"),
        "Nenhuma NF-e emitida",
      );
    } else {
      notifyError(
        `${success} ok · ${failures.length} falha(s):\n` +
          failures.map((f) => `${f.label}: ${f.error}`).join("\n"),
        "Emissão em lote parcial",
      );
    }
  }

  const { data: outboundInvoices = [], isFetching: fetchingOutboundInvoices } =
    useQuery({
      queryKey: [
        "admin",
        "fiscal",
        "outbound-invoices",
        debouncedOutboundInvoiceSearch,
      ],
      queryFn: () => {
        const qs = new URLSearchParams();
        if (debouncedOutboundInvoiceSearch.trim()) {
          qs.set("q", debouncedOutboundInvoiceSearch.trim());
        }
        const query = qs.toString();
        return apiFetch<FiscalInvoice[]>(
          `/admin/fiscal/outbound/invoices${query ? `?${query}` : ""}`,
        );
      },
      enabled: tab === "saida",
    });

  const { data: invoiceDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ["admin", "fiscal", "outbound-invoice", detailInvoiceId],
    queryFn: () =>
      apiFetch<FiscalInvoice>(
        `/admin/fiscal/outbound/invoices/${detailInvoiceId}`,
      ),
    enabled: tab === "saida" && Boolean(detailInvoiceId),
  });

  const { data: inboundInvoices = [] } = useQuery({
    queryKey: ["admin", "fiscal", "inbound-invoices"],
    queryFn: () => apiFetch<FiscalInvoice[]>("/admin/fiscal/inbound/invoices"),
    enabled: tab === "entrada",
  });

  const emitFromOrder = useMutation({
    mutationFn: (orderId: string) =>
      apiFetch(`/admin/fiscal/outbound/from-order/${orderId}`, {
        method: "POST",
      }),
    onSuccess: () => {
      notifySuccess("NF-e em rascunho criada com sucesso.");
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
    onError: (e) => notifyError(getErrorMessage(e), "Falha ao emitir NF-e"),
  });

  const transmit = useMutation({
    mutationFn: ({
      invoiceId,
      async: useAsync,
    }: {
      invoiceId: string;
      async?: boolean;
    }) =>
      apiFetch(`/admin/fiscal/outbound/invoices/${invoiceId}/transmit`, {
        method: "POST",
        body: JSON.stringify(useAsync ? { async: true } : {}),
      }),
    onSuccess: (_data, vars) => {
      notifySuccess(
        vars.async
          ? "NF-e enfileirada para transmissão."
          : "NF-e transmitida para a SEFAZ.",
      );
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
    onError: (e) =>
      notifyError(getErrorMessage(e), "Falha na transmissão da NF-e"),
  });

  const sendInvoiceEmail = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch<{ to: string }>(
        `/admin/fiscal/outbound/invoices/${invoiceId}/email`,
        { method: "POST", body: "{}" },
      ),
    onSuccess: (res) => {
      notifySuccess(`Enviado para ${res.to}`);
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
    onError: (e) => notifyError(getErrorMessage(e), "Falha ao enviar e-mail"),
  });

  const saveTransport = useMutation({
    mutationFn: ({
      invoiceId,
      ...body
    }: {
      invoiceId: string;
      modFrete?: string;
      freightAmount?: number | null;
      volumeQty?: number | null;
      grossWeightKg?: number | null;
      netWeightKg?: number | null;
    }) =>
      apiFetch(`/admin/fiscal/outbound/invoices/${invoiceId}/transport`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      notifySuccess("Transporte atualizado.");
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
    onError: (e) =>
      notifyError(getErrorMessage(e), "Falha ao salvar transporte"),
  });

  const requeueTransmit = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch(`/admin/fiscal/outbound/invoices/${invoiceId}/requeue`, {
        method: "POST",
      }),
    onSuccess: () => {
      notifySuccess("Reenfileirada para transmissão.");
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
    onError: (e) => notifyError(getErrorMessage(e), "Falha ao reenfileirar"),
  });

  const cancelOutbound = useMutation({
    mutationFn: ({
      invoiceId,
      justification,
    }: {
      invoiceId: string;
      justification: string;
    }) =>
      apiFetch(`/admin/fiscal/outbound/invoices/${invoiceId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ justification }),
      }),
    onSuccess: () => {
      notifySuccess("Cancelamento enviado.");
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
    onError: (e) => notifyError(getErrorMessage(e), "Falha no cancelamento"),
  });

  const sendCce = useMutation({
    mutationFn: ({
      invoiceId,
      correctionText,
    }: {
      invoiceId: string;
      correctionText: string;
    }) =>
      apiFetch(`/admin/fiscal/outbound/invoices/${invoiceId}/cce`, {
        method: "POST",
        body: JSON.stringify({ correctionText }),
      }),
    onSuccess: () => {
      notifySuccess("Carta de correção enviada à SEFAZ.");
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
    onError: (e) => notifyError(getErrorMessage(e), "Falha na CC-e"),
  });

  const consultSituation = useMutation({
    mutationFn: (invoiceId: string) =>
      apiFetch<{
        ok: boolean;
        cStat?: string;
        xMotivo?: string;
        nProt?: string;
      }>(`/admin/fiscal/outbound/invoices/${invoiceId}/consult`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      notifySuccess(
        `${res.cStat ?? "—"}: ${res.xMotivo ?? "Consulta concluída"}`,
        "Situação SEFAZ",
      );
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
    onError: (e) => notifyError(getErrorMessage(e), "Falha na consulta"),
  });

  const inutilizar = useMutation({
    mutationFn: (body: {
      numberStart: number;
      numberEnd: number;
      justification: string;
      establishmentId?: string;
    }) =>
      apiFetch<{ cStat?: string; xMotivo?: string }>(
        "/admin/fiscal/outbound/inutilizar",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: (res) => {
      notifySuccess(
        `${res.cStat ?? "OK"}: ${res.xMotivo ?? "Numeração inutilizada"}`,
        "Inutilização",
      );
      setInutForm({ numberStart: "", numberEnd: "", justification: "" });
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
    onError: (e) => notifyError(getErrorMessage(e), "Falha na inutilização"),
  });

  const cancelInbound = useMutation({
    mutationFn: ({
      invoiceId,
      justification,
    }: {
      invoiceId: string;
      justification: string;
    }) =>
      apiFetch(`/admin/fiscal/inbound/invoices/${invoiceId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ justification }),
      }),
    onSuccess: () => {
      notifySuccess("Cancelamento registrado.");
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
  });

  async function promptCancel(onConfirm: (justification: string) => void) {
    const justification = await promptAction({
      title: "Cancelar NF-e",
      message:
        "Informe a justificativa do cancelamento (mínimo 15 caracteres).",
      placeholder: "Motivo do cancelamento…",
      multiline: true,
      minLength: 15,
      confirmLabel: "Cancelar NF-e",
      variant: "destructive",
    });
    if (!justification) return;
    onConfirm(justification);
  }

  async function promptCce(invoiceId: string) {
    const correctionText = await promptAction({
      title: "Carta de correção (CC-e)",
      message:
        "Descreva a correção (15 a 1000 caracteres). Não altera valores, destinatário nem data.",
      placeholder: "Texto da correção…",
      multiline: true,
      minLength: 15,
      confirmLabel: "Enviar CC-e",
    });
    if (!correctionText) return;
    sendCce.mutate({ invoiceId, correctionText });
  }

  function canShowDanfe(status: FiscalInvoiceStatus) {
    return (
      status === "AUTHORIZED" || status === "IMPORTED" || status === "CANCELLED"
    );
  }

  async function handleDanfe(
    invoiceId: string,
    number: number | null,
    action: "download" | "print",
  ) {
    const path = `/admin/fiscal/invoices/${invoiceId}/danfe.pdf`;
    const filename = `danfe-${number ?? invoiceId.slice(0, 8)}.pdf`;
    try {
      if (action === "download") await downloadPdf(path, filename);
      else await printPdf(path);
    } catch (e) {
      notifyError(getErrorMessage(e), "Falha ao gerar DANFE");
    }
  }

  async function handleDownloadXml(
    invoiceId: string,
    number: number | null,
    kind: "authorized" | "signed" | "cancel",
  ) {
    const suffix =
      kind === "cancel"
        ? "cancelamento"
        : kind === "signed"
          ? "assinada"
          : "autorizada";
    const filename = `nfe-${suffix}-${number ?? invoiceId.slice(0, 8)}.xml`;
    try {
      await downloadXml(
        `/admin/fiscal/invoices/${invoiceId}/xml?kind=${kind}`,
        filename,
      );
    } catch (e) {
      notifyError(getErrorMessage(e), "Falha ao baixar XML");
    }
  }

  const importXml = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>("/admin/fiscal/inbound/import-xml", {
        method: "POST",
        body: JSON.stringify({ xml: xmlPaste }),
      }),
    onSuccess: (inv) => {
      setXmlPaste("");
      setXmlFileName(null);
      if (xmlFileInputRef.current) xmlFileInputRef.current.value = "";
      notifySuccess("NF-e de entrada importada com sucesso.");
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
      if (inv?.id) {
        setMappingInvoiceId(inv.id);
        setProductMappings({});
      }
    },
    onError: (e) => notifyError(getErrorMessage(e), "Falha ao importar NF-e"),
  });

  const syncDfe = useMutation({
    mutationFn: () =>
      apiFetch<{ message: string; imported?: number }>(
        "/admin/fiscal/inbound/sync",
        {
          method: "POST",
        },
      ),
    onSuccess: (res) => {
      notifySuccess(res.message ?? "Consulta DF-e concluída.");
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
  });

  const confirmImport = useMutation({
    mutationFn: () =>
      apiFetch(
        "/admin/fiscal/inbound/invoices/" +
          mappingInvoiceId +
          "/confirm-import",
        {
          method: "POST",
          body: JSON.stringify({ productMappings }),
        },
      ),
    onSuccess: () => {
      notifySuccess(
        "Importação confirmada (de-para e estoque, se configurado).",
      );
      setMappingInvoiceId(null);
      setProductMappings({});
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
  });

  const manifest = useMutation({
    mutationFn: ({
      accessKey,
      type,
    }: {
      accessKey: string;
      type: "CIENCIA" | "CONFIRMACAO" | "DESCONHECIMENTO" | "NAO_REALIZADA";
    }) =>
      apiFetch(`/admin/fiscal/inbound/${accessKey}/manifest`, {
        method: "POST",
        body: JSON.stringify({ type }),
      }),
    onSuccess: () => {
      notifySuccess("Manifestação enviada à SEFAZ.");
      void qc.invalidateQueries({ queryKey: ["admin", "fiscal"] });
    },
  });

  async function loadXmlFromFile(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xml")) {
      notifyError("Selecione um arquivo com extensão .xml");
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) {
        notifyError("O arquivo XML está vazio.");
        return;
      }
      setXmlPaste(text);
      setXmlFileName(file.name);
      notifySuccess(
        `Arquivo "${file.name}" carregado. Clique em Importar NF-e para concluir.`,
      );
    } catch {
      notifyError("Não foi possível ler o arquivo XML.");
    }
  }

  function onXmlDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    xmlDragDepthRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) setXmlDragActive(true);
  }

  function onXmlDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    xmlDragDepthRef.current -= 1;
    if (xmlDragDepthRef.current <= 0) {
      xmlDragDepthRef.current = 0;
      setXmlDragActive(false);
    }
  }

  function onXmlDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }

  function onXmlDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    xmlDragDepthRef.current = 0;
    setXmlDragActive(false);
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.name.toLowerCase().endsWith(".xml"),
    );
    if (!file) {
      notifyError("Solte um arquivo .xml");
      return;
    }
    void loadXmlFromFile(file);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "saida", label: "NF-e de Saída" },
    { id: "entrada", label: "NF-e de Entrada" },
    { id: "cadastros", label: "CFOP" },
    { id: "config", label: "Configurações" },
    { id: "historico", label: "Histórico" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Faturamento</h1>
      </div>

      {certBanner && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            certBanner.tone === "destructive" &&
              "border-destructive/40 bg-destructive/10 text-destructive",
            certBanner.tone === "warning" &&
              "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
            certBanner.tone === "info" &&
              "border-border bg-muted/50 text-foreground",
          )}
        >
          {certBanner.text}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setTab("config")}
          >
            Abrir configurações
          </button>
          <Link
            to="/configuracoes/estabelecimentos"
            className="ml-2 underline"
          >
            Configurar em Estabelecimentos
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "saida" && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-medium">Pedidos confirmados</h2>

            <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {hasOrderSelection
                  ? `${selectedBatchOrders.length} pedido(s) selecionado(s)`
                  : batchableIds.length > 0
                    ? "Selecione pedidos prontos para emitir ou transmitir NF-e em lote"
                    : "Nenhum pedido elegível para emissão em lote no momento"}
              </p>
              <Button
                type="button"
                size="sm"
                disabled={!hasOrderSelection || batchEmitBusy}
                onClick={() => void handleBatchEmit()}
              >
                {batchEmitProgress
                  ? `Emitindo ${batchEmitProgress.current}/${batchEmitProgress.total}…`
                  : "Emitir NF-e em lote"}
              </Button>
            </div>

            {loadingOrders ? (
              <p className="text-muted-foreground">Carregando…</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-background text-left text-muted-foreground">
                    <tr>
                      <th className="w-10 px-4 py-3">
                        <Checkbox
                          checked={selectAllState(
                            allBatchableSelected,
                            someBatchableSelected,
                          )}
                          disabled={batchableIds.length === 0 || batchEmitBusy}
                          onCheckedChange={(v) =>
                            toggleAllBatchable(v === true)
                          }
                          aria-label="Selecionar todos os elegíveis"
                        />
                      </th>
                      <th className="px-4 py-3">Pedido</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Vendedor</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">NF-e</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleOrders.map((o) => {
                      const batchable = isBatchEmitable(o);
                      const selected = selectedOrderIds.has(o.id);
                      return (
                        <tr
                          key={o.id}
                          className={cn(
                            "border-t border-border",
                            selected && "bg-muted/40",
                          )}
                        >
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={selected}
                              disabled={!batchable || batchEmitBusy}
                              onCheckedChange={(v) =>
                                toggleOrder(o.id, v === true)
                              }
                              aria-label={`Selecionar pedido ${formatOrderCode(o)}`}
                            />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {formatOrderCode(o)}
                          </td>
                          <td className="px-4 py-3">
                            {o.customer?.name ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {o.seller?.user.name ?? "VENDA DIRETA"}
                          </td>
                          <td className="px-4 py-3">
                            R$ {Number(o.totalAmount).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            {o.fiscalStatus === "NONE"
                              ? "Sem nota"
                              : FISCAL_INVOICE_STATUS_LABELS[
                                  o.fiscalStatus as FiscalInvoiceStatus
                                ]}
                          </td>
                          <td className="px-4 py-3">
                            {o.fiscalStatus === "NONE" ? (
                              <div className="space-y-1">
                                {o.readinessIssues &&
                                  o.readinessIssues.length > 0 && (
                                    <div className="max-w-xs rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-200">
                                      <p className="font-medium">
                                        Pendências para emitir:
                                      </p>
                                      <ul className="mt-1 list-inside list-disc">
                                        {o.readinessIssues.map((i) => (
                                          <li key={i.code + i.message}>
                                            {i.message}
                                          </li>
                                        ))}
                                      </ul>
                                      {o.readinessIssues.some(
                                        (i) => i.code === "NO_IBGE",
                                      ) && o.customer?.id ? (
                                        <Button
                                          asChild
                                          variant="outline"
                                          size="sm"
                                          className="mt-2"
                                        >
                                          <Link to="/clientes">
                                            Corrigir cadastro
                                          </Link>
                                        </Button>
                                      ) : null}
                                    </div>
                                  )}
                                <Button
                                  size="sm"
                                  disabled={
                                    emitFromOrder.isPending ||
                                    o.canEmit === false ||
                                    batchEmitBusy
                                  }
                                  onClick={() => emitFromOrder.mutate(o.id)}
                                >
                                  Emitir NF-e
                                </Button>
                              </div>
                            ) : o.fiscalInvoice?.status === "DRAFT" ? (
                              <div className="space-y-1">
                                {o.readinessIssues &&
                                  o.readinessIssues.length > 0 && (
                                    <div className="max-w-xs rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-200">
                                      <p className="font-medium">
                                        Checklist antes de transmitir:
                                      </p>
                                      <ul className="mt-1 list-inside list-disc">
                                        {o.readinessIssues.map((i) => (
                                          <li key={i.code + i.message}>
                                            {i.message}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                <Button
                                  size="sm"
                                  disabled={
                                    transmit.isPending ||
                                    batchEmitBusy ||
                                    (o.readinessIssues?.length ?? 0) > 0
                                  }
                                  onClick={() =>
                                    transmit.mutate({
                                      invoiceId: o.fiscalInvoice!.id,
                                    })
                                  }
                                >
                                  Transmitir
                                </Button>
                              </div>
                            ) : o.fiscalInvoice?.status === "REJECTED" ? (
                              <Button
                                size="sm"
                                disabled={transmit.isPending || batchEmitBusy}
                                onClick={() =>
                                  transmit.mutate({
                                    invoiceId: o.fiscalInvoice!.id,
                                  })
                                }
                              >
                                Reenviar à SEFAZ
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-medium">NF-e emitidas</h2>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Input
                value={outboundInvoiceSearch}
                onChange={(e) => setOutboundInvoiceSearch(e.target.value)}
                placeholder="Buscar por nº da nota, cliente ou pedido…"
                className="max-w-md"
                aria-label="Buscar NF-e de saída"
              />
              {fetchingOutboundInvoices ? (
                <span className="text-xs text-muted-foreground">Buscando…</span>
              ) : outboundInvoiceSearch.trim() ? (
                <span className="text-xs text-muted-foreground">
                  {outboundInvoices.length} resultado(s)
                </span>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-background text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Nº</th>
                    <th className="px-4 py-3">Pedido</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Chave</th>
                    <th className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {outboundInvoices.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-6 text-muted-foreground"
                      >
                        {outboundInvoiceSearch.trim()
                          ? "Nenhuma NF-e encontrada para a busca."
                          : "Nenhuma NF-e emitida ainda."}
                      </td>
                    </tr>
                  ) : (
                    outboundInvoices.map((inv) => {
                      const customerLabel =
                        inv.order?.customer?.tradeName ||
                        inv.order?.customer?.name ||
                        inv.order?.customer?.legalName ||
                        "—";
                      const orderLabel = inv.order
                        ? formatOrderCode(inv.order)
                        : "—";
                      return (
                        <tr
                          key={inv.id}
                          className={cn(
                            "border-t border-border",
                            detailInvoiceId === inv.id && "bg-muted/40",
                          )}
                        >
                          <td className="px-4 py-3">
                            {inv.series}/{inv.number}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {orderLabel}
                          </td>
                          <td className="px-4 py-3">{customerLabel}</td>
                          <td className="px-4 py-3">
                            <div>
                              {FISCAL_INVOICE_STATUS_LABELS[inv.status]}
                              {nfeTpEmisLabel(inv.tpEmis) ? (
                                <p className="mt-0.5 text-xs font-medium text-amber-800 dark:text-amber-400">
                                  {nfeTpEmisLabel(inv.tpEmis)}
                                </p>
                              ) : null}
                              {inv.transmitJobs?.[0] &&
                              (inv.transmitJobs[0].status === "PENDING" ||
                                inv.transmitJobs[0].status === "RUNNING" ||
                                inv.transmitJobs[0].status === "FAILED") ? (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {
                                    JOB_STATUS_LABELS[
                                      inv.transmitJobs[0].status
                                    ]
                                  }
                                  {inv.transmitJobs[0].lastError
                                    ? ` — ${inv.transmitJobs[0].lastError.slice(0, 80)}`
                                    : ""}
                                </p>
                              ) : null}
                              {inv.status === "REJECTED" &&
                              inv.rejectionReason ? (
                                <p className="mt-1 max-w-xs whitespace-pre-line text-xs text-destructive">
                                  {inv.rejectionReason}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            R$ {Number(inv.totalAmount).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {inv.accessKey?.slice(0, 12) ?? "—"}…
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setDetailInvoiceId(
                                    detailInvoiceId === inv.id ? null : inv.id,
                                  )
                                }
                              >
                                {detailInvoiceId === inv.id
                                  ? "Fechar"
                                  : "Detalhes"}
                              </Button>
                              {(inv.status === "AUTHORIZED" ||
                                inv.status === "CANCELLED" ||
                                inv.status === "REJECTED") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void handleDownloadXml(
                                      inv.id,
                                      inv.number,
                                      inv.status === "CANCELLED"
                                        ? "cancel"
                                        : inv.status === "REJECTED"
                                          ? "signed"
                                          : "authorized",
                                    )
                                  }
                                >
                                  XML
                                </Button>
                              )}
                              {canShowDanfe(inv.status) && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      void handleDanfe(
                                        inv.id,
                                        inv.number,
                                        "download",
                                      )
                                    }
                                  >
                                    DANFE
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      void handleDanfe(
                                        inv.id,
                                        inv.number,
                                        "print",
                                      )
                                    }
                                  >
                                    Imprimir
                                  </Button>
                                </>
                              )}
                              {(inv.status === "DRAFT" ||
                                inv.status === "REJECTED") && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={transmit.isPending}
                                    onClick={() =>
                                      transmit.mutate({ invoiceId: inv.id })
                                    }
                                  >
                                    {inv.status === "REJECTED"
                                      ? "Reenviar"
                                      : "Transmitir"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={transmit.isPending}
                                    onClick={() =>
                                      transmit.mutate({
                                        invoiceId: inv.id,
                                        async: true,
                                      })
                                    }
                                  >
                                    Fila
                                  </Button>
                                </>
                              )}
                              {inv.transmitJobs?.[0]?.status === "FAILED" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={requeueTransmit.isPending}
                                  onClick={() => requeueTransmit.mutate(inv.id)}
                                >
                                  Reenfileirar
                                </Button>
                              )}
                              {inv.status === "AUTHORIZED" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={sendInvoiceEmail.isPending}
                                    onClick={() =>
                                      sendInvoiceEmail.mutate(inv.id)
                                    }
                                  >
                                    E-mail
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={sendCce.isPending}
                                    onClick={() => void promptCce(inv.id)}
                                  >
                                    CC-e
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={consultSituation.isPending}
                                    onClick={() =>
                                      consultSituation.mutate(inv.id)
                                    }
                                  >
                                    Atualizar situação
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive"
                                    disabled={cancelOutbound.isPending}
                                    onClick={() =>
                                      promptCancel((justification) =>
                                        cancelOutbound.mutate({
                                          invoiceId: inv.id,
                                          justification,
                                        }),
                                      )
                                    }
                                  >
                                    Cancelar
                                  </Button>
                                </>
                              )}
                              {(inv.status === "AUTHORIZED" ||
                                inv.status === "CANCELLED" ||
                                inv.status === "REJECTED") &&
                                inv.accessKey &&
                                inv.status !== "AUTHORIZED" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={consultSituation.isPending}
                                    onClick={() =>
                                      consultSituation.mutate(inv.id)
                                    }
                                  >
                                    Atualizar situação
                                  </Button>
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {detailInvoiceId ? (
              <div className="mt-4 rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-medium">
                    Detalhe da NF-e{" "}
                    {invoiceDetail
                      ? `${invoiceDetail.series}/${invoiceDetail.number}`
                      : ""}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(invoiceDetail?.status === "AUTHORIZED" ||
                      invoiceDetail?.xmlAuthorized) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void handleDownloadXml(
                            detailInvoiceId,
                            invoiceDetail?.number ?? null,
                            "authorized",
                          )
                        }
                      >
                        Baixar XML autorizado
                      </Button>
                    )}
                    {(invoiceDetail?.xmlSigned ||
                      invoiceDetail?.status === "REJECTED" ||
                      invoiceDetail?.status === "AUTHORIZED") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void handleDownloadXml(
                            detailInvoiceId,
                            invoiceDetail?.number ?? null,
                            "signed",
                          )
                        }
                      >
                        Baixar XML assinado
                      </Button>
                    )}
                    {invoiceDetail?.status === "CANCELLED" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void handleDownloadXml(
                            detailInvoiceId,
                            invoiceDetail?.number ?? null,
                            "cancel",
                          )
                        }
                      >
                        Baixar XML cancelamento
                      </Button>
                    ) : null}
                    {(invoiceDetail?.status === "AUTHORIZED" ||
                      invoiceDetail?.status === "CANCELLED") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sendInvoiceEmail.isPending}
                        onClick={() => sendInvoiceEmail.mutate(detailInvoiceId)}
                      >
                        Enviar por e-mail
                      </Button>
                    )}
                  </div>
                </div>
                {loadingDetail ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : invoiceDetail ? (
                  <div className="space-y-3">
                    {invoiceDetail.rejectionReason ? (
                      <p className="whitespace-pre-line rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {invoiceDetail.rejectionReason}
                      </p>
                    ) : null}
                    <p className="font-mono text-xs text-muted-foreground">
                      Chave: {invoiceDetail.accessKey ?? "—"}
                    </p>
                    {nfeTpEmisLabel(invoiceDetail.tpEmis) ? (
                      <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100">
                        Emitida em {nfeTpEmisLabel(invoiceDetail.tpEmis)}
                        {invoiceDetail.contingencyJustification
                          ? ` — ${invoiceDetail.contingencyJustification}`
                          : ""}
                      </p>
                    ) : null}
                    {(invoiceDetail.status === "DRAFT" ||
                      invoiceDetail.status === "REJECTED") && (
                      <div className="rounded-lg border border-border p-3">
                        <h4 className="mb-2 text-sm font-medium">Transporte</h4>
                        <FormGrid>
                          <FormField label="modFrete (0–9)">
                            <Input
                              defaultValue={invoiceDetail.modFrete ?? "9"}
                              id={`modFrete-${invoiceDetail.id}`}
                            />
                          </FormField>
                          <FormField label="Volumes">
                            <Input
                              type="number"
                              step="0.0001"
                              defaultValue={
                                invoiceDetail.volumeQty != null
                                  ? String(invoiceDetail.volumeQty)
                                  : ""
                              }
                              id={`volumeQty-${invoiceDetail.id}`}
                            />
                          </FormField>
                          <FormField label="Peso bruto (kg)">
                            <Input
                              type="number"
                              step="0.001"
                              defaultValue={
                                invoiceDetail.grossWeightKg != null
                                  ? String(invoiceDetail.grossWeightKg)
                                  : ""
                              }
                              id={`grossWeight-${invoiceDetail.id}`}
                            />
                          </FormField>
                          <FormField label="Peso líquido (kg)">
                            <Input
                              type="number"
                              step="0.001"
                              defaultValue={
                                invoiceDetail.netWeightKg != null
                                  ? String(invoiceDetail.netWeightKg)
                                  : ""
                              }
                              id={`netWeight-${invoiceDetail.id}`}
                            />
                          </FormField>
                          <FormField label="Frete (R$)">
                            <Input
                              type="number"
                              step="0.01"
                              defaultValue={
                                invoiceDetail.freightAmount != null
                                  ? String(invoiceDetail.freightAmount)
                                  : ""
                              }
                              id={`freight-${invoiceDetail.id}`}
                            />
                          </FormField>
                        </FormGrid>
                        <Button
                          className="mt-3"
                          size="sm"
                          disabled={saveTransport.isPending}
                          onClick={() => {
                            const mod =
                              (
                                document.getElementById(
                                  `modFrete-${invoiceDetail.id}`,
                                ) as HTMLInputElement | null
                              )?.value ?? "9";
                            const vol = (
                              document.getElementById(
                                `volumeQty-${invoiceDetail.id}`,
                              ) as HTMLInputElement | null
                            )?.value;
                            const gross = (
                              document.getElementById(
                                `grossWeight-${invoiceDetail.id}`,
                              ) as HTMLInputElement | null
                            )?.value;
                            const net = (
                              document.getElementById(
                                `netWeight-${invoiceDetail.id}`,
                              ) as HTMLInputElement | null
                            )?.value;
                            const frete = (
                              document.getElementById(
                                `freight-${invoiceDetail.id}`,
                              ) as HTMLInputElement | null
                            )?.value;
                            saveTransport.mutate({
                              invoiceId: invoiceDetail.id,
                              modFrete: mod.slice(0, 1),
                              volumeQty: vol ? Number(vol) : null,
                              grossWeightKg: gross ? Number(gross) : null,
                              netWeightKg: net ? Number(net) : null,
                              freightAmount: frete ? Number(frete) : null,
                            });
                          }}
                        >
                          Salvar transporte
                        </Button>
                      </div>
                    )}
                    <div>
                      <h4 className="mb-2 text-sm font-medium">
                        Histórico de eventos
                      </h4>
                      {(invoiceDetail.events?.length ?? 0) === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhum evento registrado.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {(invoiceDetail.events ?? []).map((ev) => (
                            <li
                              key={ev.id}
                              className="rounded-lg border border-border px-3 py-2 text-sm"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium">
                                  {EVENT_TYPE_LABELS[ev.eventType] ??
                                    ev.eventType}
                                </span>
                                <span
                                  className={
                                    ev.success
                                      ? "text-xs text-emerald-600"
                                      : "text-xs text-destructive"
                                  }
                                >
                                  {ev.success ? "OK" : "Falha"}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {new Date(ev.createdAt).toLocaleString("pt-BR")}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nota não encontrada.
                  </p>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )}

      {tab === "entrada" && (
        <div className="space-y-6">
          <FormSection title="Consultar SEFAZ (DF-e)">
            <p className="mb-3 text-sm text-muted-foreground">
              Busca notas emitidas contra o CNPJ da empresa (Distribuição DF-e).
              Requer certificado A1.
            </p>
            <Button
              disabled={syncDfe.isPending}
              onClick={() => syncDfe.mutate()}
            >
              {syncDfe.isPending ? "Consultando…" : "Consultar DF-e na SEFAZ"}
            </Button>
          </FormSection>

          <FormSection title="Importar XML manualmente">
            <p className="mb-3 text-sm text-muted-foreground">
              O padrão fiscal é o <strong>XML da NF-e</strong> (arquivo .xml),
              não o PDF do DANFE. Arraste o arquivo, selecione no computador ou
              cole o conteúdo — após importar, o sistema gera o DANFE no layout
              oficial.
            </p>

            <div
              role="button"
              tabIndex={0}
              aria-label="Área para arrastar ou selecionar arquivo XML da NF-e"
              className={cn(
                "mb-4 cursor-pointer rounded-xl border border-dashed p-6 text-center transition-colors",
                xmlDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background hover:border-primary/50 hover:bg-muted/30",
              )}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                xmlFileInputRef.current?.click();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  xmlFileInputRef.current?.click();
                }
              }}
              onDragEnter={onXmlDragEnter}
              onDragLeave={onXmlDragLeave}
              onDragOver={onXmlDragOver}
              onDrop={onXmlDrop}
            >
              <input
                ref={xmlFileInputRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void loadXmlFromFile(file);
                }}
              />
              <p className="text-sm font-medium">
                {xmlDragActive
                  ? "Solte o arquivo XML aqui"
                  : "Arraste o arquivo .xml para esta área"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">ou</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    xmlFileInputRef.current?.click();
                  }}
                >
                  Escolher arquivo…
                </Button>
                {xmlFileName ? (
                  <span className="text-sm text-muted-foreground">
                    Selecionado:{" "}
                    <span className="font-medium text-foreground">
                      {xmlFileName}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Nenhum arquivo selecionado
                  </span>
                )}
              </div>
            </div>

            <p className="mb-2 text-sm font-medium">Ou cole o XML abaixo</p>
            <textarea
              className={`${fieldControlClass} min-h-[120px] w-full font-mono text-xs`}
              placeholder="Cole o XML da NF-e de entrada aqui…"
              value={xmlPaste}
              onChange={(e) => {
                setXmlPaste(e.target.value);
                if (e.target.value.trim() && !xmlFileName) return;
                if (!e.target.value.trim()) {
                  setXmlFileName(null);
                  if (xmlFileInputRef.current)
                    xmlFileInputRef.current.value = "";
                }
              }}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                disabled={importXml.isPending || !xmlPaste.trim()}
                onClick={() => importXml.mutate()}
              >
                {importXml.isPending ? "Importando…" : "Importar NF-e"}
              </Button>
              {xmlPaste.trim() ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={importXml.isPending}
                  onClick={() => {
                    setXmlPaste("");
                    setXmlFileName(null);
                    if (xmlFileInputRef.current)
                      xmlFileInputRef.current.value = "";
                  }}
                >
                  Limpar
                </Button>
              ) : null}
            </div>
            {settings?.autoStockOnInboundInvoice ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Estoque automático ativo — confirme o de-para dos produtos após
                importar.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Estoque automático desligado — apenas registro fiscal.
              </p>
            )}
          </FormSection>

          {mappingInvoiceId ? (
            <FormSection title="De-para de produtos (confirmação)">
              <p className="mb-3 text-sm text-muted-foreground">
                Vincule cada item da NF-e a um produto interno. Necessário para
                estoque automático.
              </p>
              {(
                inboundInvoices.find((i) => i.id === mappingInvoiceId)?.items ??
                []
              ).map((item) => (
                <div key={item.id} className="mb-3 grid gap-2 sm:grid-cols-2">
                  <div className="text-sm">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-muted-foreground">
                      Qtd: {String(item.quantity)}
                    </p>
                  </div>
                  <AppSelect
                    value={productMappings[item.id] ?? item.productId ?? ""}
                    onValueChange={(v) =>
                      setProductMappings((prev) => ({
                        ...prev,
                        [item.id]: v,
                      }))
                    }
                    emptyLabel="Sem vínculo"
                    placeholder="Sem vínculo"
                    options={products.map((p) => ({
                      value: p.id,
                      label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
                    }))}
                  />
                </div>
              ))}
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={confirmImport.isPending}
                  onClick={() => confirmImport.mutate()}
                >
                  {confirmImport.isPending
                    ? "Confirmando…"
                    : "Confirmar importação"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setMappingInvoiceId(null)}
                >
                  Fechar
                </Button>
              </div>
            </FormSection>
          ) : null}

          <section>
            <h2 className="mb-3 text-lg font-medium">
              Notas de entrada registradas
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-background text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Fornecedor</th>
                    <th className="px-4 py-3">Nº</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Estoque</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {inboundInvoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        {inv.supplier?.tradeName ??
                          inv.supplier?.legalName ??
                          "—"}
                      </td>
                      <td className="px-4 py-3">
                        {inv.series}/{inv.number}
                      </td>
                      <td className="px-4 py-3">
                        R$ {Number(inv.totalAmount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        {inv.stockApplied ? "Aplicado" : "Não"}
                      </td>
                      <td className="px-4 py-3">
                        {FISCAL_INVOICE_STATUS_LABELS[inv.status]}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {canShowDanfe(inv.status) && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void handleDanfe(
                                    inv.id,
                                    inv.number,
                                    "download",
                                  )
                                }
                              >
                                DANFE
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  void handleDanfe(inv.id, inv.number, "print")
                                }
                              >
                                Imprimir
                              </Button>
                            </>
                          )}
                          {(inv.status === "IMPORTED" ||
                            inv.status === "AUTHORIZED") &&
                            !inv.stockApplied && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setMappingInvoiceId(inv.id);
                                  const initial: Record<string, string> = {};
                                  for (const it of inv.items) {
                                    if (it.productId)
                                      initial[it.id] = it.productId;
                                  }
                                  setProductMappings(initial);
                                }}
                              >
                                De-para
                              </Button>
                            )}
                          {inv.accessKey &&
                            (inv.status === "IMPORTED" ||
                              inv.status === "DRAFT") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={manifest.isPending}
                                onClick={() =>
                                  manifest.mutate({
                                    accessKey: inv.accessKey!,
                                    type: "CIENCIA",
                                  })
                                }
                              >
                                Ciência
                              </Button>
                            )}
                          {(inv.status === "IMPORTED" ||
                            inv.status === "AUTHORIZED") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={cancelInbound.isPending}
                              onClick={() =>
                                promptCancel((justification) =>
                                  cancelInbound.mutate({
                                    invoiceId: inv.id,
                                    justification,
                                  }),
                                )
                              }
                            >
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "cadastros" && <FiscalCadastrosPanel />}

      {tab === "historico" && (
        <div className="space-y-6">
          <div className="surface-card p-6">
            <AuditLogPanel
              title="Histórico de NF-e"
              entityType="FiscalInvoice"
              take={50}
            />
          </div>
          <div className="surface-card p-6">
            <AuditLogPanel
              title="Histórico de configuração fiscal"
              entityType="FiscalConfig"
              take={30}
            />
          </div>
        </div>
      )}

      {tab === "config" && (
        <div className="space-y-6">
          <FormSection title="Emitente, certificado e logo">
            <p className="text-sm text-muted-foreground">
              A configuração do emitente (CNPJ, endereço, regime, ambiente NF-e,
              série), certificado A1 e logo do DANFE é feita por estabelecimento
              em{" "}
              <Link
                to="/configuracoes/estabelecimentos"
                className="font-medium text-primary underline"
              >
                Configurações → Estabelecimentos
              </Link>
              . Cada CNPJ precisa do seu certificado e dados fiscais para emitir
              NF-e.
            </p>
            {activeEstablishmentId ? (
              <p className="mt-2 text-sm text-muted-foreground">
                O CNPJ ativo no header é usado para alertas de certificado e
                opções de entrada nesta página.
              </p>
            ) : null}
          </FormSection>

          <FormSection title="Inutilizar numeração NF-e">
            <p className="mb-3 text-sm text-muted-foreground">
              Inutiliza faixa de números não usados na série do CNPJ ativo no
              header (SEFAZ). Justificativa mínima de 15 caracteres.
            </p>
            <FormGrid>
              <FormField label="Número inicial">
                <Input
                  type="number"
                  min={1}
                  value={inutForm.numberStart}
                  onChange={(e) =>
                    setInutForm({ ...inutForm, numberStart: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Número final">
                <Input
                  type="number"
                  min={1}
                  value={inutForm.numberEnd}
                  onChange={(e) =>
                    setInutForm({ ...inutForm, numberEnd: e.target.value })
                  }
                />
              </FormField>
            </FormGrid>
            <FormField label="Justificativa" className="mt-3">
              <textarea
                className={`${fieldControlClass} min-h-[80px] w-full`}
                value={inutForm.justification}
                onChange={(e) =>
                  setInutForm({ ...inutForm, justification: e.target.value })
                }
                placeholder="Motivo da inutilização…"
              />
            </FormField>
            <Button
              className="mt-3"
              disabled={
                inutilizar.isPending ||
                !inutForm.numberStart ||
                !inutForm.numberEnd ||
                inutForm.justification.trim().length < 15
              }
              onClick={() =>
                inutilizar.mutate({
                  numberStart: Number(inutForm.numberStart),
                  numberEnd: Number(inutForm.numberEnd),
                  justification: inutForm.justification.trim(),
                  establishmentId: activeEstablishmentId ?? undefined,
                })
              }
            >
              {inutilizar.isPending ? "Enviando…" : "Inutilizar numeração"}
            </Button>
          </FormSection>
        </div>
      )}
    </div>
  );
}
