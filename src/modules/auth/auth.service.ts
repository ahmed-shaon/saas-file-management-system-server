import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { ApiError } from '../../utils/ApiError'
import { ERROR_CODES } from '../../config/constants'
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from './auth.schema'

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface AuthTokenPayload {
  id: string
  email: string
  role: 'ADMIN' | 'USER'
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// Generates a signed JWT containing user identity
const generateToken = (payload: AuthTokenPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions)
}

// Returns safe user fields — never return passwordHash to client
const sanitizeUser = (user: {
  id: string
  fullName: string
  email: string
  role: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
})

// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────

export const register = async (input: RegisterInput) => {
  const { fullName, email, password } = input

  // 1. Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  })

  if (existingUser) {
    throw new ApiError(
      409,
      'An account with this email already exists',
      undefined,
      ERROR_CODES.DUPLICATE_ENTRY
    )
  }

  // 2. Find the default package (Free tier)
  // This always exists — protected from deletion in package management
  const defaultPackage = await prisma.subscriptionPackage.findFirst({
    where: { isDefault: true, isActive: true },
  })

  if (!defaultPackage) {
    throw new ApiError(
      500,
      'Default subscription package not found. Please contact support.',
      undefined,
      ERROR_CODES.INTERNAL_ERROR
    )
  }

  // 3. Hash password with bcrypt (12 rounds = good balance of security vs speed)
  // Each additional round doubles the hashing time
  // 12 rounds ≈ 300ms — slow enough to deter brute force, fast enough for UX
  const passwordHash = await bcrypt.hash(password, 12)

  // 4. Create user AND subscription in a single transaction
  // If either fails, both are rolled back — no orphaned users without subscriptions
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role: 'USER',
        isActive: true,
      },
    })

    // Free package has null durationDays = never expires
    const subscription = await tx.userSubscription.create({
      data: {
        userId: user.id,
        packageId: defaultPackage.id,
        startedAt: new Date(),
        expiresAt: null, // Free tier never expires
        isActive: true,
      },
    })

    return { user, subscription }
  })

  // 5. Generate JWT
  const token = generateToken({
    id: result.user.id,
    email: result.user.email,
    role: result.user.role as 'ADMIN' | 'USER',
  })

  return {
    user: sanitizeUser(result.user),
    token,
  }
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

export const login = async (input: LoginInput) => {
  const { email, password } = input

  // 1. Find user by email — include passwordHash for comparison
  const user = await prisma.user.findUnique({
    where: { email },
  })

  // 2. Always run bcrypt.compare even if user not found
  // This prevents timing attacks — attacker cannot determine
  // if an email exists based on response time difference
  // Real valid bcrypt hash used as dummy — ensures full algorithm runs
  // even when user is not found, preventing timing attacks
  const DUMMY_HASH = '$2a$12$KIXHMGGGlHFMCf6A/I1wROBPGMGDDuMCwVJDCHjlK9A4HnQwXD9X2'
  const isPasswordValid = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_HASH
  )

  if (!user || !isPasswordValid) {
    throw new ApiError(
      401,
      'Invalid email or password',
      undefined,
      ERROR_CODES.UNAUTHORIZED
    )
  }

  // 3. Check if account is active
  if (!user.isActive) {
    throw new ApiError(
      403,
      'Your account has been deactivated. Please contact support.',
      undefined,
      ERROR_CODES.FORBIDDEN
    )
  }

  // 4. Generate JWT
  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role as 'ADMIN' | 'USER',
  })

  return {
    user: sanitizeUser(user),
    token,
  }
}

// ─────────────────────────────────────────────
// GET CURRENT USER
// ─────────────────────────────────────────────

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        where: { isActive: true },
        include: { package: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!user) {
    throw new ApiError(
      404,
      'User not found',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  const activeSubscription = user.subscriptions[0]

  // Check if the active subscription has expired (lazy evaluation)
  // We do not update the DB row here — just treat it as expired in memory
  const isExpired =
    activeSubscription?.expiresAt !== null &&
    activeSubscription?.expiresAt !== undefined &&
    new Date(activeSubscription.expiresAt) < new Date()

  // If expired or no subscription found, fall back to the Free (default) package
  // Frontend ALWAYS receives a package with limits — never null limits
  if (!activeSubscription || isExpired) {
    const defaultPackage = await prisma.subscriptionPackage.findFirst({
      where: { isDefault: true, isActive: true },
    })

    return {
      user: sanitizeUser(user),
      subscription: null,
      activePackage: defaultPackage,
      isOnDefaultPackage: true,
    }
  }

  return {
    user: sanitizeUser(user),
    subscription: activeSubscription,
    activePackage: activeSubscription.package,
    isOnDefaultPackage: false,
  }
}

// ─────────────────────────────────────────────
// FORGOT PASSWORD
// ─────────────────────────────────────────────

// Unified return type — consistent shape whether user exists or not
interface ForgotPasswordResult {
  message: string
  token: string | null
  expiresAt: Date | null
}

export const forgotPassword = async (
  input: ForgotPasswordInput
): Promise<ForgotPasswordResult> => {
  const { email } = input

  const user = await prisma.user.findUnique({ where: { email } })

  // IMPORTANT: Always return the same response shape whether user exists or not
  // This prevents email enumeration attacks — attacker cannot determine
  // which emails are registered by checking the response
  if (!user) {
    return {
      message:
        'If an account with that email exists, a reset token has been generated.',
      token: null,
      expiresAt: null,
    }
  }

  // Generate a cryptographically secure random token
  const resetToken = crypto.randomBytes(32).toString('hex')

  // Hash the token before storing — if DB is compromised,
  // attacker cannot use raw tokens from the DB directly
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex')

  // Token expires in 1 hour
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpires: expiresAt,
    },
  })

  // In production: send resetToken via email (not hashedToken)
  // For this assessment: return the raw token in the response
  // so it can be tested without an email server
  return {
    message:
      'If an account with that email exists, a reset token has been generated.',
    token: resetToken, // NOTE: In production this goes via email, not in the response
    expiresAt,
  }
}

// ─────────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────────

export const resetPassword = async (input: ResetPasswordInput) => {
  const { token, password } = input

  // Hash the incoming token to compare with stored hash
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex')

  // Find user with this token that has not expired
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpires: {
        gt: new Date(), // token must not be expired
      },
    },
  })

  if (!user) {
    throw new ApiError(
      400,
      'Invalid or expired reset token',
      undefined,
      ERROR_CODES.VALIDATION_ERROR
    )
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(password, 12)

  // Update password and clear reset token fields in one operation
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  })

  return {
    message: 'Password reset successful. You can now log in with your new password.',
  }
}