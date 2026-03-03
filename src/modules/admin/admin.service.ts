import { prisma } from '../../config/database'
import { ApiError } from '../../utils/ApiError'
import { ERROR_CODES } from '../../config/constants'
import type { CreatePackageInput, UpdatePackageInput, UpdateUserStatusInput } from './admin.schema'

// ─────────────────────────────────────────────
// PACKAGE MANAGEMENT
// ─────────────────────────────────────────────

// GET ALL PACKAGES (admin sees everything including inactive)
export const getAllPackages = async () => {
  // Fetch all packages first
  const packages = await prisma.subscriptionPackage.findMany({
    orderBy: { createdAt: 'asc' },
  })

  // Count active subscribers per package in a single query
  // Group by packageId and filter isActive = true
  // This avoids filtered _count inside include which has inconsistent
  // Prisma version support
  const activeSubscriptionCounts = await prisma.userSubscription.groupBy({
    by: ['packageId'],
    where: { isActive: true },
    _count: { packageId: true },
  })

  // Build a lookup map: packageId → count
  const countMap = new Map(
    activeSubscriptionCounts.map((row) => [row.packageId, row._count.packageId])
  )

  // Attach activeSubscriberCount to each package
  const packagesWithCount = packages.map((pkg) => ({
    ...pkg,
    activeSubscriberCount: countMap.get(pkg.id) ?? 0,
  }))

  return packagesWithCount
}

// ─────────────────────────────────────────────
// CREATE PACKAGE
// ─────────────────────────────────────────────

export const createPackage = async (input: CreatePackageInput) => {
  const {
    name,
    maxFolders,
    maxNestingLevel,
    maxFileSizeMb,
    totalFileLimit,
    filesPerFolder,
    allowedFileTypes,
    durationDays,
  } = input

  // Check for duplicate package name
  const existing = await prisma.subscriptionPackage.findUnique({
    where: { name },
  })

  if (existing) {
    throw new ApiError(
      409,
      `A package named "${name}" already exists.`,
      undefined,
      ERROR_CODES.DUPLICATE_ENTRY
    )
  }

  const newPackage = await prisma.subscriptionPackage.create({
    data: {
      name,
      maxFolders,
      maxNestingLevel,
      maxFileSizeMb,
      totalFileLimit,
      filesPerFolder,
      allowedFileTypes,
      durationDays,
      isActive: true,
      isDefault: false, // Admin-created packages are never the default
    },
  })

  return newPackage
}

// ─────────────────────────────────────────────
// UPDATE PACKAGE
// Partial update — only provided fields are changed
//
// Important business rule:
// Updating a package immediately affects ALL users on that package
// because enforcement checks always read the package live from DB.
// This is intentional — admin changes take effect immediately.
// ─────────────────────────────────────────────

export const updatePackage = async (
  packageId: string,
  input: UpdatePackageInput
) => {
  // Verify package exists
  const existing = await prisma.subscriptionPackage.findUnique({
    where: { id: packageId },
  })

  if (!existing) {
    throw new ApiError(
      404,
      'Subscription package not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  // Prevent renaming to an existing package name
  if (input.name && input.name !== existing.name) {
    const nameConflict = await prisma.subscriptionPackage.findUnique({
      where: { name: input.name },
    })

    if (nameConflict) {
      throw new ApiError(
        409,
        `A package named "${input.name}" already exists.`,
        undefined,
        ERROR_CODES.DUPLICATE_ENTRY
      )
    }
  }

  const updated = await prisma.subscriptionPackage.update({
    where: { id: packageId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.maxFolders !== undefined && { maxFolders: input.maxFolders }),
      ...(input.maxNestingLevel !== undefined && { maxNestingLevel: input.maxNestingLevel }),
      ...(input.maxFileSizeMb !== undefined && { maxFileSizeMb: input.maxFileSizeMb }),
      ...(input.totalFileLimit !== undefined && { totalFileLimit: input.totalFileLimit }),
      ...(input.filesPerFolder !== undefined && { filesPerFolder: input.filesPerFolder }),
      ...(input.allowedFileTypes !== undefined && { allowedFileTypes: input.allowedFileTypes }),
      ...(input.durationDays !== undefined && { durationDays: input.durationDays }),
    },
  })

  return updated
}

// ─────────────────────────────────────────────
// DELETE PACKAGE (Soft Delete)
//
// Rules:
// 1. Cannot delete the default package (Free tier)
// 2. Cannot delete a package that has active subscribers
//    — admin must wait for users to switch away
// 3. Soft delete: sets isActive = false
//    — history rows still reference the package via LEFT JOIN
// ─────────────────────────────────────────────

export const deletePackage = async (packageId: string) => {
  const existing = await prisma.subscriptionPackage.findUnique({
    where: { id: packageId },
  })

  if (!existing) {
    throw new ApiError(
      404,
      'Subscription package not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  // Rule 1: Cannot delete the default package
  if (existing.isDefault) {
    throw new ApiError(
      400,
      'The default package cannot be deleted. It is required for new user registration.',
      undefined,
      ERROR_CODES.VALIDATION_ERROR
    )
  }

  // Rule 2: Separate count query — more compatible across Prisma versions
  // than using filtered _count inside findUnique
  const activeSubscriberCount = await prisma.userSubscription.count({
    where: { packageId, isActive: true },
  })

  if (activeSubscriberCount > 0) {
    throw new ApiError(
      400,
      `Cannot delete this package — ${activeSubscriberCount} user(s) are currently subscribed. Wait for them to switch packages first.`,
      undefined,
      ERROR_CODES.VALIDATION_ERROR
    )
  }

  // Rule 3: Soft delete — preserve history integrity
  await prisma.subscriptionPackage.update({
    where: { id: packageId },
    data: { isActive: false },
  })

  return { message: `Package "${existing.name}" has been deactivated successfully.` }
}

// ─────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────

// GET ALL USERS (paginated)
export const getAllUsers = async (page: number, limit: number) => {
  const skip = (page - 1) * limit

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'USER' }, // Admin only manages regular users
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Include current active subscription
        subscriptions: {
          where: { isActive: true },
          include: {
            package: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        // Include usage counts
        _count: {
          select: {
            folders: true,
            files: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where: { role: 'USER' } }),
  ])

  return {
    users,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  }
}

// GET USER DETAIL WITH FULL SUBSCRIPTION HISTORY
export const getUserDetail = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      subscriptions: {
        include: {
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
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: {
          folders: true,
          files: true,
        },
      },
    },
  })

  if (!user) {
    throw new ApiError(
      404,
      'User not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  // Storage usage
  const storageSumResult = await prisma.file.aggregate({
    where: { userId },
    _sum: { sizeBytes: true },
  })

  return {
    ...user,
    totalStorageBytes: (storageSumResult._sum.sizeBytes ?? BigInt(0)).toString(),
  }
}

// UPDATE USER STATUS (activate / deactivate)
export const updateUserStatus = async (
  userId: string,
  input: UpdateUserStatusInput
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    throw new ApiError(
      404,
      'User not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  // Prevent admin from deactivating themselves or other admins
  if (user.role === 'ADMIN') {
    throw new ApiError(
      403,
      'Admin accounts cannot be deactivated through this endpoint.',
      undefined,
      ERROR_CODES.FORBIDDEN
    )
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: input.isActive },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  })

  return {
    user: updated,
    message: `User has been ${input.isActive ? 'activated' : 'deactivated'} successfully.`,
  }
}