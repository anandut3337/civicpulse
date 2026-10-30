import { departmentService } from '../services/department.service';
import { asyncHandler } from '../utils/asyncHandler';

export const listDepartments = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await departmentService.list() });
});
