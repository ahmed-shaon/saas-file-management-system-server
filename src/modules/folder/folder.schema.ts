import { z } from 'zod'

// CREATE FOLDER
// name: trimmed, non-empty, max 255 chars, no filesystem-illegal chars
// parentId: optional UUID — null/absent means root folder
//
// Zod v4: constructor-level { error: '...' } was removed.
// All messages are attached via chained methods only.

export const createFolderSchema = z.object({
  name: z
    .string()
    .min(1, 'Folder name is required')
    .max(255, 'Folder name cannot exceed 255 characters')
    .trim()
    .refine(
      (val) => !/[/\\:*?"<>|]/.test(val),
      'Folder name contains invalid characters'
    ),
  parentId: z
    .string()
    .uuid('parentId must be a valid UUID')
    .nullable()
    .optional()
    .transform((val) => val ?? null),
})

// RENAME FOLDER
// Only name changes — no reparenting supported

export const renameFolderSchema = z.object({
  name: z
    .string()
    .min(1, 'Folder name is required')
    .max(255, 'Folder name cannot exceed 255 characters')
    .trim()
    .refine(
      (val) => !/[/\\:*?"<>|]/.test(val),
      'Folder name contains invalid characters'
    ),
})

export type CreateFolderInput = z.infer<typeof createFolderSchema>
export type RenameFolderInput = z.infer<typeof renameFolderSchema>