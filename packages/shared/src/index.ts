/** Rotas base da API v1 (alinhar com apps/api) */
export const API_PREFIX = "/api/v1";

export {
  barcodeCodesMatch,
  barcodeDigitVariants,
  EXPEDITION_SITUATION_CODES,
  expeditionSituationLabel,
  findProductByBarcode,
  normalizeBarcode,
  productMatchesBarcode,
} from "./barcode.js";
export type { BarcodeSearchable } from "./barcode.js";
export {
  formatCardExpiryInput,
  formatCardNumberInput,
  isValidCardExpiry,
  isValidCvv,
  isValidLuhn,
  maskCardNumberLast4,
  normalizeCardNumber,
  parseCardExpiry,
} from "./billing-card.js";
export {
  CHECKOUT_INTENT_STATUSES,
  isCheckoutIntentStatus,
  mapIntentToPublicStatus,
} from "./billing.js";
export type {
  CheckoutIntentStatus,
  PublicBoletoInstructions,
  PublicIntentNextAction,
  PublicIntentStatus,
  PublicPaymentInstructions,
  PublicPixInstructions,
  SubscriptionPayMethod,
} from "./billing.js";

export type Role = "ADMIN" | "SELLER" | "SUPERVISOR" | "MANAGER";

export type OrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "CANCELLED"
  | "PENDING_CREDIT_APPROVAL";

export const ORDER_STATUSES: OrderStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "CANCELLED",
  "PENDING_CREDIT_APPROVAL",
];

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Rascunho",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  PENDING_CREDIT_APPROVAL: "Aguardando crédito",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

/** Códigos de etapa do sistema (por org). O campo visível do pedido é a situação. */
export const SYSTEM_SITUATION_CODES = {
  DRAFT: "DRAFT",
  CREDIT: "CREDIT",
  OPEN: "OPEN",
  PICKING: "PICKING",
  PACKED: "PACKED",
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
} as const;

export type SystemSituationCode =
  (typeof SYSTEM_SITUATION_CODES)[keyof typeof SYSTEM_SITUATION_CODES];

export const SYSTEM_SITUATION_CODE_LIST: string[] = Object.values(
  SYSTEM_SITUATION_CODES,
);

/** Etapas fixas nas pontas do fluxo (Kanban). */
export const LIFECYCLE_SITUATION_CODES = {
  DRAFT: SYSTEM_SITUATION_CODES.DRAFT,
  CREDIT: SYSTEM_SITUATION_CODES.CREDIT,
  DELIVERED: SYSTEM_SITUATION_CODES.DELIVERED,
  CANCELLED: SYSTEM_SITUATION_CODES.CANCELLED,
} as const;

export function isReservedSituationCode(code: string): boolean {
  return SYSTEM_SITUATION_CODE_LIST.includes(code);
}

export function isLifecycleSituationCode(code: string): boolean {
  return (
    code === LIFECYCLE_SITUATION_CODES.DRAFT ||
    code === LIFECYCLE_SITUATION_CODES.CREDIT ||
    code === LIFECYCLE_SITUATION_CODES.DELIVERED ||
    code === LIFECYCLE_SITUATION_CODES.CANCELLED
  );
}

/** Deriva o status interno (estoque/crédito/NF) a partir da etapa visível. */
export function orderStatusFromSituation(
  code: string,
  mapsToCancel?: boolean,
): OrderStatus {
  if (code === SYSTEM_SITUATION_CODES.DRAFT) return "DRAFT";
  if (code === SYSTEM_SITUATION_CODES.CREDIT) return "PENDING_CREDIT_APPROVAL";
  if (code === SYSTEM_SITUATION_CODES.CANCELLED || mapsToCancel) {
    return "CANCELLED";
  }
  return "CONFIRMED";
}

/** Etapa padrão ao criar/alterar pelo status interno (rascunho, crédito, confirmar, cancelar). */
export function situationCodeFromOrderStatus(status: OrderStatus): string {
  switch (status) {
    case "DRAFT":
      return SYSTEM_SITUATION_CODES.DRAFT;
    case "PENDING_CREDIT_APPROVAL":
      return SYSTEM_SITUATION_CODES.CREDIT;
    case "CANCELLED":
      return SYSTEM_SITUATION_CODES.CANCELLED;
    default:
      return SYSTEM_SITUATION_CODES.OPEN;
  }
}

export function situationImpliesConfirm(
  code: string,
  mapsToCancel?: boolean,
): boolean {
  return orderStatusFromSituation(code, mapsToCancel) === "CONFIRMED";
}

export function situationImpliesCancel(
  code: string,
  mapsToCancel?: boolean,
): boolean {
  return orderStatusFromSituation(code, mapsToCancel) === "CANCELLED";
}

export {
  cepDigitsOnly,
  formatCepMask,
  formatStructuredAddress,
  isCepComplete,
  parseCepFlexible,
} from "./address.js";
export type {
  CepAddressData,
  CustomerAddressFields,
  IbgeMunicipio,
  IbgeUf,
} from "./address.js";
export {
  ibgeDigitsOnly,
  isValidIbgeMunicipioCode,
  normalizeMunicipioName,
  normalizeUf,
} from "./municipio.js";
export type {
  MunicipioIbgeConfidence,
  MunicipioIbgeResolution,
  MunicipioIbgeSource,
  ResolveMunicipioIbgeInput,
} from "./municipio.js";
export { AI_INDICATOR_SECTION_IDS } from "./ai-indicators.js";
export type {
  AiIndicatorItem,
  AiIndicatorSection,
  AiIndicatorSectionId,
  AiIndicatorSeverity,
  AiIndicatorsLatest,
  AiIndicatorsPayload,
  AiIndicatorsStatus,
} from "./ai-indicators.js";
export {
  APP_BRAND_BACKGROUND,
  APP_BRAND_BORDER,
  APP_BRAND_LILAC,
  APP_BRAND_NAME,
  APP_BRAND_NAVY,
  APP_BRAND_PRIMARY,
  APP_BRAND_SHORT,
  APP_BRAND_TAGLINE,
  COMMERCE_PRO_ICON_ASPECT,
  COMMERCE_PRO_ICON_PATH,
  COMMERCE_PRO_ICON_PATHS,
  COMMERCE_PRO_ICON_VIEWBOX,
  PEDIX_PRO_ICON_ASPECT,
  PEDIX_PRO_ICON_LOOP_PATH,
  PEDIX_PRO_ICON_PATHS,
  PEDIX_PRO_ICON_STEM_PATH,
  PEDIX_PRO_ICON_VIEWBOX,
} from "./brand.js";
export {
  cnpjDigitsOnly,
  formatBrazilPhoneDigits,
  formatCnpjAddress,
  formatCnpjMask,
  isCnpjComplete,
  isCnpjSituacaoAtiva,
  isValidCnpj,
  suggestedTradeName,
} from "./cnpj.js";
export type { CnpjCompanyData } from "./cnpj.js";
export {
  SELLER_COMMISSION_TYPES,
  sellerCommissionTypeLabel,
} from "./commission.js";
export type { SellerCommissionType } from "./commission.js";
export {
  cpfDigitsOnly,
  formatCpfMask,
  isCpfComplete,
  isValidCpf,
} from "./cpf.js";
export {
  buildCsvTemplate,
  CSV_IMPORT_MAX_CHARS,
  CSV_IMPORT_MAX_ROWS,
  CUSTOMER_CSV_HEADERS,
  CUSTOMER_CSV_SAMPLE_ROW,
  customerCsvTemplate,
  PRODUCT_CSV_HEADERS,
  PRODUCT_CSV_REQUIRED,
  PRODUCT_CSV_SAMPLE_ROW,
  productCsvTemplate,
} from "./csv-import.js";
export type { CustomerCsvHeader, ProductCsvHeader } from "./csv-import.js";
export {
  csvColumnMapIsEmpty,
  csvFieldLabel,
  CUSTOMER_CSV_ADDRESS_FALLBACK,
  CUSTOMER_CSV_BULK_FIELDS,
  CUSTOMER_CSV_FIELD_ALIASES,
  CUSTOMER_CSV_FIELD_LABELS,
  normalizeCsvHeader,
  peekCsvHeaders,
  PRODUCT_CSV_FIELD_ALIASES,
  PRODUCT_CSV_FIELD_LABELS,
  suggestCsvColumnMap,
} from "./csv-column-map.js";
export type {
  CsvColumnMap,
  CsvHeaderPeek,
  CsvImportKind,
  CsvImportRecipe,
  CustomerCsvBulkField,
} from "./csv-column-map.js";
export {
  customerFormErrorStep,
  customerToForm,
  emptyCustomerForm,
  FIELD_NOT_APPLICABLE,
  formatCustomerCode,
  formToCustomerPayload,
  isCustomerFormValid,
  isFieldNotApplicable,
  isStateRegistrationUnavailable,
  isStreetNumberSn,
  STATE_REGISTRATION_UNAVAILABLE,
  STREET_NUMBER_SN,
  validateCustomerForm,
  validateCustomerFormStep,
} from "./customer-form.js";
export type {
  CustomerApprovalStatus,
  CustomerDocumentType,
  CustomerFormErrors,
  CustomerFormValues,
  CustomerRecord,
  CustomerStatus,
} from "./customer-form.js";
export {
  FISCAL_INVOICE_STATUS_LABELS,
  FISCAL_MANIFESTATION_LABELS,
  FISCAL_TAX_REGIME_LABELS,
  isProductFiscalReady,
  nfeTpEmisLabel,
  NFE_ENVIRONMENT_LABELS,
} from "./fiscal.js";
export type {
  FiscalDocumentDirection,
  FiscalInvoiceStatus,
  FiscalManifestationType,
  FiscalOperationDirection,
  FiscalTaxRegime,
  NfeEnvironment,
} from "./fiscal.js";
export {
  CFOP_CONTEXTS,
  FISCAL_CATALOG_TYPES,
  formatCfopDisplay,
  formatFiscalCodeLabel,
  formatNcmDisplay,
  inferCfopContexts,
  isCodeCurrentlyValid,
  isFiscalCatalogType,
  normalizeCestCode,
  normalizeCfopCode,
  normalizeNcmCode,
} from "./fiscal-catalog.js";
export type {
  CfopContext,
  FiscalCatalogCodeDto,
  FiscalCatalogSearchResult,
  FiscalCatalogType,
} from "./fiscal-catalog.js";
export {
  formatRelativeSaleDate,
  formatSaleItemCount,
} from "./format-sale-date.js";
export {
  capHomeIndicators,
  cheapestPlanWithHigherHomeIndicatorLimit,
  DEFAULT_HOME_INDICATORS,
  DEFAULT_HOME_INDICATORS_LAYOUT,
  defaultHomeIndicatorsForPlan,
  formatHomeIndicatorLimit,
  getHomeIndicatorCatalogEntry,
  HOME_CHART_INDICATOR_KEYS,
  HOME_INDICATOR_CATALOG_META,
  HOME_INDICATOR_DATA_INFO,
  HOME_INDICATOR_DESCRIPTIONS,
  HOME_INDICATOR_KEYS,
  HOME_INDICATOR_LABELS,
  HOME_INDICATOR_PREVIEW_TYPES,
  HOME_INDICATOR_SECTION_LABELS,
  HOME_INDICATOR_SECTION_ORDER,
  HOME_INDICATOR_SECTIONS,
  HOME_INDICATOR_SHORT_LABELS,
  HOME_INDICATOR_STRATEGY_CATEGORIES,
  HOME_INDICATOR_STRATEGY_CATEGORY_LABELS,
  HOME_INDICATORS_LAYOUT_LABELS,
  HOME_INDICATORS_LAYOUTS,
  homeIndicatorLimitExceededMessage,
  homeIndicatorLimitForPlan,
  isHomeChartIndicatorKey,
  isHomeIndicatorKey,
  isHomeIndicatorsLayout,
  listHomeIndicatorCatalogEntries,
  MAX_HOME_INDICATORS,
  normalizeHomeIndicators,
  normalizeHomeIndicatorsLayout,
  parseHomeIndicators,
  persistHomeIndicatorsError,
} from "./home-indicators.js";
export type {
  HomeChartIndicatorKey,
  HomeIndicatorCatalogEntry,
  HomeIndicatorCatalogMeta,
  HomeIndicatorKey,
  HomeIndicatorPreviewType,
  HomeIndicatorSection,
  HomeIndicatorsLayout,
  HomeIndicatorStrategyCategory,
} from "./home-indicators.js";
export {
  getLegalDocument,
  LEGAL_COMPANY_PLACEHOLDER,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENTS,
  PRIVACY_POLICY_DOCUMENT,
  TERMS_OF_USE_DOCUMENT,
} from "./legal-documents.js";
export type {
  LegalArticle,
  LegalChapter,
  LegalDocument,
} from "./legal-documents.js";
export {
  NOTIFICATION_TYPES,
  notificationBodyDisplay,
  notificationHref,
} from "./notifications.js";
export type {
  AppNotification,
  NotificationData,
  NotificationType,
} from "./notifications.js";
export {
  canRead,
  canWrite,
  EDITABLE_ROLES,
  getPermission,
  levelAllowsRead,
  levelAllowsWrite,
  LOCKED_ROLES,
  PERMISSION_RESOURCE_LABELS,
  PERMISSION_RESOURCES,
  resolvePermission,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
} from "./permissions.js";
export type {
  PermissionLevel,
  PermissionResource,
  PermissionsMap,
} from "./permissions.js";
export {
  cheapestPlanWithFeature,
  DEFAULT_PLAN_ID,
  DEFAULT_TRIAL_DAYS,
  extraAdminCount,
  EXTRA_ADMIN_SEAT_PRICE_BRL,
  formatPlanPriceBrl,
  getPlanDefinition,
  isPlanId,
  listPlans,
  PLAN_CATALOG,
  PLAN_FEATURE_LABELS,
  PLAN_IDS,
  planHasFeature,
  trialDaysRemaining,
  planMonthlyTotal,
  planSeatPriceCaption,
  roundMoneyBrl,
  SELLER_SEAT_PRICE_BRL,
} from "./plans.js";
export type {
  PlanDefinition,
  PlanFeature,
  PlanId,
  PlanLimits,
} from "./plans.js";
export {
  formatInsufficientStockMessage,
  formatOutOfStockMessage,
  formatProductPriceWithUnit,
  formatProductStockItemLabel,
  formatProductStockLabel,
  formatProductUnitLabel,
  formatStockQtyWithUnit,
  isProductSaleBlockedByStock,
} from "./product-display.js";
export {
  computeMarkupPercent,
  DEFAULT_PURCHASE_UNITS,
  emptyProductForm,
  formToProductPayload,
  formatPurchaseUnitLabel,
  isNcmComplete,
  normalizeNcm,
  normalizePurchaseUnitCode,
  PRODUCT_CLASSIFICATIONS,
  productClassificationLabel,
  productToForm,
  PURCHASE_UNIT_CODE_MAX,
  PURCHASE_UNITS,
  validateProductForm,
} from "./product-form.js";
export type {
  ProductApiPayload,
  ProductClassification,
  ProductFormErrors,
  ProductFormTab,
  ProductFormValidation,
  ProductFormValues,
  ProductRecord,
} from "./product-form.js";
export {
  formatRomaneioNumber,
  groupOrdersByPaymentCondition,
  paymentConditionLabel,
  roundMoney,
  sumOrderTotals,
  uniqueIdsPreserveOrder,
} from "./route-romaneio.js";
export type {
  RomaneioOrderTotal,
  RomaneioPaymentCondition,
  RomaneioPaymentGroup,
} from "./route-romaneio.js";
export {
  formatStockAuditDetails,
  STOCK_MOVEMENT_TYPE_LABELS,
  STOCK_MOVEMENT_TYPE_SHORT_LABELS,
  stockMovementTypeLabel,
} from "./stock.js";
export type { StockMovementType } from "./stock.js";
export {
  isStockCountSortBy,
  isStockSituation,
  isStockValueBasis,
  STOCK_COUNT_SORT_OPTIONS,
  STOCK_SITUATION_OPTIONS,
  STOCK_VALUE_BASIS_OPTIONS,
  STOCK_VALUE_PRICE_COLUMN_LABELS,
} from "./stock-report.js";
export type {
  StockCountSortBy,
  StockSituation,
  StockValueBasis,
} from "./stock-report.js";
