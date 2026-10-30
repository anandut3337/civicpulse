import { Router } from 'express';
import authRoutes from './auth.routes';
import departmentRoutes from './department.routes';
import issueRoutes from './issue.routes';
import locationRoutes from './location.routes';

/** Mounted at /api/v1. Add new feature routers here. */
const api = Router();
api.use('/auth', authRoutes); // /api/v1/auth/register, /login, /me
api.use('/issues', issueRoutes);
api.use('/locations', locationRoutes);
api.use('/departments', departmentRoutes);

export default api;
