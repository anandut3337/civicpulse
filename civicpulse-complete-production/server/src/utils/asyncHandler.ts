import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Forwards rejected promises from async controllers to the error middleware (Express 4). */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
