import { Request, Response } from 'express'
import fs from 'fs'
import { asyncHandler } from '../../utils/asyncHandler'
import { sendSuccess } from '../../utils/ApiResponse'
import { validate } from '../../utils/validate'
import { renameFileSchema } from './file.schema'
import * as fileService from './file.service'
import { ApiError } from '../../utils/ApiError'
import { ERROR_CODES } from '../../config/constants'

// ─────────────────────────────────────────────
// GET /api/files/folder/:folderId
// List all files in a folder
// ─────────────────────────────────────────────
export const getFilesInFolder = asyncHandler(async (req: Request, res: Response) => {
  const folderId = req.params['folderId'] as string
  const files = await fileService.getFilesInFolder(req.user!.id, folderId)
  return sendSuccess(res, 'Files fetched successfully.', { files })
})

// ─────────────────────────────────────────────
// POST /api/files/upload
//
// Two-stage upload flow:
//   Stage 1 — Multer (in routes): saves to uploads/temp/, enforces
//             absolute MAX_UPLOAD_SIZE_MB ceiling, assigns UUID filename.
//   Stage 2 — This controller:
//             • Reads magic bytes via file-type to detect real MIME type.
//               Client-supplied MIME is NOT trusted (extension spoofing).
//             • Calls fileService.uploadFile which runs EnforcementService
//               (type, size, total limit, per-folder limit) then moves
//               file to permanent storage and inserts DB record.
// ─────────────────────────────────────────────
export const uploadFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No file was uploaded.', undefined, ERROR_CODES.VALIDATION_ERROR)
  }

  const body = req.body as Record<string, string>
  const folderId = body['folderId']

  if (!folderId || typeof folderId !== 'string' || !folderId.trim()) {
    try { fs.unlinkSync(req.file.path) } catch (_) { /* ignore */ }
    throw new ApiError(400, 'folderId is required.', undefined, ERROR_CODES.VALIDATION_ERROR)
  }

  // Magic byte MIME detection via file-type v16 (pinned for CommonJS compat).
  // v17+ is ESM-only. require() is intentional here.
  let detectedMime: string
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fileType = require('file-type')
    const result = await fileType.fromFile(req.file.path)
    if (!result) {
      try { fs.unlinkSync(req.file.path) } catch (_) { /* ignore */ }
      throw new ApiError(
        422,
        'Could not detect file type. Please upload a valid file.',
        undefined,
        ERROR_CODES.FILE_TYPE_NOT_ALLOWED
      )
    }
    detectedMime = result.mime
  } catch (err: unknown) {
    // Re-throw our own ApiErrors; wrap anything else as 500
    if (err && typeof err === 'object' && 'statusCode' in err) throw err
    try { fs.unlinkSync(req.file.path) } catch (_) { /* ignore */ }
    throw new ApiError(500, 'Failed to verify file type.', undefined, ERROR_CODES.INTERNAL_ERROR)
  }

  const file = await fileService.uploadFile({
    userId: req.user!.id,
    folderId: folderId.trim(),
    tempFilePath: req.file.path,
    originalName: req.file.originalname,
    mimeType: detectedMime,      // detected MIME, not client-supplied
    sizeBytes: req.file.size,
  })

  return sendSuccess(res, 'File uploaded successfully.', { file }, 201)
})

// ─────────────────────────────────────────────
// GET /api/files/:id/download
//
// Streams file to client through authenticated endpoint.
// uploads/ is NOT statically served — all access goes through here.
// Ownership verified in service (404 on mismatch, never 403).
// ─────────────────────────────────────────────
export const downloadFile = asyncHandler(async (req: Request, res: Response) => {
  const fileId = req.params['id'] as string
  const { filePath, originalName, mimeType, sizeBytes } =
    await fileService.getFileForDownload(req.user!.id, fileId)

  res.setHeader('Content-Type', mimeType)
  // RFC 6266 — filename must be quoted
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`)
  res.setHeader('Content-Length', sizeBytes.toString())
  res.setHeader('Cache-Control', 'private, no-cache')

  const readStream = fs.createReadStream(filePath)
  readStream.pipe(res)

  readStream.on('error', () => {
    // Headers likely already sent — can't switch to JSON error response.
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to stream file.',
        code: ERROR_CODES.INTERNAL_ERROR,
        errors: null,
      })
    }
  })
})

// ─────────────────────────────────────────────
// PUT /api/files/:id/rename
// ─────────────────────────────────────────────
export const renameFileHandler = [
  validate(renameFileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const fileId = req.params['id'] as string
    const body = req.body as { originalName: string }
    const file = await fileService.renameFile(req.user!.id, fileId, body.originalName.trim())
    return sendSuccess(res, 'File renamed successfully.', { file })
  }),
]

// ─────────────────────────────────────────────
// DELETE /api/files/:id
// ─────────────────────────────────────────────
export const deleteFile = asyncHandler(async (req: Request, res: Response) => {
  const fileId = req.params['id'] as string
  await fileService.deleteFile(req.user!.id, fileId)
  return sendSuccess(res, 'File deleted successfully.')
})