import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  await connectDatabase(); // fail fast if the DB is unreachable

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`CivicPulse API listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  // --- Graceful shutdown: stop accepting requests, drain, close DB ---
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);

    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });

    // Hard stop if connections refuse to drain.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', { reason }));
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: err instanceof Error ? err.message : err });
  process.exit(1);
});
