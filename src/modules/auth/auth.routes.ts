import { Router } from 'express'
import { validate } from '../../utils/validate'
import { authenticate } from '../../middlewares/authenticate'
import { authRateLimiter } from '../../middlewares/rateLimiter'
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.schema'
import * as authController from './auth.controller'

const router = Router()

// ─────────────────────────────────────────────
// PUBLIC ROUTES
// No authentication required
// Rate limited to prevent brute force
// ─────────────────────────────────────────────

// POST /api/auth/register
router.post(
  '/register',
  authRateLimiter,
  validate(registerSchema),
  authController.register
)

// POST /api/auth/login
router.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  authController.login
)

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  authRateLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
)

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  authRateLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
)

// ─────────────────────────────────────────────
// PROTECTED ROUTES
// Require valid JWT cookie
// ─────────────────────────────────────────────

// POST /api/auth/logout
router.post('/logout', authenticate, authController.logout)

// GET /api/auth/me
router.get('/me', authenticate, authController.getMe)

export default router