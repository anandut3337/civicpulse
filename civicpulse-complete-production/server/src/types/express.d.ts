import type { AuthUser } from '../models/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by the `authenticate` middleware. */
      user?: AuthUser;
    }
  }
}

export {};
