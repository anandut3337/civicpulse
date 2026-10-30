import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Single PrismaClient per process. In dev (tsx watch) modules reload, so the
 * instance is cached on globalThis to avoid exhausting the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProduction ? ['warn', 'error'] : ['query', 'warn', 'error'],
  });

if (!env.isProduction) globalForPrisma.prisma = prisma;

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
