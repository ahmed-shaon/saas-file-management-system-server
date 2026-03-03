import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { sendSuccess } from '../../utils/ApiResponse'
import { env } from '../../config/env'
import * as authService from './auth.service'

// ─────────────────────────────────────────────
// COOKIE CONFIG
// ─────────────────────────────────────────────

// Centralized cookie options — used for both set and clear
const getCookieOptions = () => ({
  httpOnly: true,                                    // JS cannot access this cookie — XSS protection
  secure: env.isProduction,                          // HTTPS only in production
  sameSite: (env.isProduction ? 'strict' : 'lax') as 'strict' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,                  // 7 days in milliseconds
})

// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body)

  // Set JWT in HttpOnly cookie
  res.cookie('token', result.token, getCookieOptions())

  return sendSuccess(
    res,
    'Account created successfully',
    { user: result.user },
    201
  )
})

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body)

  // Set JWT in HttpOnly cookie
  res.cookie('token', result.token, getCookieOptions())

  return sendSuccess(res, 'Login successful', { user: result.user })
})

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // Clear the cookie by setting maxAge to 0
  res.cookie('token', '', {
    ...getCookieOptions(),
    maxAge: 0,
  })

  return sendSuccess(res, 'Logged out successfully')
})

// ─────────────────────────────────────────────
// GET CURRENT USER
// ─────────────────────────────────────────────

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  // req.user is attached by the authenticate middleware
  const result = await authService.getMe(req.user!.id)

  return sendSuccess(res, 'User fetched successfully', result)
})

// ─────────────────────────────────────────────
// FORGOT PASSWORD
// ─────────────────────────────────────────────

export const forgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await authService.forgotPassword(req.body)

    return sendSuccess(res, result.message, {
      // Only include token in development
      // In production this would be sent via email
      ...(env.isProduction ? {} : { token: result.token, expiresAt: result.expiresAt }),
    })
  }
)

// ─────────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────────

export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await authService.resetPassword(req.body)

    return sendSuccess(res, result.message)
  }
)