import type { Request, Response } from 'express';
import { healthService } from '../services/health.service';
import { asyncHandler } from '../utils/asyncHandler';

/** Liveness: the process is up. Never touches dependencies. */
export const liveness = (_req: Request, res: Response): void => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() });
};

/** Readiness: dependencies are reachable. Load balancers use this to gate traffic. */
export const readiness = asyncHandler(async (_req, res) => {
  const db = await healthService.checkDatabase();
  res.status(db.ok ? 200 : 503).json({
    status: db.ok ? 'ready' : 'degraded',
    checks: { database: db },
    timestamp: new Date().toISOString(),
  });
});
