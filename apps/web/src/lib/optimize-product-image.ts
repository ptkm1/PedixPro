import {
    PRODUCT_IMAGE_JPEG_QUALITY,
    PRODUCT_IMAGE_MAX_BYTES,
    PRODUCT_IMAGE_MAX_EDGE_PX,
    PRODUCT_IMAGE_WEBP_QUALITY,
} from "@pedidos/shared";

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function fitSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function baseName(fileName: string): string {
  const trimmed = fileName.trim();
  const withoutExt = trimmed.replace(/\.[^.]+$/, "");
  return withoutExt || "product";
}

async function encodeCandidates(
  canvas: HTMLCanvasElement,
  hasAlpha: boolean,
): Promise<Blob[]> {
  const candidates: Blob[] = [];
  const webpQualities = [
    PRODUCT_IMAGE_WEBP_QUALITY,
    0.7,
    0.6,
    0.5,
  ];

  for (const q of webpQualities) {
    const blob = await canvasToBlob(canvas, "image/webp", q);
    if (blob && blob.size > 0) {
      candidates.push(blob);
      if (blob.size <= PRODUCT_IMAGE_MAX_BYTES) break;
    }
  }

  if (!hasAlpha) {
    const jpegQualities = [PRODUCT_IMAGE_JPEG_QUALITY, 0.72, 0.62];
    for (const q of jpegQualities) {
      const blob = await canvasToBlob(canvas, "image/jpeg", q);
      if (blob && blob.size > 0) {
        candidates.push(blob);
        if (blob.size <= PRODUCT_IMAGE_MAX_BYTES) break;
      }
    }
  } else {
    // PNG só como último recurso (transparência sem WebP útil).
    const png = await canvasToBlob(canvas, "image/png", 1);
    if (png && png.size > 0) candidates.push(png);
  }

  return candidates;
}

function pickSmallestUnderCap(blobs: Blob[]): Blob | null {
  const underCap = blobs.filter((b) => b.size <= PRODUCT_IMAGE_MAX_BYTES);
  const pool = underCap.length > 0 ? underCap : blobs;
  if (pool.length === 0) return null;
  return pool.reduce((best, cur) => (cur.size < best.size ? cur : best));
}

function blobToFile(blob: Blob, name: string): File {
  const ext =
    blob.type === "image/png"
      ? "png"
      : blob.type === "image/webp"
        ? "webp"
        : "jpg";
  return new File([blob], `${name}.${ext}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

/**
 * Redimensiona (máx. lado) + re-encode (WebP preferido) para economizar espaço no R2.
 * Remove metadados EXIF ao redesenhar no canvas.
 */
export async function optimizeProductImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
  } catch {
    throw new Error("Não foi possível ler a imagem. Tente outro arquivo.");
  }

  try {
    const { width, height } = fitSize(
      bitmap.width,
      bitmap.height,
      PRODUCT_IMAGE_MAX_EDGE_PX,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Falha ao processar a imagem neste navegador.");
    }

    const hasAlpha =
      file.type === "image/png" || file.type === "image/webp";
    if (!hasAlpha) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const candidates = await encodeCandidates(canvas, hasAlpha);
    const best = pickSmallestUnderCap(candidates);
    if (!best) {
      throw new Error("Falha ao comprimir a imagem. Tente outro arquivo.");
    }

    // Se a original já é menor e cabe no limite, mantém (ex.: WebP pequeno).
    if (
      file.size <= best.size &&
      file.size <= PRODUCT_IMAGE_MAX_BYTES &&
      (file.type === "image/jpeg" ||
        file.type === "image/png" ||
        file.type === "image/webp")
    ) {
      return file;
    }

    if (best.size > PRODUCT_IMAGE_MAX_BYTES) {
      throw new Error(
        `A imagem continua grande demais após otimizar (máx. ${Math.floor(PRODUCT_IMAGE_MAX_BYTES / (1024 * 1024))} MB).`,
      );
    }

    return blobToFile(best, baseName(file.name));
  } finally {
    bitmap.close();
  }
}
