/** Payload gravado na fila offline — eco do POST /seller/sales + snapshot UI. */

export type OfflineSaleSnapshot = {
  customerLabel?: string;
  paymentConditionLabel?: string;
  /** Linhas tipo "Nome × qty · R$ subtotal" */
  lineSummaries: string[];
  cartTotalApprox?: number;
};

export type OfflineSaleQueuePayload = {
  clientMutationId: string;
  customerId: string;
  paymentConditionId: string;
  /** Staff: vendedor atribuído; null/omit = venda direta. Vendedor ignora. */
  sellerId?: string | null;
  priceTableId?: string;
  operation?: "SALE";
  status: "CONFIRMED";
  notes?: string;
  items: Array<{
    productId: string;
    quantity: number;
    discountPercent?: number;
    priceTableId?: string;
  }>;
  snapshot?: OfflineSaleSnapshot;
};

export type OfflineQueueRowState = "queued" | "syncing" | "dead" | "sent";

export type OfflineQueueRow = {
  localId: string;
  payload: OfflineSaleQueuePayload;
  state: OfflineQueueRowState;
  attempts: number;
  nextRetryAtMs: number;
  lastError: string | null;
  serverOrderId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};
