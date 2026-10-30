import type { AuthUser } from '../models/types';
import type { LoginInput, RegisterInput } from '../models/auth.schema';
import { authService } from '../services/auth.service';
import { asyncHandler } from '../utils/asyncHandler';

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body as RegisterInput);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body as LoginInput);
  res.json({ success: true, data: result });
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.me((req.user as AuthUser).id);
  res.json({ success: true, data: user });
});
