import { apiFetch } from "@/lib/api";
import {
    isProductImageMimeType,
    PRODUCT_IMAGE_MAX_BYTES,
    type ProductImageUploadUrlResponse,
} from "@pedidos/shared";

export function validateProductImageFile(file: File): string | null {
  if (!isProductImageMimeType(file.type)) {
    return "Use JPEG, PNG ou WebP.";
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return `A imagem deve ter no máximo ${Math.floor(PRODUCT_IMAGE_MAX_BYTES / (1024 * 1024))} MB.`;
  }
  if (file.size < 1) {
    return "Arquivo de imagem inválido.";
  }
  return null;
}

/** Presign → PUT no R2 → retorna publicUrl. */
export async function uploadProductImageFile(
  productId: string,
  file: File,
): Promise<string> {
  const validationError = validateProductImageFile(file);
  if (validationError) throw new Error(validationError);

  const { uploadUrl, publicUrl } = await apiFetch<ProductImageUploadUrlResponse>(
    `/admin/products/${productId}/image/upload-url`,
    {
      method: "POST",
      body: JSON.stringify({
        contentType: file.type,
        contentLength: file.size,
      }),
    },
  );

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });
  if (!put.ok) {
    throw new Error(
      `Falha ao enviar a imagem (${put.status}). Tente novamente.`,
    );
  }
  return publicUrl;
}
