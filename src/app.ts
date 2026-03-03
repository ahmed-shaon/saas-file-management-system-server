import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from './config/env'
import { errorHandler } from './middlewares/errorHandler'
import { generalRateLimiter } from './middlewares/rateLimiter'

// ── Route Imports ──────────────────────────────
import authRoutes from './modules/auth/auth.routes'
import subscriptionRoutes from './modules/subscription/subscription.routes'
import adminRoutes from './modules/admin/admin.routes'
// Future phases will add more routes here

const app = express()

// ─────────────────────────────────────────────
// SECURITY MIDDLEWARE
// Order matters — security headers must come first
// ─────────────────────────────────────────────

app.use(helmet())

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true, // Required for cookies to be sent cross-origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// ─────────────────────────────────────────────
// BODY PARSING
// ─────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser(env.COOKIE_SECRET))

// ─────────────────────────────────────────────
// GENERAL RATE LIMITING
// Applied to all routes
// ─────────────────────────────────────────────

app.use(generalRateLimiter)

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  })
})

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

app.use('/api/auth', authRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.use('/api/admin', adminRoutes)
// Phase 5: app.use('/api/folders', folderRoutes)
// Phase 6: app.use('/api/files', fileRoutes)

// ─────────────────────────────────────────────
// 404 HANDLER
// Catches requests to undefined routes
// ─────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    code: 'NOT_FOUND',
    errors: null,
  })
})

// ─────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// Must be registered last — after all routes
// ─────────────────────────────────────────────

app.use(errorHandler)

export default app