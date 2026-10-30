import { Router } from 'express';
import { listDepartments } from '../controllers/department.controller';

const router = Router();
router.get('/', listDepartments);
export default router;
