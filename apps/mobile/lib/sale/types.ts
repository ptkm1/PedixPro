import type { CatalogProductPrice } from "@pedidos/shared";

export type SaleProduct = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  soldQty?: number;
  basePrice: unknown;
  catalogUnitPrice?: number;
  effectiveUnitPrice?: number;
  /** Preços por tabela para exibição no catálogo (só visualização). */
  prices?: CatalogProductPrice[];
  promotionLabel?: string | null;
  featured?: boolean;
  hasActivePromotion?: boolean;
  highlighted?: boolean;
  maxSellerDiscountPercent?: number | null;
  maxSellerDiscountPercentEffective?: number;
  minSaleUnitPrice?: number | null;
  stockQty?: number;
  blockSaleWhenOutOfStock?: boolean;
  attributes?: Record<string, unknown>;
  category?: { id: string; code: string; name: string } | null;
  supplier?: {
    id: string;
    code: string;
    tradeName: string;
    legalName?: string | null;
  } | null;
  imageUrl?: string | null;
};

export type SaleCustomer = {
  id: string;
  code?: number | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  documentType?: "CNPJ" | "CPF" | null;
  cnpj?: string | null;
  cpf?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  city?: string | null;
  state?: string | null;
  approvalStatus?: "APPROVED" | "PENDING" | "REJECTED";
};

export type PaymentCondition = {
  id: string;
  code: string;
  name: string;
  days: number;
  sortOrder?: number;
};

export type OrderOperation = "SALE";

export type CreditOverview = {
  creditBlocked: boolean;
  creditLimit: number | null;
  creditPolicy: string;
  openBalance: number;
  overdueCount: number;
  overdueAmount: number;
  violations: Array<{ code: string; message: string }>;
  effectiveAction: string;
};

export type CartLine = {
  productId: string;
  name: string;
  sku: string | null;
  qty: number;
  effectiveUnitPrice: number;
  catalogUnitPrice?: number;
  promotionLabel?: string | null;
  discountPercent: number;
  maxSellerDiscountPercent: number;
};

export type QuickSaleTab = "clientes" | "produtos" | "finalizar";
