import { z } from 'zod'

// ─────────────────────────────────────────────
// RENAME FILE SCHEMA
// ─────────────────────────────────────────────
export const renameFileSchema = z.object({
  originalName: z
    .string()
    .min(1, 'File name is required')
    .max(255, 'File name cannot exceed 255 characters')
    .trim()
    .refine(
      (val) => !/[/\\:*?"<>|]/.test(val),
      'File name contains invalid characters: / \\ : * ? " < > |'
    )
    .refine(
      (val) => val !== '.' && val !== '..',
      'File name cannot be "." or ".."'
    ),
})

export type RenameFileInput = z.infer<typeof renameFileSchema>