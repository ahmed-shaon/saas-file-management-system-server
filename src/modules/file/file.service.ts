import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { ApiError } from '../../utils/ApiError'
import { ERROR_CODES } from '../../config/constants'
import { checkUploadAllowed } from '../../services/EnforcementService'

export interface UploadFileInput {
  userId: string
  folderId: string
  tempFilePath: string
  originalName: string
  mimeType: string
  sizeBytes: number
}

const getPermanentDir = (): string =>
  path.join(process.cwd(), env.UPLOAD_DIR, 'files')

export const getFilePath = (storedName: string): string =>
  path.join(getPermanentDir(), storedName)

const safeDeleteFile = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (_) { /* intentionally swallowed */ }
}

// ─────────────────────────────────────────────
// GET FILES IN FOLDER
// Verifies folder ownership before returning files.
// Returns 404 on ownership mismatch — never 403.
// ─────────────────────────────────────────────
export const getFilesInFolder = async (userId: string, folderId: string) => {
  const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } })
  if (!folder) {
    throw new ApiError(404, 'Folder not found.', undefined, ERROR_CODES.NOT_FOUND)
  }

  return prisma.file.findMany({
    where: { folderId, userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      fileType: true,
      folderId: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

// ─────────────────────────────────────────────
// UPLOAD FILE
//
// Flow:
//   1. Verify folder ownership (404 on mismatch)
//   2. Run all enforcement checks via checkUploadAllowed
//      (type, size, total limit, per-folder limit — 1 package DB call)
//   3. Duplicate filename check in same folder
//   4. Move file from temp → permanent storage
//   5. Insert DB record
//
// On any failure: temp file is deleted before throwing.
// On DB insert failure: permanent file is deleted (DB consistency priority).
// ─────────────────────────────────────────────
export const uploadFile = async ({
  userId,
  folderId,
  tempFilePath,
  originalName,
  mimeType,
  sizeBytes,
}: UploadFileInput) => {
  // 1. Verify folder ownership
  const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } })
  if (!folder) {
    safeDeleteFile(tempFilePath)
    throw new ApiError(404, 'Folder not found.', undefined, ERROR_CODES.NOT_FOUND)
  }

  // 2. Enforcement: type + size + total limit + per-folder limit (1 package resolve)
  let fileType: string
  try {
    fileType = await checkUploadAllowed(userId, folderId, mimeType, sizeBytes)
  } catch (err) {
    safeDeleteFile(tempFilePath)
    throw err
  }

  // 3. Duplicate filename check
  const existing = await prisma.file.findFirst({
    where: { folderId, originalName, userId },
  })
  if (existing) {
    safeDeleteFile(tempFilePath)
    throw new ApiError(
      409,
      `A file named "${originalName}" already exists in this folder. Please rename it before uploading.`,
      undefined,
      ERROR_CODES.DUPLICATE_ENTRY
    )
  }

  // 4. Move temp → permanent (UUID storedName — user input never touches filesystem paths)
  const ext = path.extname(originalName)
  const storedName = `${uuidv4()}${ext}`
  const permanentPath = getFilePath(storedName)

  try {
    fs.renameSync(tempFilePath, permanentPath)
  } catch (_) {
    safeDeleteFile(tempFilePath)
    throw new ApiError(
      500,
      'Failed to store the file. Please try again.',
      undefined,
      ERROR_CODES.INTERNAL_ERROR
    )
  }

  // 5. Insert DB record — if this fails, clean up the already-moved permanent file
  try {
    return await prisma.file.create({
      data: {
        originalName,
        storedName,
        mimeType,
        sizeBytes: BigInt(sizeBytes),
        fileType: fileType as 'IMAGE' | 'VIDEO' | 'PDF' | 'AUDIO',
        folderId,
        userId,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        fileType: true,
        folderId: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  } catch (err) {
    safeDeleteFile(permanentPath)
    throw err
  }
}

// ─────────────────────────────────────────────
// GET FILE FOR DOWNLOAD
// Verifies ownership, checks physical file exists on disk.
// Returns file metadata for the controller to stream.
// ─────────────────────────────────────────────
export const getFileForDownload = async (userId: string, fileId: string) => {
  const file = await prisma.file.findFirst({ where: { id: fileId, userId } })
  if (!file) {
    throw new ApiError(404, 'File not found.', undefined, ERROR_CODES.NOT_FOUND)
  }

  const filePath = getFilePath(file.storedName)
  if (!fs.existsSync(filePath)) {
    throw new ApiError(404, 'File not found on disk.', undefined, ERROR_CODES.NOT_FOUND)
  }

  return {
    filePath,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
  }
}

// ─────────────────────────────────────────────
// RENAME FILE
// No-op if same name. Duplicate check in same folder before update.
// ─────────────────────────────────────────────
export const renameFile = async (
  userId: string,
  fileId: string,
  newName: string
) => {
  const file = await prisma.file.findFirst({ where: { id: fileId, userId } })
  if (!file) {
    throw new ApiError(404, 'File not found.', undefined, ERROR_CODES.NOT_FOUND)
  }

  // No-op — return current record without a DB write
  if (file.originalName === newName) return file

  const duplicate = await prisma.file.findFirst({
    where: { folderId: file.folderId, originalName: newName, NOT: { id: fileId } },
  })
  if (duplicate) {
    throw new ApiError(
      409,
      `A file named "${newName}" already exists in this folder.`,
      undefined,
      ERROR_CODES.DUPLICATE_ENTRY
    )
  }

  return prisma.file.update({
    where: { id: fileId },
    data: { originalName: newName },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      fileType: true,
      folderId: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

// ─────────────────────────────────────────────
// DELETE FILE
// DB delete first, then disk cleanup.
// If disk cleanup fails, orphaned file remains but user cannot
// interact with it — DB consistency takes priority.
// ─────────────────────────────────────────────
export const deleteFile = async (userId: string, fileId: string) => {
  const file = await prisma.file.findFirst({ where: { id: fileId, userId } })
  if (!file) {
    throw new ApiError(404, 'File not found.', undefined, ERROR_CODES.NOT_FOUND)
  }

  await prisma.file.delete({ where: { id: fileId } })
  safeDeleteFile(getFilePath(file.storedName))
}