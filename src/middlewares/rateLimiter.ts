import rateLimit from 'express-rate-limit'

// ─────────────────────────────────────────────
// AUTH RATE LIMITER
// Protects login and register from brute force
// 15 requests per 15 minutes per IP
// NOTE: express-rate-limit v7+ uses 'limit' not 'max'
// ─────────────────────────────────────────────

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 15,                 // v7+ uses 'limit' instead of 'max'
  message: {
    success: false,
    message: 'Too many attempts. Please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
    errors: null,
  },
  standardHeaders: 'draft-7', // v7+ recommended header format
  legacyHeaders: false,
})

// ─────────────────────────────────────────────
// UPLOAD RATE LIMITER
// Prevents upload abuse
// 30 requests per hour per IP
// ─────────────────────────────────────────────

export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 30,
  message: {
    success: false,
    message: 'Upload limit exceeded. Please try again after an hour.',
    code: 'RATE_LIMIT_EXCEEDED',
    errors: null,
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

// ─────────────────────────────────────────────
// GENERAL API RATE LIMITER
// Broad protection on all routes
// 300 requests per 15 minutes per IP
// ─────────────────────────────────────────────

export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
    code: 'RATE_LIMIT_EXCEEDED',
    errors: null,
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})