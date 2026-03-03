import { prisma } from '../config/database'
import { ApiError } from '../utils/ApiError'
import { ERROR_CODES } from '../config/constants'
import { getActivePackage } from '../modules/subscription/subscription.service'

// ─────────────────────────────────────────────
// INTERNAL HELPER
// Fetches the user's active package once.
// Every public check method calls this first.
// getActivePackage never returns null — it always falls back to Free.
// ─────────────────────────────────────────────

const resolvePackage = async (userId: string) => {
  const { package: activePackage } = await getActivePackage(userId)
  return activePackage
}

// ─────────────────────────────────────────────
// MIME → FileType MAP
// Maps incoming MIME types to our Prisma FileType enum values.
// Any MIME not in this map is considered unsupported.
// ─────────────────────────────────────────────

const MIME_TO_FILE_TYPE: Record<string, string> = {
  // IMAGE
  'image/jpeg': 'IMAGE',
  'image/jpg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/gif': 'IMAGE',
  'image/webp': 'IMAGE',
  'image/svg+xml': 'IMAGE',
  'image/bmp': 'IMAGE',
  'image/tiff': 'IMAGE',

  // VIDEO
  'video/mp4': 'VIDEO',
  'video/mpeg': 'VIDEO',
  'video/quicktime': 'VIDEO',
  'video/x-msvideo': 'VIDEO',
  'video/webm': 'VIDEO',
  'video/x-matroska': 'VIDEO',

  // PDF
  'application/pdf': 'PDF',

  // AUDIO
  'audio/mpeg': 'AUDIO',
  'audio/mp3': 'AUDIO',
  'audio/wav': 'AUDIO',
  'audio/ogg': 'AUDIO',
  'audio/flac': 'AUDIO',
  'audio/aac': 'AUDIO',
  'audio/x-m4a': 'AUDIO',
}

// ─────────────────────────────────────────────
// 1. CHECK FOLDER LIMIT
// Called before: creating any folder
//
// Checks: user's total folder count vs package maxFolders
// ─────────────────────────────────────────────

export const checkFolderLimit = async (userId: string): Promise<void> => {
  const activePackage = await resolvePackage(userId)

  const currentFolderCount = await prisma.folder.count({
    where: { userId },
  })

  if (currentFolderCount >= activePackage.maxFolders) {
    throw new ApiError(
      422,
      `Folder limit reached. Your ${activePackage.name} plan allows a maximum of ${activePackage.maxFolders} folder(s). You currently have ${currentFolderCount}. Please upgrade your plan or delete existing folders.`,
      undefined,
      ERROR_CODES.FOLDER_LIMIT_REACHED
    )
  }
}

// ─────────────────────────────────────────────
// 2. CHECK NESTING LEVEL
// Called before: creating a folder inside a parent
//
// depthLevel is 0-indexed — root folders are level 0.
// maxNestingLevel 2 means:
//   root(0) → child(1) → grandchild(2) ✔  allowed
//   root(0) → child(1) → grandchild(2) → great(3) ✗  blocked
//
// parentId = null means root folder (depth 0) — always allowed.
// ─────────────────────────────────────────────

export const checkNestingLevel = async (
  userId: string,
  parentId: string | null
): Promise<void> => {
  // Root-level folder — depth is 0, no nesting to enforce
  if (!parentId) return

  const activePackage = await resolvePackage(userId)

  const parentFolder = await prisma.folder.findUnique({
    where: { id: parentId },
    select: { depthLevel: true, userId: true },
  })

  // Return 404 not 403 — don't confirm the folder exists to other users
  if (!parentFolder || parentFolder.userId !== userId) {
    throw new ApiError(
      404,
      'Parent folder not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  // New folder depth = parent depth + 1
  const newDepthLevel = parentFolder.depthLevel + 1

  if (newDepthLevel > activePackage.maxNestingLevel) {
    throw new ApiError(
      422,
      `Folder nesting limit reached. Your ${activePackage.name} plan allows a maximum nesting depth of ${activePackage.maxNestingLevel}. This folder would be at depth ${newDepthLevel}. Please upgrade your plan.`,
      undefined,
      ERROR_CODES.NESTING_LIMIT_REACHED
    )
  }
}

// ─────────────────────────────────────────────
// 3. CHECK FILES PER FOLDER
// Called before: uploading a file into a specific folder
//
// Checks: current file count in target folder vs package filesPerFolder
// ─────────────────────────────────────────────

export const checkFilesPerFolder = async (
  userId: string,
  folderId: string
): Promise<void> => {
  const activePackage = await resolvePackage(userId)

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { userId: true },
  })

  // Return 404 not 403 — don't confirm the folder exists to other users
  if (!folder || folder.userId !== userId) {
    throw new ApiError(
      404,
      'Folder not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  const fileCountInFolder = await prisma.file.count({
    where: { folderId, userId },
  })

  if (fileCountInFolder >= activePackage.filesPerFolder) {
    throw new ApiError(
      422,
      `This folder is full. Your ${activePackage.name} plan allows a maximum of ${activePackage.filesPerFolder} file(s) per folder. Please upgrade your plan or upload to a different folder.`,
      undefined,
      ERROR_CODES.FOLDER_FILE_LIMIT_REACHED
    )
  }
}

// ─────────────────────────────────────────────
// 4. CHECK TOTAL FILE LIMIT
// Called before: uploading any file
//
// Checks: user's total file count across all folders vs package totalFileLimit
// ─────────────────────────────────────────────

export const checkTotalFileLimit = async (userId: string): Promise<void> => {
  const activePackage = await resolvePackage(userId)

  const totalFiles = await prisma.file.count({
    where: { userId },
  })

  if (totalFiles >= activePackage.totalFileLimit) {
    throw new ApiError(
      422,
      `Total file limit reached. Your ${activePackage.name} plan allows a maximum of ${activePackage.totalFileLimit} file(s). You currently have ${totalFiles}. Please upgrade your plan or delete existing files.`,
      undefined,
      ERROR_CODES.TOTAL_FILE_LIMIT_REACHED
    )
  }
}

// ─────────────────────────────────────────────
// 5. CHECK FILE SIZE LIMIT (internal)
// Receives already-resolved package — no extra DB call.
// Synchronous — pure arithmetic check.
// ─────────────────────────────────────────────

const checkFileSizeLimit = (
  activePackage: Awaited<ReturnType<typeof resolvePackage>>,
  sizeBytes: number
): void => {
  const maxSizeBytes = activePackage.maxFileSizeMb * 1024 * 1024

  if (sizeBytes > maxSizeBytes) {
    const fileSizeMb = (sizeBytes / (1024 * 1024)).toFixed(2)
    throw new ApiError(
      422,
      `File too large. Your ${activePackage.name} plan allows files up to ${activePackage.maxFileSizeMb} MB. This file is ${fileSizeMb} MB. Please upgrade your plan or compress the file.`,
      undefined,
      ERROR_CODES.FILE_TOO_LARGE
    )
  }
}

// ─────────────────────────────────────────────
// 6. CHECK FILE TYPE ALLOWED (internal)
// Receives already-resolved package — no extra DB call.
// Synchronous — pure lookup + array check.
//
// Returns the resolved FileType string so the file controller
// can store it in the DB without re-resolving.
// ─────────────────────────────────────────────

const checkFileTypeAllowed = (
  activePackage: Awaited<ReturnType<typeof resolvePackage>>,
  mimeType: string
): string => {
  // Normalise to lowercase — MIME types are case-insensitive per spec
  const normalised = mimeType.toLowerCase()
  const fileType = MIME_TO_FILE_TYPE[normalised]

  if (!fileType) {
    throw new ApiError(
      422,
      `Unsupported file type "${mimeType}". Supported types are: images, videos, PDFs, and audio files.`,
      undefined,
      ERROR_CODES.FILE_TYPE_NOT_ALLOWED
    )
  }

  // allowedFileTypes is stored as Json in Prisma — cast to string[]
  const allowedTypes = activePackage.allowedFileTypes as string[]

  if (!allowedTypes.includes(fileType)) {
    throw new ApiError(
      422,
      `File type not allowed on your plan. Your ${activePackage.name} plan only allows: ${allowedTypes.join(', ')}. This file is ${fileType}.`,
      undefined,
      ERROR_CODES.FILE_TYPE_NOT_ALLOWED
    )
  }

  return fileType
}

// ─────────────────────────────────────────────
// 7. CHECK FOLDER CREATE ALLOWED (composite — public)
// Called by: folder create controller
//
// Resolves package once and runs both folder checks.
// 1 package DB call instead of 2.
// ─────────────────────────────────────────────

export const checkFolderCreateAllowed = async (
  userId: string,
  parentId: string | null
): Promise<void> => {
  const activePackage = await resolvePackage(userId)

  // Check 1: total folder count
  const currentFolderCount = await prisma.folder.count({
    where: { userId },
  })

  if (currentFolderCount >= activePackage.maxFolders) {
    throw new ApiError(
      422,
      `Folder limit reached. Your ${activePackage.name} plan allows a maximum of ${activePackage.maxFolders} folder(s). You currently have ${currentFolderCount}. Please upgrade your plan or delete existing folders.`,
      undefined,
      ERROR_CODES.FOLDER_LIMIT_REACHED
    )
  }

  // Check 2: nesting depth (only if creating inside a parent)
  if (parentId) {
    const parentFolder = await prisma.folder.findUnique({
      where: { id: parentId },
      select: { depthLevel: true, userId: true },
    })

    // 404 for both not-found and wrong-owner — don't leak existence
    if (!parentFolder || parentFolder.userId !== userId) {
      throw new ApiError(
        404,
        'Parent folder not found.',
        undefined,
        ERROR_CODES.NOT_FOUND
      )
    }

    const newDepthLevel = parentFolder.depthLevel + 1

    if (newDepthLevel > activePackage.maxNestingLevel) {
      throw new ApiError(
        422,
        `Folder nesting limit reached. Your ${activePackage.name} plan allows a maximum nesting depth of ${activePackage.maxNestingLevel}. This folder would be at depth ${newDepthLevel}. Please upgrade your plan.`,
        undefined,
        ERROR_CODES.NESTING_LIMIT_REACHED
      )
    }
  }
}

// ─────────────────────────────────────────────
// 8. CHECK UPLOAD ALLOWED (composite — public)
// Called by: file upload controller
//
// Resolves package ONCE — reused across all sub-checks.
// This is 1 package DB call total instead of 4.
//
// Order — cheapest first (fail fast):
//   1. File type check   — synchronous, 0 extra DB calls
//   2. File size check   — synchronous, 0 extra DB calls
//   3. Total file limit  — 1 DB count
//   4. Files per folder  — 1 DB lookup + 1 DB count
//
// Returns resolved fileType string ('IMAGE' | 'VIDEO' | 'PDF' | 'AUDIO')
// so the file controller stores it without a second resolution.
// ─────────────────────────────────────────────

export const checkUploadAllowed = async (
  userId: string,
  folderId: string,
  mimeType: string,
  sizeBytes: number
): Promise<string> => {
  // Resolve package once — passed to synchronous sub-checks
  const activePackage = await resolvePackage(userId)

  // 1 + 2: synchronous — no extra DB calls
  const fileType = checkFileTypeAllowed(activePackage, mimeType)
  checkFileSizeLimit(activePackage, sizeBytes)

  // 3: total file count
  const totalFiles = await prisma.file.count({ where: { userId } })

  if (totalFiles >= activePackage.totalFileLimit) {
    throw new ApiError(
      422,
      `Total file limit reached. Your ${activePackage.name} plan allows a maximum of ${activePackage.totalFileLimit} file(s). You currently have ${totalFiles}. Please upgrade your plan or delete existing files.`,
      undefined,
      ERROR_CODES.TOTAL_FILE_LIMIT_REACHED
    )
  }

  // 4: folder ownership + files-per-folder count
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { userId: true },
  })

  // 404 not 403 — don't confirm folder existence to wrong users
  if (!folder || folder.userId !== userId) {
    throw new ApiError(
      404,
      'Folder not found.',
      undefined,
      ERROR_CODES.NOT_FOUND
    )
  }

  const fileCountInFolder = await prisma.file.count({
    where: { folderId, userId },
  })

  if (fileCountInFolder >= activePackage.filesPerFolder) {
    throw new ApiError(
      422,
      `This folder is full. Your ${activePackage.name} plan allows a maximum of ${activePackage.filesPerFolder} file(s) per folder. Please upgrade your plan or upload to a different folder.`,
      undefined,
      ERROR_CODES.FOLDER_FILE_LIMIT_REACHED
    )
  }

  return fileType
}