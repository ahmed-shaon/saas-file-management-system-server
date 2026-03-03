import { prisma } from '../../config/database'
import { ApiError } from '../../utils/ApiError'
import { ERROR_CODES } from '../../config/constants'
import type { SelectPackageInput } from './subscription.schema'

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// Computes expiry date based on package duration
// Returns null if durationDays is null (never expires — Free tier)
const computeExpiresAt = (durationDays: number | null): Date | null => {
  if (!durationDays) return null
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + durationDays)
  return expiresAt
}

// Core function used across the entire app
// Always returns a valid package — falls back to Free if expired or missing
// This is the single source of truth for "what package is this user on"
export const getActivePackage = async (userId: string) => {
  const subscription = await prisma.userSubscription.findFirst({
    where: { userId, isActive: true },
    include: { package: true },
    orderBy: { createdAt: 'desc' },
  })

  // No active subscription OR subscription has expired
  // Explicitly cast to boolean — avoids TypeScript inferring Date | boolean
  const isExpired: boolean =
    subscription?.expiresAt !== null &&
    subscription?.expiresAt !== undefined &&
    new Date(subscription.expiresAt) < new Date()

  if (!subscription || isExpired) {
    // Always fall back to Free (default) package
    const defaultPackage = await prisma.subscriptionPackage.findFirst({
      where: { isDefault: true, isActive: true },
    })

    if (!defaultPackage) {
      throw new ApiError(
        500,
        'Default subscription package not found.',
        undefined,
        ERROR_CODES.INTERNAL_ERROR
      )
    }

    return {
      package: defaultPackage,
      subscription: null,
      isExpired: !!subscription && isExpired,
      isOnDefaultPackage: true,
    }
  }

  return {
    package: subscription.package,
    subscription,
    isExpired: false,
    isOnDefaultPackage: subscription.package.isDefault,
  }
}

// ─────────────────────────────────────────────
// GET ALL ACTIVE PACKAGES
// For the user-facing package selection UI
// Only returns active packages — inactive ones are hidden
// ─────────────────────────────────────────────

export const getAvailablePackages = async () => {
  const packages = await prisma.subscriptionPackage.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' }, // Show in creation order: Free, Silver, Gold, Diamond
  })

  return packages
}

// ─────────────────────────────────────────────
// GET CURRENT SUBSCRIPTION + USAGE STATS
// Returns active package with real-time usage data
// This powers the storage usage bar on the dashboard
// ─────────────────────────────────────────────

export const getCurrentSubscription = async (userId: string) => {
  const { package: activePackage, subscription, isExpired, isOnDefaultPackage } =
    await getActivePackage(userId)

  // Real-time usage counts — always live from DB, never cached
  // These are the values enforced against package limits
  const [totalFolders, totalFiles] = await Promise.all([
    prisma.folder.count({ where: { userId } }),
    prisma.file.count({ where: { userId } }),
  ])

  // Total storage used in bytes — informational only
  // Package limits are count-based, not byte-based
  const storageSumResult = await prisma.file.aggregate({
    where: { userId },
    _sum: { sizeBytes: true },
  })

  const totalStorageBytes = storageSumResult._sum.sizeBytes ?? BigInt(0)

  return {
    subscription,
    activePackage,
    isExpired,
    isOnDefaultPackage,
    usage: {
      totalFolders,
      totalFiles,
      totalStorageBytes: totalStorageBytes.toString(), // BigInt → string for JSON
      // Percentage helpers for the UI progress bars
      foldersUsedPercent:
        Math.min((totalFolders / activePackage.maxFolders) * 100, 100).toFixed(1),
      filesUsedPercent:
        Math.min((totalFiles / activePackage.totalFileLimit) * 100, 100).toFixed(1),
    },
    limits: {
      maxFolders: activePackage.maxFolders,
      maxNestingLevel: activePackage.maxNestingLevel,
      maxFileSizeMb: activePackage.maxFileSizeMb,
      totalFileLimit: activePackage.totalFileLimit,
      filesPerFolder: activePackage.filesPerFolder,
      allowedFileTypes: activePackage.allowedFileTypes,
    },
  }
}

// ─────────────────────────────────────────────
// GET SUBSCRIPTION HISTORY
// Append-only history — every package switch is a new row
// Ordered newest first
// ─────────────────────────────────────────────

export const getSubscriptionHistory = async (userId: string) => {
  const history = await prisma.userSubscription.findMany({
    where: { userId },
    include: {
      // LEFT JOIN — shows package name even if package was later deactivated
      package: {
        select: {
          id: true,
          name: true,
          maxFolders: true,
          maxNestingLevel: true,
          maxFileSizeMb: true,
          totalFileLimit: true,
          filesPerFolder: true,
          allowedFileTypes: true,
          durationDays: true,
          isActive: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' }, // Newest first
  })

  return history
}

// ─────────────────────────────────────────────
// SELECT PACKAGE
// User switches to a different package
//
// Flow:
// 1. Validate package exists and is active
// 2. Prevent selecting the same package twice
// 3. In a transaction:
//    a. Deactivate current active subscription
//    b. Insert new subscription row (history preserved)
// 4. Return new subscription
//
// Downgrade behavior:
// - We ALLOW the switch regardless of current usage
// - Enforcement logic (Phase 4) blocks NEW actions if over limit
// - Existing data is never deleted
// ─────────────────────────────────────────────

export const selectPackage = async (
  userId: string,
  input: SelectPackageInput
) => {
  const { packageId } = input

  // 1. Verify the package exists and is active
  const newPackage = await prisma.subscriptionPackage.findUnique({
    where: { id: packageId },
  })

  if (!newPackage) {
    throw new ApiError(
      404,
      'Subscription package not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  if (!newPackage.isActive) {
    throw new ApiError(
      400,
      'This subscription package is no longer available.',
      undefined,
      ERROR_CODES.VALIDATION_ERROR
    )
  }

  // 2. Check if user is already on this package (and it hasn't expired)
  const current = await prisma.userSubscription.findFirst({
    where: { userId, isActive: true },
    include: { package: true },
  })

  const currentIsExpired =
    current?.expiresAt !== null &&
    current?.expiresAt !== undefined &&
    new Date(current.expiresAt) < new Date()

  if (current && !currentIsExpired && current.packageId === packageId) {
    throw new ApiError(
      400,
      'You are already subscribed to this package.',
      undefined,
      ERROR_CODES.VALIDATION_ERROR
    )
  }

  // 3. Compute expiry for new subscription
  const expiresAt = computeExpiresAt(newPackage.durationDays)

  // 4. Deactivate old subscription + create new one in a transaction
  // This guarantees only ONE active subscription at any time
  // If anything fails, the whole operation rolls back
  const newSubscription = await prisma.$transaction(async (tx) => {
    // Deactivate ALL active subscriptions for this user (defensive — should only be one)
    await tx.userSubscription.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    })

    // Insert new subscription row — history is preserved in older rows
    const subscription = await tx.userSubscription.create({
      data: {
        userId,
        packageId,
        startedAt: new Date(),
        expiresAt,
        isActive: true,
      },
      include: { package: true },
    })

    return subscription
  })

  return {
    subscription: newSubscription,
    package: newSubscription.package,
    message: `Successfully switched to ${newPackage.name} package.`,
  }
}