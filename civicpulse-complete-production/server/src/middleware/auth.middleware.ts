import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { Role } from '../models/enums';
import type { AuthUser } from '../models/types';
import { AppError } from '../utils/AppError';

/**
 * Verifies `Authorization: Bearer <jwt>` and attaches `req.user`.
 * Token ISSUANCE (OTP / OAuth login) is intentionally not part of this
 * foundation; see README "Next steps". `npm run dev:token` mints dev tokens.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(AppError.unauthorized());

  try {
    const decoded = jwt.verify(header.slice(7), env.JWT_SECRET) as JwtPayload;
    const role = decoded.role as Role;

    if (!decoded.sub || !Object.values(Role).includes(role)) {
      return next(AppError.unauthorized('Malformed token'));
    }

    const user: AuthUser = {
      id: decoded.sub,
      role,
      departmentId: (decoded.departmentId as string | null) ?? null,
      assignedWardId: (decoded.assignedWardId as string | null) ?? null,
    };
    req.user = user;
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token'));
  }
}

/** RBAC guard. Must run AFTER `authenticate`. */
export const authorize =
  (...allowed: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(AppError.unauthorized());
    if (!allowed.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
