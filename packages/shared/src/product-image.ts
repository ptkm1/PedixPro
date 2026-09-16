/** Limites e tipos do upload de foto de produto (R2). */

/** Tamanho máximo do arquivo que sobe ao bucket (já otimizado). */
export const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Tamanho máximo do arquivo escolhido pelo usuário (antes da otimização). */
export const PRODUCT_IMAGE_SOURCE_MAX_BYTES = 12 * 1024 * 1024;

/** Maior lado da imagem após redimensionar (px). */
export const PRODUCT_IMAGE_MAX_EDGE_PX = 1200;

/** Qualidade WebP inicial (0–1); a otimização pode baixar se ainda ficar grande. */
export const PRODUCT_IMAGE_WEBP_QUALITY = 0.78;

/** Qualidade JPEG de fallback (0–1). */
export const PRODUCT_IMAGE_JPEG_QUALITY = 0.82;

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
