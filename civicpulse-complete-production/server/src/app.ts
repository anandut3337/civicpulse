import cors from 'cors';
import path from 'node:path';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { notFound } from './middleware/notFound.middleware';
import healthRoutes from './routes/health.routes';
import apiRoutes from './routes/index';

/**
 * App factory. Separated from server.ts so tests can import the app (e.g. with
 * supertest) without opening a port or a DB connection.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // running behind a load balancer / reverse proxy

  // --- Security & infra middleware ---
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' })); // media goes to object storage, never through this API
  // Local-driver media. helmet defaults to Cross-Origin-Resource-Policy: same-origin, which would
  // stop the web app (different origin) from displaying these images, so relax it for this path only.
  if (env.STORAGE_DRIVER === 'local') {
    app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR), {
      index: false,
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }));
  }
  app.use(morgan(env.isProduction ? 'combined' : 'dev', { skip: (req) => req.path.startsWith('/health') }));

  // --- Health endpoints (unversioned, unthrottled, no auth) ---
  app.use('/health', healthRoutes);

  // --- Versioned API ---
  app.use(
    '/api/v1',
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
    apiRoutes,
  );

  // --- Terminal handlers (order matters) ---
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
