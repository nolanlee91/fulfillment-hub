import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * S3 client cho Cloudflare R2 (S3-compatible).
 * Env vars required (set both local + Railway):
 *   S3_ENDPOINT     — vd https://<account-id>.r2.cloudflarestorage.com
 *   S3_BUCKET       — vd fulfilment
 *   S3_ACCESS_KEY   — Cloudflare R2 Access Key ID
 *   S3_SECRET_KEY   — Cloudflare R2 Secret Access Key
 *   R2_PUBLIC_URL   — vd https://pub-xxxxxxxx.r2.dev (Public Development URL)
 */
let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKey || !secretKey) {
    throw new Error("R2 storage chưa cấu hình (thiếu S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY)");
  }
  _client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });
  return _client;
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET chưa set");
  return bucket;
}

function getPublicBaseUrl(): string {
  const url = process.env.R2_PUBLIC_URL;
  if (!url) throw new Error("R2_PUBLIC_URL chưa set");
  return url.replace(/\/+$/, ""); // trim trailing slash
}

/**
 * Upload buffer → R2. Trả về public URL.
 *
 * @param key       Path/key trong bucket, vd "proofs/skylane/abc-1234.jpg"
 * @param buffer    File bytes
 * @param mimeType  vd "image/jpeg"
 */
export async function uploadObject(
  key: string,
  buffer: Buffer | Uint8Array,
  mimeType: string,
): Promise<string> {
  const client = getClient();
  const bucket = getBucket();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return `${getPublicBaseUrl()}/${key}`;
}

/**
 * Generate key cho payment proof. Format: proofs/<customerId>/<uniqueKey>-<timestamp>.<ext>
 */
export function buildProofKey(
  customerId: string,
  uniqueKey: string,
  ext: string,
  ts: Date,
): string {
  const safeCustomer = customerId.replace(/[^a-z0-9_-]/gi, "");
  const safeKey = uniqueKey.replace(/[^a-z0-9_-]/gi, "");
  const stamp = ts.toISOString().replace(/[:.]/g, "-");
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5);
  return `proofs/${safeCustomer}/${safeKey}-${stamp}.${safeExt}`;
}
