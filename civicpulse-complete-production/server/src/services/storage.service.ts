import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';

/** A file multer has already written to a temp path. */
export interface UploadedFile {
  path: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface StoredMedia {
  key: string;
  url: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'video';
}

export interface MediaStorage {
  save(file: UploadedFile): Promise<StoredMedia>;
  remove(key: string): Promise<void>;
}

/** Extension comes from the validated MIME type, never from the user-supplied filename. */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
};
export const ALLOWED_MEDIA_MIME = new Set(Object.keys(EXT_BY_MIME));

function newKey(mimeType: string): string {
  const d = new Date();
  return `issues/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${EXT_BY_MIME[mimeType] ?? ''}`;
}
const kindOf = (mime: string): 'image' | 'video' => (mime.startsWith('video/') ? 'video' : 'image');

/** Development driver: files under UPLOAD_DIR, served by Express at /uploads. */
class LocalStorage implements MediaStorage {
  private readonly root = path.resolve(env.UPLOAD_DIR);

  async save(file: UploadedFile): Promise<StoredMedia> {
    const key = newKey(file.mimeType);
    const dest = path.join(this.root, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(file.path, dest);
    return { key, url: `${env.PUBLIC_API_URL.replace(/\/$/, '')}/uploads/${key}`, mimeType: file.mimeType, size: file.size, kind: kindOf(file.mimeType) };
  }

  async remove(key: string): Promise<void> {
    await fs.rm(path.join(this.root, key), { force: true });
  }
}

/** Production driver: any S3-compatible store (AWS S3, Cloudflare R2, MinIO, GCS interop). */
class S3Storage implements MediaStorage {
  private readonly s3 = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: !!env.S3_ENDPOINT,
    credentials: env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } : undefined,
  });

  async save(file: UploadedFile): Promise<StoredMedia> {
    const key = newKey(file.mimeType);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: createReadStream(file.path), // streamed from disk, never buffered whole
        ContentLength: file.size,
        ContentType: file.mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, url: `${(env.S3_PUBLIC_BASE_URL as string).replace(/\/$/, '')}/${key}`, mimeType: file.mimeType, size: file.size, kind: kindOf(file.mimeType) };
  }

  async remove(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  }
}

let storage: MediaStorage | null = null;
export function getStorage(): MediaStorage {
  storage ??= env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();
  return storage;
}
