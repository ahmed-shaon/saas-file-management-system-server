import { Request, Response } from 'express'
import path from 'path'
import fs from 'fs'
import { asyncHandler } from '../../utils/asyncHandler'
import { sendSuccess } from '../../utils/ApiResponse'
import { validate } from '../../utils/validate'
import { createFolderSchema, renameFolderSchema } from './folder.schema'
import { checkFolderCreateAllowed } from '../../services/EnforcementService'
import {
  getRootFolders,
  getFolderChildren,
  createFolder,
  renameFolder,
  deleteFolderWithContents,
} from './folder.service'
import { env } from '../../config/env'

// GET ROOT FOLDERS
// GET /api/folders
export const getRootFoldersHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id
    const folders = await getRootFolders(userId)
    return sendSuccess(res, 'Root folders fetched successfully', { folders })
  }
)

// GET FOLDER CHILDREN
// GET /api/folders/:id/children
export const getFolderChildrenHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id
    const folderId = req.params['id'] as string
    const folders = await getFolderChildren(userId, folderId)
    return sendSuccess(res, 'Folder children fetched successfully', { folders })
  }
)

// CREATE FOLDER
// POST /api/folders
// Body: { name, parentId? }
//
// Flow:
//   1. Validate body (Zod)
//   2. Enforcement: folder count + nesting depth
//   3. Create in DB
export const createFolderHandler = [
  validate(createFolderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id
    const { name, parentId } = req.body as { name: string; parentId: string | null }

    await checkFolderCreateAllowed(userId, parentId)

    const folder = await createFolder(userId, name, parentId)

    return sendSuccess(res, 'Folder created successfully', { folder }, 201)
  }),
]

// RENAME FOLDER
// PUT /api/folders/:id
// Body: { name }
export const renameFolderHandler = [
  validate(renameFolderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id
    const folderId = req.params['id'] as string
    const { name } = req.body as { name: string }

    const folder = await renameFolder(userId, folderId, name)

    return sendSuccess(res, 'Folder renamed successfully', { folder })
  }),
]

// DELETE FOLDER (recursive)
// DELETE /api/folders/:id
//
// Deletes the folder, all subfolders, and all files recursively.
// DB transaction runs first — physical disk cleanup runs after.
//
// Why DB first, disk second:
//   If disk cleanup fails, orphaned files can be recovered.
//   If the DB rolled back but files were already deleted from disk,
//   user data is gone permanently. DB consistency takes priority.
export const deleteFolderHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id
    const folderId = req.params['id'] as string

    // Returns storedNames of all deleted files for disk cleanup
    const storedNames = await deleteFolderWithContents(userId, folderId)

    // Delete physical files from disk after DB transaction commits
    const uploadDir = path.join(process.cwd(), env.UPLOAD_DIR, 'files')

    for (const storedName of storedNames) {
      const filePath = path.join(uploadDir, storedName)
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } catch (err) {
        // Log but do not throw — DB records are already deleted.
        // Orphaned disk files can be cleaned up by a maintenance script.
        console.error(`Disk cleanup failed for file: ${filePath}`, err)
      }
    }

    return sendSuccess(res, 'Folder and all its contents deleted successfully')
  }
)