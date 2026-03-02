import { Request, Response, NextFunction } from 'express'
import { Prisma } from '../../generated/prisma/client'
import { ApiError } from '../utils/ApiError'
import { logger } from '../utils/logger'
import { env } from '../config/env'

export const errorHandler = (
  err: unknown,           // ← change Error to unknown
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error({
    message: err instanceof Error ? err.message : 'Unknown error',
    stack: env.isProduction ? undefined : err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
  })

  // Known ApiError — our own thrown errors
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      errors: err.errors ?? null,
    })
    return
  }

  // Prisma known errors — database constraint violations
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'A record with this value already exists',
        code: 'DUPLICATE_ENTRY',
        errors: null,
      })
      return
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Record not found',
        code: 'NOT_FOUND',
        errors: null,
      })
      return
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'Related record not found',
        code: 'FOREIGN_KEY_ERROR',
        errors: null,
      })
      return
    }
  }

  // Unknown error — never leak internals in production
  res.status(500).json({
    success: false,
    message: env.isProduction
      ? 'Internal server error'
      : err instanceof Error ? err.message : 'Unknown error',
    code: 'INTERNAL_ERROR',
    errors: null,
  })
}