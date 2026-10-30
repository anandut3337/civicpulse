import { Router } from 'express';
import { liveness, readiness } from '../controllers/health.controller';

const router = Router();
router.get('/', liveness);        // GET /health
router.get('/ready', readiness);  // GET /health/ready
export default router;
