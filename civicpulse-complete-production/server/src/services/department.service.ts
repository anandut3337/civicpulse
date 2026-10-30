import { prisma } from '../config/database';

export const departmentService = {
  list: () => prisma.department.findMany({ orderBy: { name: 'asc' } }),
  findByCode: (code: string) => prisma.department.findUnique({ where: { code: code.toUpperCase() } }),
};
