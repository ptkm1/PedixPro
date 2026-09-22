import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useConfirm } from "../../context/ConfirmContext";
import { apiFetch, sharePdf } from "../../lib/api";
import { getCachedSales } from "../../lib/offline-read-cache";
import { isRepeatableSale } from "../../lib/repeat-sale";
import type { SellerOrderListItem } from "./useSalesListScreen";

export type SellerOrderDetail = {
  id: string;
  orderNumber?: number | null;
  status: string;
  situation?: { id: string; code: string; name: string } | null;
  totalAmount: unknown;
  notes: string | null;
  creditHoldReasons?: unknown;
  createdAt: string;
  customerId?: string | null;
  paymentConditionId?: string | null;
  customer: { name: string } | null;
  seller?: { user: { name: string; phone?: string | null } } | null;
  items: {
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: unknown;
  }[];
};

export function useSaleDetailScreen() {
  const router = useRouter();
  const { alert } = useConfirm();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pdfPending, setPdfPending] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["seller", "sale", id],
    queryFn: async () => {
      try {
        return await apiFetch<SellerOrderDetail>(`/seller/sales/${id}`);
      } catch (err) {
        const cached = await getCachedSales<SellerOrderListItem>();
        const row = cached.find((r) => r.id === id);
        if (!row) throw err;
        return {
          id: row.id,
          status: row.status,
          totalAmount: row.totalAmount,
          notes: null,
          createdAt: row.createdAt,
          customerId: row.customerId,
          paymentConditionId: row.paymentConditionId,
          customer: row.customer ? { name: row.customer.name } : null,
          seller: row.seller,
          items: row.items.map((it, i) => ({
            id: `${row.id}-${it.productId ?? i}`,
            productId: it.productId ?? "",
            productName: it.productName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })),
        } satisfies SellerOrderDetail;
      }
    },
    enabled: !!id,
  });

  const shareOrderPdf = useCallback(async () => {
    if (!id) return;
    setPdfErr(null);
    setPdfPending(true);
    try {
      await sharePdf(`/seller/sales/${id}/pdf`, `pedido-${id.slice(0, 8)}.pdf`);
    } catch (e) {
      setPdfErr(e instanceof Error ? e.message : "Falha ao gerar PDF");
    } finally {
      setPdfPending(false);
    }
  }, [id]);

  const canRepeatSale = isRepeatableSale(query.data);

  const repeatThisSale = useCallback(() => {
    if (!id || !canRepeatSale) {
      void alert({
        title: "Repetir venda",
        description: "Nenhuma venda anterior para repetir",
      });
      return;
    }
    router.push({
      pathname: "/quick-sale",
      params: { repeatSaleId: id },
    });
  }, [alert, canRepeatSale, id, router]);

  return {
    order: query.data,
    isLoading: query.isLoading,
    pdfPending,
    pdfErr,
    shareOrderPdf,
    canRepeatSale,
    repeatThisSale,
  };
}
