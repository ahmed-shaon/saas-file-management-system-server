import { z } from 'zod'

// Valid file type values — matches Prisma FileType enum
const FILE_TYPE_VALUES = ['IMAGE', 'VIDEO', 'PDF', 'AUDIO'] as const

// ─────────────────────────────────────────────
// CREATE PACKAGE
// ─────────────────────────────────────────────

export const createPackageSchema = z.object({
  name: z
    .string()
    .min(1, 'Package name is required')
    .max(50, 'Package name must not exceed 50 characters')
    .trim(),

  // z.number() constructor options removed — Zod v4 uses chained methods only
  maxFolders: z
    .number()
    .int('Max folders must be a whole number')
    .min(1, 'Max folders must be at least 1')
    .max(99999, 'Max folders cannot exceed 99999'),

  maxNestingLevel: z
    .number()
    .int('Max nesting level must be a whole number')
    .min(1, 'Max nesting level must be at least 1')
    .max(20, 'Max nesting level cannot exceed 20'),

  maxFileSizeMb: z
    .number()
    .int('Max file size must be a whole number')
    .min(1, 'Max file size must be at least 1 MB')
    .max(5000, 'Max file size cannot exceed 5000 MB'),

  totalFileLimit: z
    .number()
    .int('Total file limit must be a whole number')
    .min(1, 'Total file limit must be at least 1')
    .max(99999, 'Total file limit cannot exceed 99999'),

  filesPerFolder: z
    .number()
    .int('Files per folder must be a whole number')
    .min(1, 'Files per folder must be at least 1')
    .max(99999, 'Files per folder cannot exceed 99999'),

  // Must be a non-empty array of valid file type strings
  allowedFileTypes: z
    .array(z.enum(FILE_TYPE_VALUES))
    .min(1, 'At least one file type must be allowed'),

  // null = never expires (Free tier)
  // positive integer = days until expiry
  durationDays: z
    .number()
    .int('Duration must be a whole number')
    .min(1, 'Duration must be at least 1 day')
    .nullable()
    .default(null),
})

export type CreatePackageInput = z.infer<typeof createPackageSchema>

// ─────────────────────────────────────────────
// UPDATE PACKAGE
// All fields are optional — partial update
// Admin can update any combination of fields
// ─────────────────────────────────────────────

export const updatePackageSchema = z.object({
  name: z
    .string()
    .min(1, 'Package name is required')
    .max(50, 'Package name must not exceed 50 characters')
    .trim()
    .optional(),

  maxFolders: z
    .number()
    .int('Max folders must be a whole number')
    .min(1, 'Max folders must be at least 1')
    .max(99999, 'Max folders cannot exceed 99999')
    .optional(),

  maxNestingLevel: z
    .number()
    .int('Max nesting level must be a whole number')
    .min(1, 'Max nesting level must be at least 1')
    .max(20, 'Max nesting level cannot exceed 20')
    .optional(),

  maxFileSizeMb: z
    .number()
    .int('Max file size must be a whole number')
    .min(1, 'Max file size must be at least 1 MB')
    .max(5000, 'Max file size cannot exceed 5000 MB')
    .optional(),

  totalFileLimit: z
    .number()
    .int('Total file limit must be a whole number')
    .min(1, 'Total file limit must be at least 1')
    .max(99999, 'Total file limit cannot exceed 99999')
    .optional(),

  filesPerFolder: z
    .number()
    .int('Files per folder must be a whole number')
    .min(1, 'Files per folder must be at least 1')
    .max(99999, 'Files per folder cannot exceed 99999')
    .optional(),

  allowedFileTypes: z
    .array(z.enum(FILE_TYPE_VALUES))
    .min(1, 'At least one file type must be allowed')
    .optional(),

  durationDays: z
    .number()
    .int('Duration must be a whole number')
    .min(1, 'Duration must be at least 1 day')
    .nullable()
    .optional(),
})

export type UpdatePackageInput = z.infer<typeof updatePackageSchema>

// ─────────────────────────────────────────────
// USER STATUS UPDATE
// Admin activates or deactivates a user
// ─────────────────────────────────────────────

export const updateUserStatusSchema = z.object({
  // z.boolean() with no constructor options — Zod v4 compatible
  isActive: z.boolean(),
})

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>