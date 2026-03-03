import { z } from 'zod'

// ─────────────────────────────────────────────
// SELECT PACKAGE
// User selects a package by its ID
// ─────────────────────────────────────────────

export const selectPackageSchema = z.object({
  packageId: z
    .string()
    .min(1, 'Package ID is required')
    .uuid('Invalid package ID format'),
})

export type SelectPackageInput = z.infer<typeof selectPackageSchema>