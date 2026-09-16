/** Limites e tipos do upload de foto de produto (R2). */

export const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const PRODUCT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProductImageMimeType = (typeof PRODUCT_IMAGE_MIME_TYPES)[number];

export function isProductImageMimeType(
  value: string,
): value is ProductImageMimeType {
  return (PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export function productImageExtension(
  mime: ProductImageMimeType,
): "jpg" | "png" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export type ProductImageUploadUrlRequest = {
  contentType: ProductImageMimeType;
  contentLength: number;
};

export type ProductImageUploadUrlResponse = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
};
