import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { env } from '../config/env';
import type { LoginInput, RegisterInput } from '../models/auth.schema';
import { AppError } from '../utils/AppError';

const SALT_ROUNDS = 12;

/** Fields safe to send back to a client; the password hash never leaves this module. */
const PUBLIC_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  departmentId: true,
  assignedWardId: true,
  isActive: true,
  createdAt: true,
} as const;

function signToken(user: { id: string; role: string; departmentId: string | null; assignedWardId: string | null }): string {
  return jwt.sign(
    { role: user.role, departmentId: user.departmentId, assignedWardId: user.assignedWardId },
    env.JWT_SECRET,
    { subject: user.id, expiresIn: '7d' },
  );
}

export const authService = {
  /** Citizen self-signup. OFFICIAL/ADMIN accounts are provisioned separately (not exposed here). */
  async register(input: RegisterInput) {
    const [emailTaken, phoneTaken] = await Promise.all([
      prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } }),
    ]);
    if (emailTaken) throw AppError.conflict('An account with this email already exists');
    if (phoneTaken) throw AppError.conflict('An account with this phone number already exists');

    const password = await bcrypt.hash(input.password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { fullName: input.fullName, email: input.email, phone: input.phone, password },
      select: PUBLIC_USER_SELECT,
    });

    return { user, token: signToken(user) };
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive) throw AppError.unauthorized('Invalid email or password');

    const valid = await bcrypt.compare(input.password, user.password);
    if (!valid) throw AppError.unauthorized('Invalid email or password');

    const { password: _password, ...publicUser } = user;
    return { user: publicUser, token: signToken(user) };
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: PUBLIC_USER_SELECT });
    if (!user) throw AppError.notFound('User not found');
    return user;
  },
};
