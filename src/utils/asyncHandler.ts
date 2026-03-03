import { Request, Response, NextFunction } from 'express'

type HandlerFn = (
  req: Request,
  res: Response,
  next: NextFunction
) => unknown | Promise<unknown>

export const asyncHandler =
  (fn: HandlerFn) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }