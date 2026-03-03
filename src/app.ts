import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from './config/env'
import { errorHandler } from './middlewares/errorHandler'
import { generalRateLimiter } from './middlewares/rateLimiter'  // ← correct name

import authRoutes from './modules/auth/auth.routes'
import subscriptionRoutes from './modules/subscription/subscription.routes'
import adminRoutes from './modules/admin/admin.routes'
import folderRoutes from './modules/folder/folder.routes'
import fileRoutes from './modules/file/file.routes'             // ← Phase 6

const app = express()

// ─── Security ────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// ─── Body parsing ─────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser(env.COOKIE_SECRET))

// ─── General rate limiter ─────────────────────
app.use(generalRateLimiter)                                     // ← correct name

// ─── Health check ─────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  })
})

// ─── Routes ───────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/folders', folderRoutes)
app.use('/api/files', fileRoutes)                               // ← Phase 6

// ─── 404 handler ──────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    code: 'NOT_FOUND',
    errors: null,
  })
})

// ─── Global error handler (must be last) ──────
app.use(errorHandler)

export default app