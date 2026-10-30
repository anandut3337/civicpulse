import { prisma } from '../config/database';

export const healthService = {
  /** Round-trips to Postgres; used by the readiness probe. */
  async checkDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  },
};
