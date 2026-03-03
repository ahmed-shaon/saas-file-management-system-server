import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { ApiError } from '../utils/ApiError'
import { ERROR_CODES } from '../config/constants'
import { prisma } from '../config/database'
import type { AuthTokenPayload } from '../modules/auth/auth.service'

// ─────────────────────────────────────────────
// AUTHENTICATE
// Verifies JWT from HttpOnly cookie
// Attaches user to req.user for downstream use
// ─────────────────────────────────────────────

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from HttpOnly cookie
    const token = req.cookies?.token

    if (!token) {
      throw new ApiError(
        401,
        'Authentication required. Please log in.',
        undefined,
        ERROR_CODES.UNAUTHORIZED
      )
    }

    // Verify token signature and expiry
    // jwt.verify throws if token is invalid or expired
    let decoded: AuthTokenPayload
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload
    } catch {
      throw new ApiError(
        401,
        'Invalid or expired session. Please log in again.',
        undefined,
        ERROR_CODES.UNAUTHORIZED
      )
    }

    // Verify user still exists and is active in DB
    // This handles cases where:
    // - User was deleted after token was issued
    // - User was deactivated by admin after token was issued
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        isActive: true,
      },
    })

    if (!user) {
      throw new ApiError(
        401,
        'User no longer exists. Please register again.',
        undefined,
        ERROR_CODES.UNAUTHORIZED
      )
    }

    if (!user.isActive) {
      throw new ApiError(
        403,
        'Your account has been deactivated. Please contact support.',
        undefined,
        ERROR_CODES.FORBIDDEN
      )
    }

    // Attach user to request — available in all downstream middleware and controllers
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.fullName,
    }

    next()
  } catch (error) {
    next(error)
  }
}

// ─────────────────────────────────────────────
// REQUIRE ADMIN
// Must be used AFTER authenticate middleware
// ─────────────────────────────────────────────

export const requireAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(
      new ApiError(
        403,
        'Access denied. Admin privileges required.',
        undefined,
        ERROR_CODES.FORBIDDEN
      )
    )
  }
  next()
}

// ─────────────────────────────────────────────
// REQUIRE USER
// Must be used AFTER authenticate middleware
// Blocks admins from accessing user-only routes
// ─────────────────────────────────────────────

export const requireUser = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== 'USER') {
    return next(
      new ApiError(
        403,
        'Access denied. This route is for users only.',
        undefined,
        ERROR_CODES.FORBIDDEN
      )
    )
  }
  next()
}