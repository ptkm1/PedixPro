import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtMoney } from "../../components/atoms/formatMoney";
import { useConfirm } from "../../context/ConfirmContext";
import {
  getOfflineSaleRow,
  updateOfflineSalePayload,
} from "../../lib/offline-outbox";
import type { OfflineSaleQueuePayload } from "../../lib/offline-sale-types";
import {
  fetchSellerProductsBase,
  SELLER_PRODUCTS_BASE_KEY,
  sellerOfflineStaleTime,
} from "../../lib/seller-offline-queries";
import { useOfflineOutboxCounts } from "../../lib/useOfflineOutboxCounts";
import { useOrderSyncMode } from "../useOrderSyncMode";

export type EditableQueueLine = {
  productId: string;
  name: string;
  quantity: number;
  discountPercent: number;
  unitPrice: number;
};

function parseNameFromSummary(summary: string | undefined, fallback: string) {
  if (!summary) return fallback;
  const idx = summary.indexOf(" × ");
  if (idx > 0) return summary.slice(0, idx).trim() || fallback;
  return fallback;
}

function parseUnitPriceFromSummary(
  summary: string | undefined,
  qty: number,
): number {
  if (!summary || qty <= 0) return 0;
  const m = summary.match(/R\$\s*([\d]+(?:,\d+)?)/);
  if (!m) return 0;
  const lineTotal = Number(m[1].replace(",", "."));
  if (!Number.isFinite(lineTotal)) return 0;
  return lineTotal / qty;
}

function navigateAwayFromOfflineEdit(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/(tabs)/vendas/offline-queue");
  }
}

export function useOfflineEditScreen(localId: string) {
  const router = useRouter();
  const { alert } = useConfirm();
  const { settings, isLoading: settingsLoading } = useOrderSyncMode();
  const canEditQueued = settings?.sellerCanEditQueuedSales === true;
  const { refresh } = useOfflineOutboxCounts();
  const [lines, setLines] = useState<EditableQueueLine[]>([]);
  const [basePayload, setBasePayload] =
    useState<OfflineSaleQueuePayload | null>(null);
  const [customerLabel, setCustomerLabel] = useState<string | undefined>();
  const [paymentConditionLabel, setPaymentConditionLabel] = useState<
    string | undefined
  >();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const leaveOfflineEdit = useCallback(
    async (message: string) => {
      await alert({
        title: "Edição indisponível",
        description: message,
      });
      navigateAwayFromOfflineEdit(router);
    },
    [alert, router],
  );

  const { data: products } = useQuery({
    queryKey: SELLER_PRODUCTS_BASE_KEY,
    queryFn: fetchSellerProductsBase,
    staleTime: sellerOfflineStaleTime,
  });

  const productById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; unitPrice: number; maxDiscount: number }
    >();
    for (const p of products ?? []) {
      const unit =
        typeof p.effectiveUnitPrice === "number"
          ? p.effectiveUnitPrice
          : typeof p.catalogUnitPrice === "number"
            ? p.catalogUnitPrice
            : Number(p.basePrice) || 0;
      const maxFromEff = Number(p.maxSellerDiscountPercentEffective);
      const maxFromProd = Number(p.maxSellerDiscountPercent);
      const maxDiscount = Number.isFinite(maxFromEff)
        ? Math.min(100, Math.max(0, maxFromEff))
        : Number.isFinite(maxFromProd)
          ? Math.min(100, Math.max(0, maxFromProd))
          : 0;
      map.set(p.id, { name: p.name, unitPrice: unit, maxDiscount });
    }
    return map;
  }, [products]);

  useEffect(() => {
    if (!localId) {
      void leaveOfflineEdit("Pedido inválido.");
      setLoading(false);
      setLoadError("Pedido inválido.");
      return;
    }
    if (settingsLoading) return;

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        if (!canEditQueued) {
          if (cancelled) return;
          const msg =
            "A edição de pedidos na fila está desativada para esta organização.";
          setLoadError(msg);
          await leaveOfflineEdit(msg);
          return;
        }

        const row = await getOfflineSaleRow(localId);
        if (cancelled) return;
        if (!row) {
          // Já sincronizado (removido do outbox) ou apagado — não há edição.
          const msg =
            "Este pedido já foi sincronizado ou removido da fila e não pode mais ser editado.";
          setLoadError(msg);
          await leaveOfflineEdit(msg);
          return;
        }
        if (row.state !== "queued" && row.state !== "dead") {
          let msg = "Pedidos já sincronizados não podem ser editados.";
          if (row.state === "syncing") {
            msg =
              "Este pedido está sendo enviado e não pode ser editado.";
          }
          setLoadError(msg);
          await leaveOfflineEdit(msg);
          return;
        }
        setBasePayload(row.payload);
        setCustomerLabel(row.payload.snapshot?.customerLabel);
        setPaymentConditionLabel(row.payload.snapshot?.paymentConditionLabel);
        const summaries = row.payload.snapshot?.lineSummaries ?? [];
        setLines(
          row.payload.items.map((item, idx) => {
            const cached = productById.get(item.productId);
            const summary = summaries[idx];
            const name =
              cached?.name ??
              parseNameFromSummary(summary, item.productId);
            const unitPrice =
              cached?.unitPrice && cached.unitPrice > 0
                ? cached.unitPrice
                : parseUnitPriceFromSummary(summary, item.quantity);
            return {
              productId: item.productId,
              name,
              quantity: item.quantity,
              discountPercent: item.discountPercent ?? 0,
              unitPrice,
            };
          }),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // productById intentionally delayed: first paint from snapshot; refresh names when cache arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per localId; names patched below
  }, [localId, canEditQueued, settingsLoading, leaveOfflineEdit]);

  useEffect(() => {
    if (productById.size === 0) return;
    setLines((prev) =>
      prev.map((line) => {
        const cached = productById.get(line.productId);
        if (!cached) return line;
        return {
          ...line,
          name: cached.name || line.name,
          unitPrice:
            cached.unitPrice > 0 ? cached.unitPrice : line.unitPrice,
        };
      }),
    );
  }, [productById]);

  const cartTotal = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const disc = Math.min(100, Math.max(0, l.discountPercent)) / 100;
        return sum + l.unitPrice * l.quantity * (1 - disc);
      }, 0),
    [lines],
  );

  const setQty = useCallback((productId: string, qty: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, quantity: Math.max(1, Math.floor(qty)) }
          : l,
      ),
    );
  }, []);

  const removeLine = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const save = useCallback(async () => {
    if (!basePayload) return;
    if (lines.length === 0) {
      await alert({
        title: "Carrinho vazio",
        description: "Inclua ao menos um item ou apague o pedido na fila.",
      });
      return;
    }
    setSaving(true);
    try {
      const items = lines.map((l) => {
        const prev = basePayload.items.find((i) => i.productId === l.productId);
        const maxDisc = productById.get(l.productId)?.maxDiscount ?? 0;
        const rawDisc = Math.min(100, Math.max(0, l.discountPercent));
        const disc = Math.min(rawDisc, maxDisc);
        return {
          productId: l.productId,
          quantity: l.quantity,
          ...(disc > 0 ? { discountPercent: disc } : {}),
          ...(prev?.priceTableId ? { priceTableId: prev.priceTableId } : {}),
        };
      });
      const lineSummaries = lines.map((l) => {
        const disc = Math.min(100, Math.max(0, l.discountPercent)) / 100;
        const lineTotal = l.unitPrice * l.quantity * (1 - disc);
        return `${l.name} × ${l.quantity} · R$ ${fmtMoney(lineTotal)}`;
      });
      const next: OfflineSaleQueuePayload = {
        ...basePayload,
        items,
        snapshot: {
          customerLabel,
          paymentConditionLabel,
          lineSummaries,
          cartTotalApprox: cartTotal,
        },
      };
      const ok = await updateOfflineSalePayload(localId, next);
      if (!ok) {
        await alert({
          title: "Não foi possível salvar",
          description:
            "O pedido pode ter sido sincronizado ou removido. Após o envio, a edição não é mais permitida.",
          tone: "danger",
        });
        navigateAwayFromOfflineEdit(router);
        return;
      }
      refresh();
      router.back();
    } finally {
      setSaving(false);
    }
  }, [
    productById,
    alert,
    basePayload,
    lines,
    customerLabel,
    paymentConditionLabel,
    cartTotal,
    localId,
    refresh,
    router,
  ]);

  return {
    loading,
    loadError,
    saving,
    lines,
    customerLabel,
    cartTotal,
    setQty,
    removeLine,
    save,
    goBack: () => router.back(),
  };
}
