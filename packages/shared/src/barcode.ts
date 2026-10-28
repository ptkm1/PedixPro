/** Normalização e match de código de barras (pistola USB / EAN / UPC / SKU). */

export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function barcodeDigitVariants(digits: string): string[] {
  const out = new Set<string>();
  if (!digits) return [];
  out.add(digits);
  if (digits.length === 12) out.add(`0${digits}`);
  if (digits.length === 13) {
    out.add(`0${digits}`);
    if (digits.startsWith("0")) out.add(digits.slice(1));
  }
  if (digits.length === 14 && digits.startsWith("0")) {
    out.add(digits.slice(1));
  }
  return [...out];
}

export function barcodeCodesMatch(
  stored: string,
  scanned: string,
  scannedDigits: string,
): boolean {
  const trimmed = stored.trim();
  if (!trimmed) return false;
  if (trimmed === scanned) return true;
  const storedDigits = normalizeBarcode(trimmed);
  if (storedDigits.length < 6 || scannedDigits.length < 6) return false;
  const scannedSet = new Set(barcodeDigitVariants(scannedDigits));
  for (const v of barcodeDigitVariants(storedDigits)) {
    if (scannedSet.has(v)) return true;
  }
  return false;
}

export type BarcodeSearchable = {
  barcode?: string | null;
  sku?: string | null;
  fiscalGtin?: string | null;
};

export function productMatchesBarcode(
  product: BarcodeSearchable,
  raw: string,
): boolean {
  const trimmed = raw.trim();
  const digits = normalizeBarcode(raw);
  if (barcodeCodesMatch(product.barcode ?? "", trimmed, digits)) return true;
  if (barcodeCodesMatch(product.sku ?? "", trimmed, digits)) return true;
  return barcodeCodesMatch(product.fiscalGtin ?? "", trimmed, digits);
}

export function findProductByBarcode<T extends BarcodeSearchable>(
  products: T[],
  raw: string,
): T | undefined {
  return products.find((p) => productMatchesBarcode(p, raw));
}

export const EXPEDITION_SITUATION_CODES = {
  WAITING: "OPEN",
  PICKING: "PICKING",
  PACKED: "PACKED",
  SHIPPED: "SENT",
} as const;

export function expeditionSituationLabel(
  code: string | null | undefined,
): string {
  switch (code) {
    case "OPEN":
    case null:
    case undefined:
      return "Aguardando separação";
    case "PICKING":
      return "Separando";
    case "PACKED":
      return "Separado";
    case "SENT":
      return "Expedido";
    case "DELIVERED":
      return "Entregue";
    case "CANCELLED":
      return "Cancelado";
    default:
      return code;
  }
}
