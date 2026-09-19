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
  priceTableId?: string;
  operation?: "SALE";
  status: "CONFIRMED";
  notes?: string;
  items: Array<{
    productId: string;
    quantity: number;
    discountPercent?: number;
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
