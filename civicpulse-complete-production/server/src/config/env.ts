import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is validated once at boot. A misconfigured deployment fails
 * fast with a readable message instead of crashing later at runtime.
 */
const csv = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    /** Read by the Prisma CLI (schema `directUrl`) for migrations; optional at runtime. */
    DIRECT_URL: z.string().optional(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    /** Frontend origin (e.g. the Vercel URL). Allowed by CORS and used for links inside tweet drafts. */
    CLIENT_URL: z.string().url().optional(),
    /** Extra allowed browser origins, comma-separated. Falls back to http://localhost:3000 only if nothing else is set. */
    CORS_ORIGINS: z.string().default(''),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    GEO_MAX_RESOLVE_KM: z.coerce.number().positive().default(2),

    // --- Public URLs ---
    PUBLIC_API_URL: z.string().url().default('http://localhost:4000'), // used to build /uploads URLs (local driver)
    PUBLIC_WEB_URL: z.string().url().optional(),                       // frontend origin; adds an issue link to tweets

    // --- AI (Gemini). Optional: without a key the app degrades to rule-based routing. ---
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
    GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
    /** Below this confidence the AI's department is not trusted and its spam verdict cannot block. */
    AI_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.55),
    /** Last-resort department when neither the citizen, the AI nor the text decides. Must exist in the DB. */
    DEFAULT_DEPARTMENT_CODE: z.string().default('PWD'),

    // --- Media storage ---
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    UPLOAD_DIR: z.string().default('uploads'),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().url().optional(),           // set for R2 / MinIO / GCS interop
    S3_PUBLIC_BASE_URL: z.string().url().optional(),    // CDN or bucket URL that serves the objects
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    /** Extra hostnames the server may download media from (SSRF allow-list for analyzeCivicIssueMedia). */
    MEDIA_ALLOWED_HOSTS: z.string().default(''),

    // --- Twitter/X ---
    /** City-wide accounts always appended to drafts, e.g. the Municipal Corporation. Comma-separated, no '@'. */
    FALLBACK_TWEET_HANDLES: z.string().default(''),
    /** The city's official account (e.g. the Municipal Corporation). Merged into FALLBACK_TWEET_HANDLES. */
    DEFAULT_CITY_HANDLE: z.string().default(''),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production' && /replace-me/i.test(v.JWT_SECRET)) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET still holds the example placeholder' });
    }
    if (v.STORAGE_DRIVER === 's3') {
      for (const k of ['S3_BUCKET', 'S3_REGION', 'S3_PUBLIC_BASE_URL'] as const) {
        if (!v[k]) ctx.addIssue({ code: 'custom', path: [k], message: `${k} is required when STORAGE_DRIVER=s3` });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const host = (u?: string) => {
  try { return u ? new URL(u).hostname.toLowerCase() : null; } catch { return null; }
};

const stripSlash = (u: string) => u.replace(/\/+$/, '');
const unique = (items: string[]) => [...new Set(items)];

const explicitOrigins = unique([
  ...csv(parsed.data.CORS_ORIGINS).map(stripSlash),
  ...(parsed.data.CLIENT_URL ? [stripSlash(parsed.data.CLIENT_URL)] : []),
]);

export const env = {
  ...parsed.data,
  /** Frontend URL used for tweet links: PUBLIC_WEB_URL wins, CLIENT_URL is the fallback. */
  PUBLIC_WEB_URL: parsed.data.PUBLIC_WEB_URL ?? parsed.data.CLIENT_URL,
  isProduction: parsed.data.NODE_ENV === 'production',
  corsOrigins: explicitOrigins.length ? explicitOrigins : ['http://localhost:3000'],
  fallbackTweetHandles: unique([...csv(parsed.data.FALLBACK_TWEET_HANDLES), ...csv(parsed.data.DEFAULT_CITY_HANDLE)]),
  /** Our own storage hosts are always allowed, plus anything listed explicitly. */
  mediaAllowedHosts: [
    ...csv(parsed.data.MEDIA_ALLOWED_HOSTS).map((h) => h.toLowerCase()),
    host(parsed.data.PUBLIC_API_URL),
    host(parsed.data.S3_PUBLIC_BASE_URL),
  ].filter((h): h is string => !!h),
};
