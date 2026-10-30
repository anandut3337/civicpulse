import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { env } from '../config/env';
import { ALLOWED_MEDIA_MIME } from '../services/storage.service';
import { AppError } from '../utils/AppError';

export const MAX_MEDIA_FILES = 10;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // videos; images are capped at 10 MB in the service

const TMP_DIR = path.join(os.tmpdir(), 'civicpulse-uploads');
mkdirSync(TMP_DIR, { recursive: true });

/**
 * multipart/form-data parser: field name `media`. Files stream to a temp
 * directory (not memory) so concurrent 50 MB videos can't exhaust the heap;
 * the controller deletes them in a `finally`.
 */
export const parseMedia = multer({
  storage: multer.diskStorage({
    destination: TMP_DIR,
    filename: (_req, _file, cb) => cb(null, randomUUID()),
  }),
  limits: { fileSize: MAX_MEDIA_BYTES, files: MAX_MEDIA_FILES, fields: 20, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_MEDIA_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', `"${file.originalname}" must be a JPEG, PNG, WebP, HEIC image or an MP4, MOV, WebM video`)),
}).array('media', MAX_MEDIA_FILES);

/** Each submission triggers a paid AI call, so throttle per user (not just per IP). */
export const uploadLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: env.isProduction ? 10 : 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'anonymous',
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many submissions. Please wait a few minutes and try again.' } },
});
