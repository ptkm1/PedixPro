import {
    DeleteObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
    productImageExtension,
    type ProductImageMimeType,
} from "@pedidos/shared";
import { randomUUID } from "node:crypto";

const PRESIGN_TTL_SECONDS = 5 * 60;

export class ObjectStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectStorageError";
  }
}

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim()?.replace(
    /\/$/,
    "",
  );
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  ) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function isObjectStorageConfigured(): boolean {
  return readConfig() != null;
}

function requireConfig(): R2Config {
  const cfg = readConfig();
  if (!cfg) {
    throw new ObjectStorageError(
      "Upload de imagens não configurado (R2). Defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET e R2_PUBLIC_BASE_URL.",
    );
  }
  return cfg;
}

function createClient(cfg: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export function buildProductImageKey(params: {
  organizationId: string;
  productId: string;
  contentType: ProductImageMimeType;
}): string {
  const ext = productImageExtension(params.contentType);
  return `${params.organizationId}/products/${params.productId}/${randomUUID()}.${ext}`;
}

export function publicUrlForKey(key: string): string {
  const cfg = requireConfig();
  return `${cfg.publicBaseUrl}/${key}`;
}

/** Extrai a key se a URL for do nosso bucket público; senão null. */
export function tryParseOwnedObjectKey(imageUrl: string): string | null {
  const cfg = readConfig();
  if (!cfg) return null;
  const base = `${cfg.publicBaseUrl}/`;
  if (!imageUrl.startsWith(base)) return null;
  const key = imageUrl.slice(base.length);
  if (!key || key.includes("..") || key.startsWith("/")) return null;
  return key;
}

export async function createProductImageUploadUrl(params: {
  organizationId: string;
  productId: string;
  contentType: ProductImageMimeType;
  contentLength: number;
}): Promise<{
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
}> {
  const cfg = requireConfig();
  const key = buildProductImageKey(params);
  const client = createClient(cfg);
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGN_TTL_SECONDS,
  });
  return {
    uploadUrl,
    publicUrl: `${cfg.publicBaseUrl}/${key}`,
    key,
    expiresInSeconds: PRESIGN_TTL_SECONDS,
  };
}

export async function deleteObjectByKey(key: string): Promise<void> {
  const cfg = requireConfig();
  const client = createClient(cfg);
  await client.send(
    new DeleteObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    }),
  );
}

/** Apaga objeto se a URL for nossa; ignora falhas (best-effort). */
export async function deleteOwnedProductImage(
  imageUrl: string | null | undefined,
): Promise<void> {
  if (!imageUrl) return;
  const key = tryParseOwnedObjectKey(imageUrl);
  if (!key) return;
  try {
    await deleteObjectByKey(key);
  } catch {
    // best-effort
  }
}
